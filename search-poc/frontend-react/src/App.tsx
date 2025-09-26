import { useEffect, useMemo, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080'

type Filters = {
  source_type?: string[]
  tags?: string[]
  date_from?: string
  date_to?: string
}

type Hit = {
  id: string
  title?: string
  url_or_path?: string
  snippet?: string
  tags?: string[]
  source_type?: 'web' | 'pdf' | 'product'
  published_at?: string
  score: number
}

type SearchResponse = {
  hits: Hit[]
  took_ms: number
  meili_ms: number
  qdrant_ms: number
  merge_ms: number
  vector_used: boolean
}

function StatusDot({ ok }: { ok: boolean | null }) {
  const cls = ok === null ? 'gray' : ok ? 'green' : 'red'
  const title = ok === null ? 'Unknown' : ok ? 'Healthy' : 'Unreachable'
  return <span className={`status-dot ${cls}`} title={title} />
}

function Badge({ type }: { type?: Hit['source_type'] }) {
  const label = type === 'pdf' ? 'Doc' : type === 'product' ? 'Product' : 'Web'
  const cls = type === 'product' ? 'product' : type === 'pdf' ? 'pdf' : 'web'
  return <span className={`badge ${cls}`}>{label}</span>
}

function Card({ h }: { h: Hit }) {
  const url = h.url_or_path || '#'
  const title = h.title || h.id
  const pub = h.published_at ? new Date(h.published_at).toLocaleDateString() : ''
  return (
    <div className="card">
      <div className="title">
        <a href={url} target="_blank" rel="noreferrer noopener">{title}</a>
        <Badge type={h.source_type} />
      </div>
      <div className="snippet" dangerouslySetInnerHTML={{ __html: h.snippet || '' }} />
      <div className="meta">
        {(h.tags || []).map(t => <span key={t} className="tag">{t}</span>)}
        {pub && <span>{pub}</span>}
        <div className="url" title={url}>{url}</div>
      </div>
    </div>
  )
}

export default function App() {
  const [q, setQ] = useState('')
  const [alpha, setAlpha] = useState(0.6)
  const [type, setType] = useState<'all' | 'web' | 'pdf' | 'product'>('all')
  const [tags, setTags] = useState<string[]>([])
  const [tagsOptions, setTagsOptions] = useState<string[]>([])
  const [health, setHealth] = useState<boolean | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hits, setHits] = useState<Hit[]>([])
  const [tookMs, setTookMs] = useState(0)
  const [vectorUsed, setVectorUsed] = useState(false)

  const filters: Filters | undefined = useMemo(() => {
    const f: Filters = {}
    if (type !== 'all') f.source_type = [type]
    if (tags.length) f.tags = tags
    return Object.keys(f).length ? f : undefined
  }, [type, tags])

  useEffect(() => {
    fetch(`${API_BASE}/health`).then(r => setHealth(r.ok)).catch(() => setHealth(false))
    fetch(`${API_BASE}/facets`).then(r => r.json()).then(d => setTagsOptions(Object.keys(d.tags || {}))).catch(() => {})
  }, [])

  // Debounce search
  useEffect(() => {
    if (!q.trim()) { setHits([]); return }
    setLoading(true)
    setError(null)
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      fetch(`${API_BASE}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q, limit: 10, alpha, filters }),
        signal: ctrl.signal,
      })
        .then(async r => {
          if (!r.ok) throw new Error(String(r.status))
          const data: SearchResponse = await r.json()
          setHits(data.hits || [])
          setTookMs(data.took_ms || 0)
          setVectorUsed(!!data.vector_used)
        })
        .catch(e => setError(e.message || String(e)))
        .finally(() => setLoading(false))
    }, 350)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q, alpha, filters])

  return (
    <>
      <header className="header">
        <div className="title"><span className="logo">🔎</span><span>Search PoC</span></div>
        <div className="env-status"><small>Dev</small><StatusDot ok={health} /></div>
      </header>

      <main className="container">
        <section className="search-row">
          <input className="search-input" placeholder="Search products, docs, pages…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
          <button className="btn" onClick={() => setQ(q => q.trim())}>Search</button>
          <div className="alpha">
            <label htmlFor="alpha">Alpha</label>
            <input id="alpha" type="range" min={0} max={1} step={0.1} value={alpha} onChange={e => setAlpha(parseFloat(e.target.value))} />
            <div className="ticks"><span>0.5</span><span>0.6</span><span>0.7</span></div>
          </div>
        </section>

        <section className="filters">
          <div className="chips">
            {(['all','web','pdf','product'] as const).map(t => (
              <button key={t} className={`chip ${type===t?'active':''}`} onClick={() => setType(t)}>{t==='pdf'?'Docs':t[0].toUpperCase()+t.slice(1)}</button>
            ))}
          </div>
          <div className="tags">
            <label htmlFor="tags">Tags</label>
            <select id="tags" multiple value={tags} onChange={(e) => setTags(Array.from(e.target.selectedOptions).map(o=>o.value))}>
              {tagsOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </section>

        {!q && !loading && !error && <section className="state"><div className="hint">Try: <span className="k">refund policy</span>, <span className="k">healing crystal</span>, <span className="k">company profile</span></div></section>}
        {loading && <section className="state"><div className="spinner"/></section>}
        {error && <section className="state"><div className="error">Error: {error}</div></section>}
        {!loading && !error && q && hits.length===0 && <section className="state"><div className="empty">No results. Try a simpler term or remove filters.</div></section>}

        {!loading && !error && hits.length>0 && (
          <>
            <section className="results">
              {hits.map(h => <Card key={h.id} h={h} />)}
            </section>
          </>
        )}
      </main>

      <footer className="footer">
        <div className="metrics">
          <span>{tookMs} ms</span>
          <span>{hits.length} results</span>
          <span className={`pill ${vectorUsed? 'green':'gray'}`}>{vectorUsed? 'Vector ON':'Vector OFF'}</span>
        </div>
      </footer>
    </>
  )
}
