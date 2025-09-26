import os
import time
import json
from typing import Any, Dict, List, Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from hybrid_search.py import meili_search, qdrant_query, merge_results, DEFAULT_ALPHA, DEFAULT_LIMIT  # type: ignore

MEILI_URL = os.getenv("MEILI_URL", "http://localhost:7700")
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
ALPHA_DEFAULT = float(os.getenv("ALPHA_DEFAULT", str(DEFAULT_ALPHA)))
RESULTS_LIMIT_MAX = int(os.getenv("RESULTS_LIMIT_MAX", "50"))
ALLOWED_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

app = FastAPI(title="search-api")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Filters(BaseModel):
    source_type: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None

class SearchRequest(BaseModel):
    q: str = Field(..., min_length=1)
    limit: Optional[int] = None
    alpha: Optional[float] = None
    filters: Optional[Filters] = None

class SearchHit(BaseModel):
    id: str
    title: Optional[str] = None
    url_or_path: Optional[str] = None
    snippet: Optional[str] = None
    tags: Optional[List[str]] = None
    source_type: Optional[str] = None
    published_at: Optional[str] = None
    score: float

class SearchResponse(BaseModel):
    hits: List[SearchHit]
    took_ms: int
    meili_ms: int
    qdrant_ms: int
    merge_ms: int
    vector_used: bool

@app.get("/health")
def health() -> Dict[str, Any]:
    return {"ok": True}

@app.post("/search", response_model=SearchResponse)
async def search(req: SearchRequest, request: Request):
    start = time.time()
    q = (req.q or "").strip()
    if not q:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    limit = req.limit or DEFAULT_LIMIT
    limit = max(1, min(limit, RESULTS_LIMIT_MAX))

    alpha = req.alpha if req.alpha is not None else ALPHA_DEFAULT
    alpha = max(0.0, min(alpha, 1.0))

    filters = req.filters.dict() if req.filters else None

    # Lexical
    t0 = time.time()
    try:
        lex = meili_search(q, filters, limit=50)
        meili_ms = int((time.time() - t0) * 1000)
    except Exception as e:
        # Meili down → fail hard for PoC (or choose to return 503)
        raise HTTPException(status_code=503, detail="Meilisearch unavailable") from e

    # Vector
    t1 = time.time()
    vector_used = True
    try:
        vec = qdrant_query(q, limit=50)
        qdrant_ms = int((time.time() - t1) * 1000)
    except Exception:
        vec = []
        qdrant_ms = int((time.time() - t1) * 1000)
        vector_used = False

    # Merge
    t2 = time.time()
    merged = merge_results(lex, vec, alpha)
    results = []
    for r in merged[:limit]:
        results.append({
            "id": r.get("id"),
            "title": r.get("title"),
            "url_or_path": r.get("url_or_path"),
            "snippet": r.get("snippet"),
            "tags": r.get("tags"),
            "source_type": r.get("source_type"),
            "published_at": r.get("published_at"),
            "score": float(r.get("hybrid_score", 0.0)),
        })
    merge_ms = int((time.time() - t2) * 1000)

    took_ms = int((time.time() - start) * 1000)

    # Log
    top3 = [h["id"] for h in results[:3]]
    print(json.dumps({
        "ts": int(time.time()*1000), "q": q, "filters": filters, "alpha": alpha, "limit": limit,
        "took_ms": took_ms, "meili_ms": meili_ms, "qdrant_ms": qdrant_ms, "merge_ms": merge_ms,
        "top3": top3, "vector_used": vector_used,
        "ip": request.client.host if request.client else None,
    }))

    return SearchResponse(
        hits=[SearchHit(**h) for h in results],
        took_ms=took_ms,
        meili_ms=meili_ms,
        qdrant_ms=qdrant_ms,
        merge_ms=merge_ms,
        vector_used=vector_used,
    )

@app.get("/facets")
async def facets():
    # Minimal placeholder: returns empty counts; implement later with Meili facets
    return {"source_type": {}, "tags": {}}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8080, reload=True)
