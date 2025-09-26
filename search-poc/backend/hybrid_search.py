import os
import json
import math
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import requests
from qdrant_client import QdrantClient
from qdrant_client.http.models import PointStruct
from sentence_transformers import SentenceTransformer

MEILI_URL = os.getenv("MEILI_URL", "http://localhost:7700")
MEILI_KEY = os.getenv("MEILI_MASTER_KEY", "master")
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "384"))

MEILI_INDEX = os.getenv("MEILI_INDEX", "docs")
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "docs_vec")
DEFAULT_ALPHA = float(os.getenv("ALPHA", "0.6"))
DEFAULT_LIMIT = int(os.getenv("LIMIT", "10"))

_session = requests.Session()
_session.headers.update({
    "Authorization": f"Bearer {MEILI_KEY}",
    "Content-Type": "application/json",
})

_model: Optional[SentenceTransformer] = None

def get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(EMBEDDING_MODEL)
    return _model

# ========== Lexical (Meili) ==========

def meili_search(q: str, filters: Optional[Dict[str, Any]], limit: int = 50) -> List[Dict[str, Any]]:
    payload: Dict[str, Any] = {
        "q": q,
        "limit": limit,
        "attributesToRetrieve": ["id", "title", "url_or_path", "tags", "published_at", "source_type"],
        "attributesToHighlight": ["content_text"],
        "highlightPreTag": "<em>",
        "highlightPostTag": "</em>",
    }
    if filters:
        filter_clauses: List[str] = []
        if "source_type" in filters:
            types = filters["source_type"]
            if isinstance(types, list):
                or_clause = " OR ".join([f"source_type = '{t}'" for t in types])
                filter_clauses.append(f"({or_clause})")
            else:
                filter_clauses.append(f"source_type = '{types}'")
        if "tags" in filters and filters["tags"]:
            tags = filters["tags"]
            and_clause = " AND ".join([f"tags = '{t}'" for t in tags])
            filter_clauses.append(f"({and_clause})")
        date_from = filters.get("date_from")
        date_to = filters.get("date_to")
        if date_from:
            filter_clauses.append(f"published_at >= {json.dumps(date_from)}")
        if date_to:
            filter_clauses.append(f"published_at <= {json.dumps(date_to)}")
        if filter_clauses:
            payload["filter"] = " AND ".join(filter_clauses)
    resp = _session.post(f"{MEILI_URL}/indexes/{MEILI_INDEX}/search", data=json.dumps(payload), timeout=15)
    resp.raise_for_status()
    data = resp.json()
    hits = data.get("hits", [])
    # Attach rank-based score proxy
    for i, h in enumerate(hits):
        h["lex_rank"] = i + 1
        h["lex_score"] = 1.0 / h["lex_rank"]
        # Best snippet if available
        if "_formatted" in h and "content_text" in h["_formatted"]:
            h["snippet"] = h["_formatted"]["content_text"]
    return hits

# ========== Vector (Qdrant) ==========

def qdrant_query(q: str, limit: int = 50) -> List[Dict[str, Any]]:
    model = get_model()
    vec = model.encode([q], normalize_embeddings=False)[0].tolist()
    client = QdrantClient(url=QDRANT_URL)
    search_res = client.search(
        collection_name=QDRANT_COLLECTION,
        query_vector=vec,
        limit=limit,
        with_payload=True,
    )
    results: List[Dict[str, Any]] = []
    for r in search_res:
        results.append({
            "id": r.payload.get("id", r.id),
            "title": r.payload.get("title"),
            "url_or_path": r.payload.get("url_or_path"),
            "source_type": r.payload.get("source_type"),
            "vec_score": float(r.score),
        })
    return results

# ========== Merge ==========

def normalize_scores(items: List[Dict[str, Any]], key: str) -> None:
    if not items:
        return
    max_val = max((it.get(key, 0.0) or 0.0) for it in items)
    if max_val <= 0:
        for it in items:
            it[f"{key}_norm"] = 0.0
        return
    for it in items:
        it[f"{key}_norm"] = (it.get(key, 0.0) or 0.0) / max_val


def merge_results(lex: List[Dict[str, Any]], vec: List[Dict[str, Any]], alpha: float) -> List[Dict[str, Any]]:
    normalize_scores(lex, "lex_score")
    normalize_scores(vec, "vec_score")

    by_id: Dict[str, Dict[str, Any]] = {}
    for h in lex:
        rid = h.get("id")
        if rid is None:
            continue
        by_id[rid] = {
            "id": rid,
            "title": h.get("title"),
            "url_or_path": h.get("url_or_path"),
            "source_type": h.get("source_type"),
            "published_at": h.get("published_at"),
            "snippet": h.get("snippet"),
            "lex_norm": h.get("lex_score_norm", h.get("lex_score", 0.0)),
            "vec_norm": 0.0,
        }
    for v in vec:
        rid = v.get("id")
        if rid is None:
            continue
        if rid not in by_id:
            by_id[rid] = {
                "id": rid,
                "title": v.get("title"),
                "url_or_path": v.get("url_or_path"),
                "source_type": v.get("source_type"),
                "published_at": v.get("published_at"),
                "snippet": None,
                "lex_norm": 0.0,
                "vec_norm": v.get("vec_score_norm", v.get("vec_score", 0.0)),
            }
        else:
            by_id[rid]["vec_norm"] = v.get("vec_score_norm", v.get("vec_score", 0.0))

    results = list(by_id.values())

    # Hybrid score
    for r in results:
        r["hybrid_score"] = alpha * r.get("lex_norm", 0.0) + (1.0 - alpha) * r.get("vec_norm", 0.0)

    # Tie-breakers
    def tie_key(r: Dict[str, Any]) -> Tuple:
        exact_title = 1 if r.get("title", "").strip().lower() == q_global.strip().lower() else 0
        pub = r.get("published_at") or "0000-00-00"
        return (
            -exact_title,                 # exact title wins
            -(pub or "")[0:10],         # newer wins (lexicographic ISO date)
            r.get("title") or "",       # alphabetical last
        )

    results.sort(key=lambda r: (-r["hybrid_score"], tie_key(r)))
    return results

# ========== CLI ==========

q_global = ""

def search(q: str, filters: Optional[Dict[str, Any]] = None, limit: int = DEFAULT_LIMIT, alpha: float = DEFAULT_ALPHA) -> List[Dict[str, Any]]:
    global q_global
    q_global = q
    lex = meili_search(q, filters, limit=50)
    vec = qdrant_query(q, limit=50)
    merged = merge_results(lex, vec, alpha)
    return merged[:limit]

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Hybrid search (Meili + Qdrant)")
    parser.add_argument("q", type=str, help="query text")
    parser.add_argument("--alpha", type=float, default=DEFAULT_ALPHA)
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT)
    parser.add_argument("--source_type", type=str, nargs="*", help="filter by source types")
    parser.add_argument("--tags", type=str, nargs="*", help="filter by tags")
    parser.add_argument("--date_from", type=str)
    parser.add_argument("--date_to", type=str)
    args = parser.parse_args()

    filters: Dict[str, Any] = {}
    if args.source_type:
        filters["source_type"] = args.source_type
    if args.tags:
        filters["tags"] = args.tags
    if args.date_from:
        filters["date_from"] = args.date_from
    if args.date_to:
        filters["date_to"] = args.date_to

    results = search(args.q, filters=filters or None, limit=args.limit, alpha=args.alpha)
    print(json.dumps(results, indent=2, ensure_ascii=False))
