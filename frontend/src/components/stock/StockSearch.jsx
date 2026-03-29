import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { stocksApi } from '../../services/api'
import useStore from '../../store/useStore'

export default function StockSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [popular, setPopular] = useState([])
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const { setSelectedStock, addToWatchlist } = useStore()

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

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const select = (stock) => {
    setSelectedStock(stock)
    addToWatchlist(stock)
    setQuery('')
    setOpen(false)
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
          {results.slice(0, 12).map((s) => (
            <div key={s.stock_code} className="search-item" onClick={() => select(s)}>
              <div className="search-item-left">
                <div className="search-item-code">{s.stock_code}</div>
                <div className="search-item-name">{s.name}</div>
              </div>
              <span className="search-item-sector">{s.sector}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
