import { useEffect, useState, useMemo, useRef } from 'react'
import {
  TrendingUp, TrendingDown, Minus, RotateCcw, ExternalLink, Bookmark, BookmarkCheck,
} from 'lucide-react'
import { stocksApi } from '../services/api'
import useStore from '../store/useStore'
import toast from 'react-hot-toast'

// ── Constants ─────────────────────────────────────────────────────────────────
const SCAN_TTL_MS  = 30 * 60 * 1000   // 30 min — re-scan if older
const MAX_PARALLEL = 4                 // concurrent prediction calls

const SECTORS = ['All', 'IT', 'Banking', 'Finance', 'Energy', 'FMCG', 'Pharma', 'Auto', 'Telecom', 'Infrastructure', 'Utilities', 'Consumer']

const SIG_COLOR = { BUY: 'var(--buy)', SELL: 'var(--sell)', HOLD: '#f59e0b' }
const SIG_BG    = { BUY: 'var(--buy-dim)', SELL: 'var(--sell-dim)', HOLD: 'rgba(245,158,11,0.12)' }

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtPrice = n => n > 0
  ? `₹${parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  : '—'
const fmtPct = n => n != null ? `${parseFloat(n).toFixed(2)}%` : '—'

// Run promises in chunks of `size` at a time
async function pLimit(tasks, size, onDone) {
  let i = 0
  async function next() {
    if (i >= tasks.length) return
    const task = tasks[i++]
    const result = await task()
    onDone(result)
    await next()
  }
  await Promise.all(Array.from({ length: Math.min(size, tasks.length) }, next))
}

// ── Signal badge ──────────────────────────────────────────────────────────────
function SignalBadge({ signal, confidence, large }) {
  const Icon = signal === 'BUY' ? TrendingUp : signal === 'SELL' ? TrendingDown : Minus
  const c = SIG_COLOR[signal] || 'var(--text-muted)'
  const bg = SIG_BG[signal]   || 'var(--bg-elevated)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: large ? 6 : 3 }}>
      <span style={{
        display: 'flex', alignItems: 'center', gap: large ? 8 : 5,
        fontWeight: 800, fontSize: large ? 20 : 13,
        padding: large ? '8px 20px' : '4px 12px',
        borderRadius: large ? 10 : 7,
        background: bg, color: c,
        border: `1.5px solid ${c}55`,
        letterSpacing: '0.05em',
      }}>
        <Icon size={large ? 18 : 13} />
        {signal}
      </span>
      {confidence > 0 && (
        <span style={{ fontSize: large ? 12 : 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {parseFloat(confidence).toFixed(1)}% conf.
        </span>
      )}
    </div>
  )
}

// ── Stock card ────────────────────────────────────────────────────────────────
function StockCard({ stock, result, scanning, onOpenAnalysis, inWatchlist, onToggleWatch }) {
  const isReady   = result && !result.error
  const isError   = result?.error
  const isLoading = scanning && !result

  const change = parseFloat(result?.price_change_pct ?? stock.change_pct ?? 0)
  const price  = result?.current_price ?? stock.current_price ?? 0

  const signal     = result?.signal
  const sigColor   = SIG_COLOR[signal] || 'var(--border)'

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: `1.5px solid ${isReady ? sigColor + '55' : 'var(--border)'}`,
      borderRadius: 12,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      transition: 'border-color 0.3s',
    }}>

      {/* Signal hero strip */}
      <div style={{
        padding: isReady ? '18px 16px 14px' : '14px 16px',
        background: isReady ? SIG_BG[signal] : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        borderBottom: `1px solid ${isReady ? sigColor + '33' : 'var(--border)'}`,
      }}>
        {/* Left — stock identity */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: '0.02em' }}>{stock.stock_code}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stock.name}</div>
          <span style={{
            display: 'inline-block', marginTop: 5,
            fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 6,
            background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)',
          }}>{stock.sector}</span>
        </div>

        {/* Right — signal OR loading */}
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--primary)', animation: 'spin 0.9s linear infinite' }} />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Analysing…</span>
          </div>
        )}
        {isError && (
          <div style={{ fontSize: 11, color: 'var(--sell)', textAlign: 'center', maxWidth: 100 }}>
            Failed
          </div>
        )}
        {isReady && <SignalBadge signal={signal} confidence={result.confidence} large />}
        {!isLoading && !isReady && !isError && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'right' }}>
            —
          </div>
        )}
      </div>

      {/* Price row */}
      <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 17 }}>{fmtPrice(price)}</span>
        {price > 0 && (
          <span style={{ fontSize: 12, fontWeight: 700, color: change >= 0 ? 'var(--buy)' : 'var(--sell)' }}>
            {change >= 0 ? '+' : ''}{fmtPct(change)}
          </span>
        )}
      </div>

      {/* Target / Stop / Probability — only when ready */}
      {isReady && (() => {
        // rf_probability_up comes as a % (0–100); derive up/down fractions
        const probUp   = (result.rf_probability_up ?? 50) / 100
        const probDown = 1 - probUp
        return (
          <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Probability bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 9, color: 'var(--sell)', width: 26, textAlign: 'right', fontFamily: 'monospace' }}>
                {(probDown * 100).toFixed(0)}%
              </span>
              <div style={{ flex: 1, height: 6, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: `${probDown * 100}%`, height: '100%', background: 'var(--sell)', borderRadius: '4px 0 0 4px' }} />
                <div style={{ width: `${probUp * 100}%`, height: '100%', background: 'var(--buy)', marginLeft: 'auto', borderRadius: '0 4px 4px 0' }} />
              </div>
              <span style={{ fontSize: 9, color: 'var(--buy)', width: 26, fontFamily: 'monospace' }}>
                {(probUp * 100).toFixed(0)}%
              </span>
            </div>

            {/* Target + Stop */}
            {result.target_price > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: 'var(--text-muted)' }}>
                  Target <strong style={{ color: 'var(--buy)', fontFamily: 'monospace' }}>{fmtPrice(result.target_price)}</strong>
                </span>
                <span style={{ color: 'var(--text-muted)' }}>
                  Stop <strong style={{ color: 'var(--sell)', fontFamily: 'monospace' }}>{fmtPrice(result.stop_loss)}</strong>
                </span>
              </div>
            )}
          </div>
        )
      })()}

      {/* Footer — watchlist + full analysis */}
      <div style={{ marginTop: 'auto', padding: '8px 16px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 6 }}>
        <button
          onClick={() => onToggleWatch(stock)}
          title={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            padding: '7px 10px', borderRadius: 7, fontSize: 12, fontWeight: 500,
            background: inWatchlist ? 'var(--primary)15' : 'var(--bg-elevated)',
            border: `1px solid ${inWatchlist ? 'var(--primary)' : 'var(--border)'}`,
            color: inWatchlist ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {inWatchlist ? <BookmarkCheck size={12} /> : <Bookmark size={12} />}
        </button>
        <button onClick={() => onOpenAnalysis(stock)} style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '7px 0', borderRadius: 7, fontSize: 12, fontWeight: 500,
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          color: 'var(--text-muted)', cursor: 'pointer',
        }}>
          <ExternalLink size={11} /> Full Analysis
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DiscoverPage() {
  const {
    setSelectedStock, setActiveTab,
    discoverResults, discoverScannedAt, setDiscoverResult, clearDiscoverResults,
    watchlist, addToWatchlist, removeFromWatchlist,
  } = useStore()

  const [stocks,    setStocks]    = useState([])
  const [scanning,  setScanning]  = useState(false)
  const [progress,  setProgress]  = useState({ done: 0, total: 0 })
  const [sigFilter, setSigFilter] = useState('All')
  const [sector,    setSector]    = useState('All')
  const [sort,      setSort]      = useState('signal')
  const abortRef = useRef(false)

  // Load stock list on mount
  useEffect(() => {
    stocksApi.getPopular()
      .then(d => setStocks(d.stocks || []))
      .catch(() => toast.error('Failed to load stock list'))
  }, [])

  // Auto-scan if no cached results or cache expired
  useEffect(() => {
    if (!stocks.length) return
    const stale = !discoverScannedAt || Date.now() - discoverScannedAt > SCAN_TTL_MS
    if (stale && Object.keys(discoverResults).length === 0) {
      runScan(stocks)
    }
  }, [stocks]) // eslint-disable-line react-hooks/exhaustive-deps

  const runScan = async (stockList) => {
    if (scanning) return
    abortRef.current = false
    setScanning(true)
    setProgress({ done: 0, total: stockList.length })

    const tasks = stockList.map(stock => async () => {
      if (abortRef.current) return null
      try {
        const result = await stocksApi.analyzeOne(stock.stock_code, stock.exchange_code || 'NSE')
        return { stock_code: stock.stock_code, ...result }
      } catch (e) {
        return { stock_code: stock.stock_code, error: e.message, signal: null, confidence: 0 }
      }
    })

    await pLimit(tasks, MAX_PARALLEL, (result) => {
      if (result) {
        setDiscoverResult(result.stock_code, result)
        setProgress(p => ({ ...p, done: p.done + 1 }))
      }
    })

    setScanning(false)
  }

  const handleRescan = () => {
    clearDiscoverResults()
    if (stocks.length) runScan(stocks)
  }

  const handleOpenAnalysis = (stock) => {
    setSelectedStock({ stock_code: stock.stock_code, name: stock.name, exchange_code: stock.exchange_code || 'NSE' })
    setActiveTab('analysis')
  }

  const handleToggleWatch = (stock) => {
    if (watchlist.find(s => s.stock_code === stock.stock_code)) {
      removeFromWatchlist(stock.stock_code)
      toast.success(`Removed ${stock.stock_code} from watchlist`)
    } else {
      addToWatchlist({ stock_code: stock.stock_code, name: stock.name, exchange_code: stock.exchange_code || 'NSE' })
      toast.success(`Added ${stock.stock_code} to watchlist`)
    }
  }

  // Merge stock list with results
  const merged = useMemo(() => stocks.map(s => ({
    ...s,
    result: discoverResults[s.stock_code] || null,
  })), [stocks, discoverResults])

  // Summary counts
  const counts = useMemo(() => {
    const vals = Object.values(discoverResults)
    return {
      buy:  vals.filter(r => r.signal === 'BUY').length,
      hold: vals.filter(r => r.signal === 'HOLD').length,
      sell: vals.filter(r => r.signal === 'SELL').length,
      done: vals.length,
    }
  }, [discoverResults])

  const filtered = useMemo(() => {
    let list = [...merged]
    if (sigFilter !== 'All') list = list.filter(s => s.result?.signal === sigFilter)
    if (sector    !== 'All') list = list.filter(s => s.sector === sector)
    if (sort === 'signal')     list.sort((a, b) => {
      const o = { BUY: 0, HOLD: 1, SELL: 2 }
      const da = o[a.result?.signal] ?? 3, db = o[b.result?.signal] ?? 3
      return da !== db ? da - db : (b.result?.confidence ?? 0) - (a.result?.confidence ?? 0)
    })
    if (sort === 'confidence') list.sort((a, b) => (b.result?.confidence ?? 0) - (a.result?.confidence ?? 0))
    if (sort === 'change')     list.sort((a, b) => (b.result?.price_change_pct ?? 0) - (a.result?.price_change_pct ?? 0))
    if (sort === 'name')       list.sort((a, b) => a.stock_code.localeCompare(b.stock_code))
    return list
  }, [merged, sigFilter, sector, sort])

  const scannedCount  = counts.done
  const totalStocks   = stocks.length
  const scanPct       = totalStocks > 0 ? Math.round((progress.done / totalStocks) * 100) : 0

  return (
    <div style={{ padding: '20px 24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 17 }}>Discover</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {scanning
              ? `Scanning ${progress.done} / ${progress.total} stocks…`
              : scannedCount > 0
              ? `${scannedCount} stocks scanned · ${counts.buy} BUY · ${counts.hold} HOLD · ${counts.sell} SELL`
              : `${totalStocks} popular NSE stocks`}
          </div>
        </div>
        <button onClick={handleRescan} disabled={scanning} style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', borderRadius: 8,
          background: scanning ? 'var(--bg-elevated)' : 'var(--primary)',
          border: `1px solid ${scanning ? 'var(--border)' : 'var(--primary)'}`,
          color: scanning ? 'var(--text-muted)' : '#fff',
          fontSize: 13, fontWeight: 600, cursor: scanning ? 'not-allowed' : 'pointer', opacity: scanning ? 0.7 : 1,
        }}>
          <RotateCcw size={14} className={scanning ? 'pulse' : ''} />
          {scanning ? 'Scanning…' : 'Re-scan'}
        </button>
      </div>

      {/* Progress bar */}
      {scanning && (
        <div style={{ height: 4, background: 'var(--bg-elevated)', borderRadius: 2, marginBottom: 16, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${scanPct}%`, background: 'var(--primary)', borderRadius: 2, transition: 'width 0.4s' }} />
        </div>
      )}

      {/* Signal summary pills */}
      {scannedCount > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { sig: 'BUY',  count: counts.buy,  color: 'var(--buy)'  },
            { sig: 'HOLD', count: counts.hold, color: '#f59e0b'     },
            { sig: 'SELL', count: counts.sell, color: 'var(--sell)' },
          ].map(({ sig, count, color }) => (
            <button key={sig} onClick={() => setSigFilter(sigFilter === sig ? 'All' : sig)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderRadius: 20,
              background: sigFilter === sig ? color + '20' : 'var(--bg-elevated)',
              border: `1.5px solid ${sigFilter === sig ? color : 'var(--border)'}`,
              color: sigFilter === sig ? color : 'var(--text-muted)',
              cursor: 'pointer', fontSize: 13, fontWeight: 700,
            }}>
              <span style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 800, color }}>{count}</span>
              {sig}
            </button>
          ))}
        </div>
      )}

      {/* Filter + sort bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={sector} onChange={e => setSector(e.target.value)}
          style={{ padding: '5px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>
          {SECTORS.map(s => <option key={s} value={s}>{s === 'All' ? 'All Sectors' : s}</option>)}
        </select>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sort:</span>
          <select value={sort} onChange={e => setSort(e.target.value)}
            style={{ padding: '5px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>
            <option value="signal">Signal (BUY first)</option>
            <option value="confidence">Confidence (high→low)</option>
            <option value="change">Price change %</option>
            <option value="name">Name (A–Z)</option>
          </select>
        </div>
      </div>

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {filtered.map(s => (
          <StockCard
            key={s.stock_code}
            stock={s}
            result={s.result}
            scanning={scanning}
            onOpenAnalysis={handleOpenAnalysis}
            inWatchlist={!!watchlist.find(w => w.stock_code === s.stock_code)}
            onToggleWatch={handleToggleWatch}
          />
        ))}
      </div>

      {/* CSS for spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
