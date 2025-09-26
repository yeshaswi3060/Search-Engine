# React Frontend (Vite + TS)

## Install & run
```bash
cd search-poc/frontend-react
npm install
npm run dev
```
Open `http://localhost:5173`.

Set API base via env (optional):
- Create `.env` with `VITE_API_BASE=http://localhost:8080`

## Features
- Matches the single-page spec: header/status, search + alpha, chips, tags, results, footer
- Debounced search (350ms), Enter to search
- CORS: backend should allow `http://localhost:5173`
