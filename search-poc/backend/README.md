# search-api (FastAPI)

## Env
- MEILI_URL (e.g., http://localhost:7700)
- MEILI_MASTER_KEY
- QDRANT_URL (e.g., http://localhost:6333)
- EMBEDDING_MODEL (e.g., sentence-transformers/all-MiniLM-L6-v2)
- EMBEDDING_DIM (e.g., 384)
- ALPHA_DEFAULT (default 0.6)
- RESULTS_LIMIT_MAX (default 50)
- CORS_ORIGINS (comma-separated, default http://localhost:3000)

## Run
```bash
uvicorn app:app --reload --port 8080
```

## Endpoints

### GET /health
Returns overall status (200 if API alive; extend to ping engines).

### POST /search
Input:
```json
{ "q": "refund policy", "limit": 10, "alpha": 0.6,
  "filters": { "source_type": ["web"], "tags": ["policy"], "date_from": "2024-01-01", "date_to": "2026-01-01" } }
```
Output (per hit):
```json
{ "id": "web-1", "title": "Returns Policy", "url_or_path": "https://...",
  "snippet": "...", "tags": ["web","policy"], "source_type": "web",
  "published_at": "2025-01-15", "score": 0.92 }
```
Notes:
- Lexical Top-50 (Meili) + Vector Top-50 (Qdrant)
- Normalize → hybrid = α·lex + (1−α)·vec
- Tie-breakers: exact title, freshness, alphabetical
- Guards: clamp `limit` ≤ RESULTS_LIMIT_MAX, `alpha`∈[0,1], 400 on empty `q`
- Fallbacks: if Qdrant/embeddings fail → lexical-only with `vector_used=false`

### GET /facets (first pass)
Returns counts for `source_type` and top tags (placeholder; wire up later).

## Embeddings
- Query embeddings computed server-side with SentenceTransformers
- Target: sub-100ms per query on local CPU is acceptable
- Failure → continue with lexical-only; set `vector_used=false`

## Logging
Per request (stdout JSON):
```json
{ "ts": 1700000000000, "q": "refund policy", "filters": {"source_type":["web"]},
  "alpha": 0.6, "limit": 10, "took_ms": 120, "meili_ms": 35, "qdrant_ms": 40, "merge_ms": 5,
  "top3": ["web-1","doc-1","product-MAL-001"], "vector_used": true, "ip": "127.0.0.1" }
```
Privacy: do not log full snippets or PII.

## Security & CORS
- CORS: restrict to your frontend origin via `CORS_ORIGINS`
- Rate limit: add at reverse proxy or integrate simple limiter (PoC)
- Keep Meili key server-side only; never expose to frontend

## Smoke tests (manual)
- GET /health → 200
- POST /search q="returns policy" → policy page top; vector_used=true
- POST /search q="return an item" alpha=0.5 → policy top-3
- POST /search q="healing crystal" → gemstone product top-3
- POST /search q="agarbatti" → incense appears via synonyms
- POST /search filters pdf only → only docs
- POST /search q="" → 400

## Errors
- Meili unreachable → 503 { message }
- Qdrant unreachable → lexical-only { vector_used:false }
- Embedding failure → lexical-only { vector_used:false }
- Timeouts (set ~2–3s per backend) → partial results if possible
