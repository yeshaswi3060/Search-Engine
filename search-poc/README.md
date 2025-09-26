# Search PoC — Data Collection & Organization (Phase 0)

This directory contains the data layout for the search engine PoC. It organizes raw inputs, curated rules, interim selections, and final outputs ready for indexing into Meilisearch and Qdrant.

## Directory Structure

```
/search-poc/
  /data/
    /raw/           # original unmodified data
      /web/         # web: seeds.txt (list of starting URLs)
      /docs/        # local PDFs/DOCX/PPTX
      /catalog/     # raw export from product system
    /curated/       # allow/block lists, synonyms, tag maps
    /interim/       # cleaned selections and manifests
    /final/         # the ready-to-index files
```

## What goes inside

- `data/raw/web/seeds.txt`: starting URLs or sitemap links, one per line
- `data/raw/docs/`: drop all relevant PDFs/DOCX/PPTX you want searchable
- `data/raw/catalog/products_raw.csv`: raw product export from your product system
- `data/curated/`:
  - `urls_allowlist.txt`: domains/paths to crawl
  - `urls_blocklist.txt`: paths to exclude (e.g., `/cart`, `/login`)
  - `product_synonyms.csv`: bidirectional synonyms pairs (e.g., `GST,tax`)
  - `tags_map.csv`: map product categories to unified tags
- `data/interim/`:
  - `page_list.csv`: cleaned list of URLs we actually keep
  - `docs_manifest.csv`: list of docs with quick notes/tags
  - `products_selected.csv`: trimmed catalog with only useful columns
- `data/final/`:
  - `corpus.jsonl`: final unified dataset (one JSON per line)
  - `products_clean.csv`: cleaned catalog for product-only view

## `corpus.jsonl` schema
Each line is a standalone JSON object:

```json
{
  "id": "unique-id",
  "source_type": "web|pdf|product",
  "title": "Title of item",
  "url_or_path": "URL or file path",
  "content_text": "Plain text body/content",
  "tags": ["tag1", "tag2"],
  "published_at": "YYYY-MM-DD",
  "metadata": { "extra_fields": "like price, sku, author" }
}
```

Notes:
- `id`: must be stable and unique across the whole corpus
- `source_type`: one of `web`, `pdf`, `product`
- `content_text`: plain-text only (no markup)
- `tags`: free-form labels; use `tags_map.csv` to normalize
- `published_at`: use ISO date; if unknown, omit or set `null`
- `metadata`: flexible object for source-specific fields (e.g., `sku`, `price`, `author`, `mime_type`)

## CSV templates

- `product_synonyms.csv`: columns: `term_a,term_b`
- `tags_map.csv`: columns: `category,tag`
- `page_list.csv`: columns: `url,title,tags`
- `docs_manifest.csv`: columns: `file_path,title,notes,tags`
- `products_selected.csv`: columns: `sku,name,category,price,currency,url,tags`
- `products_clean.csv`: same as `products_selected.csv` or a subset you choose
- `products_raw.csv`: raw dump; recommended columns: `sku,name,description,category,price,currency,url`

Filling guidance:
- `tags`: use `;` to separate multiple tags within a single CSV cell
- Keep UTF-8 encoding
- Prefer absolute file paths for docs if processing outside this repo; otherwise relative paths from `data/raw/docs/`
