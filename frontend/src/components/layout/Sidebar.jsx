import { BookmarkX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { stocksApi } from '../../services/api'
import useStore from '../../store/useStore'

// Single batch poll for all watchlist quotes — one interval, not N
function useWatchlistQuotes(watchlist) {
  const [quotes, setQuotes] = useState({})

  const fetchAll = (list) => {
    list.forEach(stock => {
      stocksApi.getQuote(stock.stock_code).then(q => {
        setQuotes(prev => ({ ...prev, [stock.stock_code]: q }))
      }).catch(() => {})
    })
  }

  useEffect(() => {
    if (!watchlist.length) return
    fetchAll(watchlist)
    const id = setInterval(() => fetchAll(watchlist), 60000) // 60s, not 30s per item
    return () => clearInterval(id)
  }, [watchlist.map(s => s.stock_code).join(',')])

  return quotes
}

function WatchlistItem({ stock, quote, isActive, onClick, onRemove }) {
  const isPositive = quote ? quote.change_pct >= 0 : null

  return (
    <div className={`watchlist-item ${isActive ? 'active' : ''}`} onClick={onClick}>
      <div className="watchlist-item-left">
        <span className="watchlist-item-code">{stock.stock_code}</span>
        <span className="watchlist-item-name">{stock.name}</span>
      </div>
      <div className="watchlist-item-right">
        <span className="watchlist-price mono">
          {quote ? `₹${quote.last_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
        </span>
        {quote && (
          <span
            className="watchlist-change"
            style={{
              color: isPositive ? 'var(--buy)' : 'var(--sell)',
              background: isPositive ? 'var(--buy-dim)' : 'var(--sell-dim)',
            }}
          >
            {isPositive ? '+' : ''}{quote.change_pct.toFixed(2)}%
          </span>
        )}
      </div>
      <button
        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', marginLeft: 4, padding: 2 }}
        onClick={(e) => { e.stopPropagation(); onRemove(stock.stock_code) }}
        title="Remove"
      >
        <BookmarkX size={13} />
      </button>
    </div>
  )
}

export default function Sidebar() {
  const { watchlist, removeFromWatchlist, selectedStock, setSelectedStock, addToWatchlist, setActiveTab } = useStore()
  const quotes = useWatchlistQuotes(watchlist)

  useEffect(() => {
    stocksApi.getPopular().then(d => {
      const list = d.stocks || []
      if (watchlist.length === 0) list.slice(0, 5).forEach(s => addToWatchlist(s))
    })
  }, [])

  return (
    <aside className="sidebar">
      <div className="sidebar-section-title" style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Watchlist
        </span>
        <span className="muted" style={{ fontSize: 10 }}>{watchlist.length} stocks</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {watchlist.length === 0 ? (
          <div className="empty-state" style={{ padding: '30px 20px' }}>
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-text" style={{ fontSize: 12 }}>Search a stock to add it here</div>
          </div>
        ) : (
          watchlist.map(stock => (
            <WatchlistItem
              key={stock.stock_code}
              stock={stock}
              quote={quotes[stock.stock_code] || null}
              isActive={selectedStock?.stock_code === stock.stock_code}
              onClick={() => { setSelectedStock(stock); setActiveTab('analysis') }}
              onRemove={removeFromWatchlist}
            />
          ))
        )}
      </div>
    </aside>
  )
}
