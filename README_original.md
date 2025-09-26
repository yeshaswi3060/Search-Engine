# Search PoC — One-Command Run

## Prerequisites
- Docker Desktop
- 6–8 GB free RAM

## Environment (optional overrides)
- `MEILI_MASTER_KEY` (default: `master`)
- `EMBEDDING_MODEL` (default: `sentence-transformers/all-MiniLM-L6-v2`)
- `EMBEDDING_DIM` (default: `384`)
- `ALPHA_DEFAULT` (default: `0.6`)
- Ports: Meili 7700, Qdrant 6333, API 8080, UI 3000

## Required folders
- `./data/meili`
- `./data/qdrant`
- `./search-poc/data/final` (ensure `corpus.jsonl` exists for later indexing)

## Run (single command)
```bash
docker compose up -d --build
```
- UI: http://localhost:3000
- API: http://localhost:8080
- Meili: http://localhost:7700
- Qdrant: http://localhost:6333

## Smoke test
1) Open UI → run queries: "returns policy", "healing crystal", "company profile"
2) Check API health: http://localhost:8080/health (engines green)
3) Expect results < 1s; Vector pill ON

## Notes
- Keys are server-side only; Meili/Qdrant are not exposed to the browser directly beyond local ports.
- For development only. Do not expose Meili/Qdrant publicly in cloud.
