import { Search, Bookmark, BookmarkCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { stocksApi } from '../../services/api'
import useStore from '../../store/useStore'

export default function StockSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [popular, setPopular] = useState([])
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const { setSelectedStock, addToWatchlist, removeFromWatchlist, watchlist, setActiveTab } = useStore()

  useEffect(() => {
    stocksApi.getPopular().then((d) => setPopular(d.stocks || []))
  }, [])

  useEffect(() => {
    if (!query) { setResults(popular); return }
    const q = query.toLowerCase()
    setResults(popular.filter(
      (s) => s.stock_code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    ))
  }, [query, popular])

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const select = (stock) => {
    setSelectedStock(stock)
    setActiveTab('analysis')
    setQuery('')
    setOpen(false)
  }

  const toggleWatch = (e, stock) => {
    e.stopPropagation()
    if (watchlist.find(s => s.stock_code === stock.stock_code)) {
      removeFromWatchlist(stock.stock_code)
    } else {
      addToWatchlist(stock)
    }
  }

  return (
    <div className="header-search" ref={ref}>
      <input
        placeholder="Search stock — INFY, RELIANCE, TCS…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
      />
      <Search size={14} className="header-search-icon" />

      {open && results.length > 0 && (
        <div className="search-dropdown fade-in">
          {results.slice(0, 12).map((s) => {
            const inWatchlist = !!watchlist.find(w => w.stock_code === s.stock_code)
            return (
              <div key={s.stock_code} className="search-item" onClick={() => select(s)}>
                <div className="search-item-left">
                  <div className="search-item-code">{s.stock_code}</div>
                  <div className="search-item-name">{s.name}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="search-item-sector">{s.sector}</span>
                  <button
                    onClick={(e) => toggleWatch(e, s)}
                    title={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
                      color: inWatchlist ? 'var(--primary)' : 'var(--text-muted)',
                      display: 'flex', alignItems: 'center',
                    }}
                  >
                    {inWatchlist ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
