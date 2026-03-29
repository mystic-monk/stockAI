import { useEffect, useState } from 'react'
import { stocksApi } from '../../services/api'
import useStore from '../../store/useStore'
import { RefreshCw, Plus } from 'lucide-react'

const fmt = (n) =>
  n != null
    ? `₹${parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—'

const fmtVol = (v) => {
  if (!v) return '—'
  if (v >= 1e7) return `${(v / 1e7).toFixed(2)} Cr`
  if (v >= 1e5) return `${(v / 1e5).toFixed(2)} L`
  return v.toLocaleString('en-IN')
}

export default function QuoteBar() {
  const { selectedStock, quote, setQuote } = useStore()
  const [loading, setLoading] = useState(false)

  const fetchQuote = async () => {
    if (!selectedStock) return
    setLoading(true)
    try {
      const q = await stocksApi.getQuote(selectedStock.stock_code, selectedStock.exchange_code)
      setQuote(q)
    } catch (e) {
      console.error('Quote error', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!selectedStock) return
    fetchQuote()
    const id = setInterval(fetchQuote, 30000)
    return () => clearInterval(id)
  }, [selectedStock?.stock_code])

  if (!selectedStock) return null

  const isPositive = quote ? quote.change >= 0 : true
  const signalColor = isPositive ? 'var(--buy)' : 'var(--sell)'

  return (
    <div className="quote-bar fade-in">
      <div>
        <div className="quote-bar-name">{selectedStock.name}</div>
        <div className="quote-bar-code">{selectedStock.stock_code} · {selectedStock.exchange_code}</div>
      </div>

      <div className="quote-price" style={{ color: signalColor }}>
        {quote ? fmt(quote.last_price) : <span className="pulse muted">Loading…</span>}
      </div>

      {quote && (
        <div
          className="quote-change-badge"
          style={{ color: signalColor, background: isPositive ? 'var(--buy-dim)' : 'var(--sell-dim)' }}
        >
          {isPositive ? '▲' : '▼'} {Math.abs(quote.change).toFixed(2)} ({Math.abs(quote.change_pct).toFixed(2)}%)
        </div>
      )}

      {quote && (
        <>
          <div className="quote-stat">
            <div className="quote-stat-label">Open</div>
            <div className="quote-stat-value">{fmt(quote.open)}</div>
          </div>
          <div className="quote-stat">
            <div className="quote-stat-label">High</div>
            <div className="quote-stat-value" style={{ color: 'var(--buy)' }}>{fmt(quote.high)}</div>
          </div>
          <div className="quote-stat">
            <div className="quote-stat-label">Low</div>
            <div className="quote-stat-value" style={{ color: 'var(--sell)' }}>{fmt(quote.low)}</div>
          </div>
          <div className="quote-stat">
            <div className="quote-stat-label">Prev Close</div>
            <div className="quote-stat-value">{fmt(quote.prev_close)}</div>
          </div>
          <div className="quote-stat">
            <div className="quote-stat-label">Volume</div>
            <div className="quote-stat-value">{fmtVol(quote.volume)}</div>
          </div>
        </>
      )}

      <div className="quote-bar-actions">
        <button
          onClick={fetchQuote}
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 10px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}
          title="Refresh quote"
        >
          <RefreshCw size={13} className={loading ? 'pulse' : ''} />
        </button>
      </div>
    </div>
  )
}
