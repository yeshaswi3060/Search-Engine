# Frontend (Single Page)

Open `index.html` in a local web server so CORS works cleanly.

Quick start (Python http.server):
```bash
cd search-poc/frontend
python -m http.server 5173
```
Then open `http://localhost:5173`.

Configure API base in `app.js` if needed (default http://localhost:8080).

Features:
- Header with status dot (from /health)
- Search input + alpha slider (0–1)
- Filter chips (All/Web/Docs/Products)
- Tags dropdown (populated from /facets)
- Results cards with title, badge, snippet, tags, date, URL
- Pagination (Prev/Next) and footer metrics (time, result count, Vector ON/OFF)

States implemented:
- Initial prompt, loading spinner, empty, and error banner with retry (search button)

Manual test script: follow Phase 5 steps in the main run sheet.
