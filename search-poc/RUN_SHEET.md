# Search PoC — Phase 1 Run Sheet

## Services
- Meilisearch: port 7700
- Qdrant: port 6333

## Secrets / Config
- Meilisearch master key: `master` (local)
- Embedding model dimension: `384` (e.g., MiniLM; adjust if you pick a different model)

## Local persistence folders
- `./data/meili` (Meili data)
- `./data/qdrant` (Qdrant storage)

## Start containers (local)
1) Ensure folders exist: `./data/meili`, `./data/qdrant`.
2) Start:
```bash
docker compose up -d
```
- Ports mapped: 7700→Meili, 6333→Qdrant
- Volumes mounted: `./data/meili:/meili_data`, `./data/qdrant:/qdrant/storage`

Done when: Both containers show as running in Docker Desktop or `docker ps`.

## Health & reachability checks (browser)
- Open `http://localhost:7700` → Meilisearch should respond (welcome/JSON health)
- Open `http://localhost:6333` → Qdrant should respond (JSON health)

Done when: Both URLs respond without errors.

## Lock it down (local only)
- Confirm firewall allows localhost-only access.
- Note: In cloud, do NOT expose Meili/Qdrant directly—only the backend will talk to them.
- One-liner: Meili & Qdrant are local-only in PoC.

## API client prep (no calls yet)
Create two collections/environments in your API client (Postman/Bruno/Insomnia):
- Meili: Base URL `http://localhost:7700`, Auth header `Authorization: Bearer master`
- Qdrant: Base URL `http://localhost:6333`

Done when: Both saved and ready.

## First index/collection plan (spec only)
- Meilisearch index: `docs`
  - Searchable: `title`, `content_text`, `tags`
  - Filterable: `source_type`, `tags`, `published_at` (+ optional product facets: `brand`, `category`, `price`)
  - Sortable: `published_at` (add `price` later)
  - Synonyms: from `search-poc/data/curated/product_synonyms.csv`
- Qdrant collection: `docs_vec`
  - Distance: `COSINE`
  - Vector size: `384` (match model dimension above)

## Dry-run indexing plan (Phase 2 preview)
- Source: `search-poc/data/final/corpus.jsonl`
- Do in parallel:
  - Send records (without vectors) to Meili index `docs`
  - Send vectors (one per record) to Qdrant collection `docs_vec`
- Matching rule: use the same `id` in both systems.
- Qdrant payload suggestion: `{ id, title, url_or_path }`

## Acceptance criteria (Phase 1)
- ✅ Containers up, reachable at `localhost:7700` and `localhost:6333`
- ✅ Local persistence folders exist and receive files
- ✅ Run sheet written (keys, ports, vector size, index/collection names, fields, synonyms plan)
- ✅ API client profiles saved for Meili & Qdrant (no requests yet)

---

## Test slice (A)
Selected 7 records (IDs → titles):
- ex-web-001 → Introduction
- web-1 → Returns Policy
- web-2 → FAQ
- doc-1 → Company Profile
- doc-2 → Vastu Guidelines
- product-MAL-001 → Red Agate Stone
- product-MAL-002 → Incense Sticks

Pass if: List spans web/pdf/product.

## Meilisearch config (B)
- Base: `http://localhost:7700`, Auth: `Bearer master`
- Index: `docs`
- Settings plan:
  - Searchable: `title`, `content_text`, `tags`
  - Filterable: `source_type`, `tags`, `published_at`
  - Sortable: `published_at`
  - Synonyms: from `search-poc/data/curated/product_synonyms.csv`
- Tasks log: Record task IDs/responses here.

## Load 5–10 records into Meili (C)
- Source: `search-poc/data/final/corpus.jsonl` (use the 7 IDs above)
- Add docs to `docs` index; wait on task completion; verify by search.

## Qdrant config (D)
- Base: `http://localhost:6333`
- Collection: `docs_vec`
  - Distance: `COSINE`
  - Vector size: `384`

## Load 5–10 vectors (E)
- For the same IDs, upsert vectors to `docs_vec`
- Payload: `{ id, title, url_or_path, source_type }`
- Verify with scroll/list points.

## Smoke test (F)
- Meili: keyword queries → expect relevant hits (e.g., refund, gemstone, company)
- Qdrant: planned queries → "return an item", "healing crystal"

## Consistency check (G)
- Each selected ID present in Meili + Qdrant
- Spot-check `content_text` quality by source type

## Synonyms (H)
- Apply 3–5 key pairs (refund↔return, GST↔tax, incense↔agarbatti)
- Verify: synonym term returns expected docs

## Pass/Fail Table (I)
Checkpoint | How to verify | Result | Notes
---|---|---|---
Meili reachable | Open localhost:7700 |  | 
Qdrant reachable | Open localhost:6333 |  | 
Meili index settings applied | API client task status |  | 
5–10 docs in Meili | Search by keyword |  | 
Qdrant collection created | List collections |  | 
5–10 vectors in Qdrant | Scroll/list points |  | 
IDs consistent | Cross-check mapping |  | 
Synonyms working | Search synonym term |  | 

## Troubleshooting (J)
- Meili: verify index name, fields, and tasks status
- Qdrant: collection name/ID match; upsert payload
- PDFs blank: needs OCR/parser later
- Synonyms: ensure applied and re-run search

---

## API examples (copy/paste or adapt in your client)

### Meilisearch — create index and apply settings
```bash
# Create index `docs`
curl -X POST 'http://localhost:7700/indexes' \
  -H 'Authorization: Bearer master' \
  -H 'Content-Type: application/json' \
  -d '{"uid":"docs"}'

# Settings: searchable, filterable, sortable
curl -X PATCH 'http://localhost:7700/indexes/docs/settings' \
  -H 'Authorization: Bearer master' \
  -H 'Content-Type: application/json' \
  -d '{
    "searchableAttributes": ["title","content_text","tags"],
    "filterableAttributes": ["source_type","tags","published_at"],
    "sortableAttributes": ["published_at"]
  }'

# Synonyms (3 sample pairs)
curl -X PATCH 'http://localhost:7700/indexes/docs/settings/synonyms' \
  -H 'Authorization: Bearer master' \
  -H 'Content-Type: application/json' \
  -d '{
    "refund": ["return"],
    "return": ["refund"],
    "GST": ["tax"],
    "tax": ["GST"],
    "incense": ["agarbatti"],
    "agarbatti": ["incense"]
  }'

# Add 7 test docs (slice)
cat > /tmp/docs.json <<'JSON'
[
  {"id":"ex-web-001","source_type":"web","title":"Introduction","url_or_path":"https://example.com/docs/intro","content_text":"Welcome to the docs.","tags":["docs","getting-started"],"published_at":"2024-01-15"},
  {"id":"web-1","source_type":"web","title":"Returns Policy","url_or_path":"https://shop.malyam.com/pages/returns-policy","content_text":"You can return items within 30 days of purchase.","tags":["web","policy","malyam"],"published_at":"2025-01-15"},
  {"id":"web-2","source_type":"web","title":"FAQ","url_or_path":"https://example.com/faq","content_text":"Frequently asked questions about our services and policies.","tags":["web","faq"],"published_at":"2024-09-01"},
  {"id":"doc-1","source_type":"pdf","title":"Company Profile","url_or_path":"data/raw/docs/company_profile.pdf","content_text":"Malyam Technology provides vastu and astrology based solutions.","tags":["pdf","company"],"published_at":"2024-12-10"},
  {"id":"doc-2","source_type":"pdf","title":"Vastu Guidelines","url_or_path":"data/raw/docs/vastu_guidelines.docx","content_text":"Guidelines for house layout according to Vastu principles.","tags":["pdf","vastu"],"published_at":"2024-11-05"},
  {"id":"product-MAL-001","source_type":"product","title":"Red Agate Stone","url_or_path":"https://shop.malyam.com/products/red-agate","content_text":"Natural red agate gemstone for positivity and healing.","tags":["product","gemstone"],"published_at":"2025-02-01"},
  {"id":"product-MAL-002","source_type":"product","title":"Incense Sticks","url_or_path":"https://shop.malyam.com/products/incense-sticks","content_text":"Premium sandalwood incense sticks.","tags":["product","incense"],"published_at":"2025-02-10"}
]
JSON

curl -X POST 'http://localhost:7700/indexes/docs/documents?primaryKey=id' \
  -H 'Authorization: Bearer master' \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/docs.json

# Search by title keyword (example)
curl 'http://localhost:7700/indexes/docs/search' \
  -H 'Authorization: Bearer master' \
  -H 'Content-Type: application/json' \
  -d '{"q":"Returns"}'
```

### Qdrant — create collection and upsert points
```bash
# Create collection docs_vec (COSINE, 384)
curl -X PUT 'http://localhost:6333/collections/docs_vec' \
  -H 'Content-Type: application/json' \
  -d '{
    "vectors": { "size": 384, "distance": "Cosine" }
  }'

# Upsert 2 example vectors (use your real embeddings later)
cat > /tmp/points.json <<'JSON'
{
  "points": [
    {
      "id": "web-1",
      "vector": [0.01, 0.02, 0.03, 0.04],
      "payload": {"id":"web-1","title":"Returns Policy","url_or_path":"https://shop.malyam.com/pages/returns-policy","source_type":"web"}
    },
    {
      "id": "product-MAL-001",
      "vector": [0.05, 0.01, 0.02, 0.00],
      "payload": {"id":"product-MAL-001","title":"Red Agate Stone","url_or_path":"https://shop.malyam.com/products/red-agate","source_type":"product"}
    }
  ]
}
JSON

curl -X PUT 'http://localhost:6333/collections/docs_vec/points?wait=true' \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/points.json

# List points (scroll)
curl -X POST 'http://localhost:6333/collections/docs_vec/points/scroll' \
  -H 'Content-Type: application/json' \
  -d '{"limit": 10, "with_payload": true, "with_vectors": false}'
```

---

## Hybrid query & scoring strategy (Phase 3)

### A) Query + scoring
- Lexical (Meilisearch): fetch Top-50 with fields: `id,title,url_or_path,tags,published_at` and highlight/snippet; score proxy = `1/(rank)`.
- Vector (Qdrant): query embedding → Top-50 cosine scores; normalize by max.
- Hybrid score: `hybrid = α * lexical_norm + (1 - α) * vector_norm`, start `α = 0.6` (try 0.5/0.7).
- Tie-breakers: exact title match, newer `published_at`, higher product CTR (future), then alphabetical by `title`.

### B) API inputs & filters (backend)
- `q` (string)
- `filters` (object): `source_type in {web,pdf,product}`, `tags` (array), `date_from/date_to`; product-specific later: `brand,category,price_min,price_max`
- `limit` (int, default 10)
- `alpha` (float 0–1, default 0.6)

### C) Snippet & display
- Show: `title` (linked), truncated `url_or_path`, `tags`, `published_at` if present
- Snippet: 1–2 sentences around best lexical match (use Meili highlight when available)
- Source badge: Web / Doc / Product
- Product extras later: `price`, `brand`, small `image`

### D) Facets & sorting
- Facets: `source_type`, `tags`
- Sorting: default by `hybrid` score; optional toggles → newest by `published_at`, product `price` asc/desc (later)

### E) Gold set (20–40 queries)
- Policy & support: "refund policy", "gst on gemstone"
- Docs: "company profile", "vastu guidelines"
- Products: "healing crystal", "agarbatti", "vastu tape yellow"
- Synonyms & typos: "return an item", "cristal for positivity", "tax on returns"
- For each query: list Top-5 expected IDs (order flexible)

### F) Tuning loop
- Baseline `α=0.6`; run gold set; track Hit@5 and Order OK
- If navigational not Top-1/Top-3 → boost title influence or try `α=0.7`
- If semantic misses → try `α=0.5`; confirm vectors exist
- Synonyms sanity: refund↔return, GST↔tax, incense↔agarbatti
- Freshness tweak: +5–10% for `published_at` within 6 months
- Stop when Hit@5 ≥ 80% or note next steps

### G) Pass/Fail checklist (Phase 3)
- ✅ Hybrid ranking defined (α, normalization, tie-breakers)
- ✅ Inputs/filters documented
- ✅ Snippet/display rules documented
- ✅ Facets and default sort defined
- ✅ 20–40-query gold set created
- ✅ α tested at 0.5 / 0.6 / 0.7 with notes
- ✅ Synonyms visibly help at least 2 queries
- ✅ Freshness tweak improves at least 1 ordering
- ✅ Hit@5 ≥ 80% (or next steps)

### H) Troubleshooting heuristics
- Navigational page not on top → raise title weight or α=0.7
- Meaning queries miss → α=0.5, verify vectors present
- Products dominate mixed queries → cap per `source_type` or dampen products for non-product intent
- Docs with no text → mark for OCR/parsing (Phase 4)
- Duplicates across sources → prefer product for buying intent; web/doc for info

---

## Evaluation plan (Phase 6)

### Metrics
- Hit@5 ≥ 80%
- NDCG@10 (lightweight notes acceptable)
- Time-to-Result < 1s
- Zero-Result Rate < 5%
- Early-CTR (ranks 1–3 vs 4–10) if clicks tracked

### Gold set
- 20–40 queries across: Navigational, Semantic, Docs, Synonym/typo, Filters
- Each query lists 2–5 expected IDs

### Tuning levers (order)
1) α balance: start 0.6; test 0.5 and 0.7
2) Title boost for navigational
3) Synonyms: add 5–10 from misses
4) Freshness: +5–10% if published_at < 180 days
5) Source balancing: dampen/boost products by intent
6) De-dupe near-identicals

### Weekly analytics loop
- Logs: ts, q, alpha, filters, took_ms, vector_used, top3_ids; clicks optional
- Dashboard: top queries, zero-results, Hit@5 trend, CTR, P50/P95 latency
- Actions: add synonyms, clean junk pages, ingest gaps, adjust α per intent

### Intent-aware α presets
- Navigational: α ≈ 0.7
- Semantic: α ≈ 0.5–0.6
- Product intent: α ≈ 0.6 + small product boost

### Test script (per iteration)
- Run all at α=0.6 → record Hit@5
- Re-run navigational at α=0.7; semantic at α=0.5 → record deltas
- Add 3–5 synonyms from misses and re-run
- Apply freshness boost and verify ordering
- Resolve zero-results; keep took_ms < 1s

### Acceptance (Phase 6)
- ✅ Gold set (20–40 queries) exists
- ✅ Relevance log shows before/after for α, synonyms, freshness
- ✅ Default α chosen + two presets
- ✅ Synonyms ≥ 15 pairs
- ✅ Zero-result queries analyzed and acted
- ✅ Simple dashboard (queries, zero, Hit@5, latency)
- ✅ Time-to-Result < 1s consistently

### Troubleshooting
- Missing retrieval: ensure text present, tags, embedding exists
- Low rank: increase title weight or α; add synonym
- Too many products: dampen product unless product intent
- Latency spikes: reduce Top-K (e.g., 50→30) while keeping limit=10
