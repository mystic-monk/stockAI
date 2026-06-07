import { useEffect, useState, useMemo } from 'react'
import {
  Search, ScanLine, TrendingUp, TrendingDown, Minus,
  ExternalLink, AlertCircle, Loader,
} from 'lucide-react'
import { stocksApi } from '../services/api'
import useStore from '../store/useStore'
import toast from 'react-hot-toast'

// ── Constants ─────────────────────────────────────────────────────────────────

const SIGNAL_COLOR = {
  BUY:  'var(--buy)',
  SELL: 'var(--sell)',
  HOLD: 'var(--hold, #f59e0b)',
}
const SIGNAL_BG = {
  BUY:  'var(--buy-dim)',
  SELL: 'var(--sell-dim)',
  HOLD: 'rgba(245,158,11,0.12)',
}

const SECTORS = ['All', 'IT', 'Banking', 'Finance', 'Energy', 'FMCG', 'Pharma', 'Auto', 'Telecom', 'Infrastructure', 'Utilities', 'Consumer']

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n, d = 2) => n != null ? parseFloat(n).toFixed(d) : '—'
const fmtPrice = (n) => n > 0 ? `₹${parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'

function SignalIcon({ signal }) {
  if (signal === 'BUY')  return <TrendingUp  size={13} />
  if (signal === 'SELL') return <TrendingDown size={13} />
  return <Minus size={13} />
}

// ── Stock card ────────────────────────────────────────────────────────────────

function StockCard({ stock, scanning, onOpenAnalysis }) {
  const { signal, confidence, current_price, change_pct, target_price, stop_loss, avg_prob_up, avg_prob_down, error } = stock
  const isScanned = signal != null
  const isLoading = scanning

  const changePctNum = parseFloat(change_pct || 0)
  const changeColor  = changePctNum >= 0 ? 'var(--buy)' : 'var(--sell)'
  const sColor       = isScanned ? (SIGNAL_COLOR[signal] || 'var(--text-muted)') : 'var(--text-muted)'
  const sBg          = isScanned ? (SIGNAL_BG[signal]   || 'var(--bg-elevated)') : 'var(--bg-elevated)'

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: `1px solid ${isScanned && !error ? (signal === 'BUY' ? 'rgba(0,230,118,0.25)' : signal === 'SELL' ? 'rgba(244,63,94,0.25)' : 'var(--border)') : 'var(--border)'}`,
      borderRadius: 10,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      transition: 'border-color 0.2s',
    }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '0.02em' }}>{stock.stock_code}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stock.name}</div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 8,
          background: 'var(--bg-elevated)', color: 'var(--text-muted)',
          border: '1px solid var(--border)', flexShrink: 0,
        }}>{stock.sector || '—'}</span>
      </div>

      {/* Price row */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 18 }}>
          {fmtPrice(current_price)}
        </span>
        {current_price > 0 && (
          <span style={{ fontSize: 12, fontWeight: 600, color: changeColor }}>
            {changePctNum >= 0 ? '+' : ''}{fmt(change_pct)}%
          </span>
        )}
      </div>

      {/* Signal block */}
      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', padding: '6px 0' }}>
          <Loader size={13} className="pulse" /> Analysing…
        </div>
      ) : error ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--sell)', padding: '4px 0' }}>
          <AlertCircle size={12} /> {error.length > 50 ? error.slice(0, 50) + '…' : error}
        </div>
      ) : isScanned ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Signal badge + confidence */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontWeight: 700, fontSize: 13, padding: '4px 12px', borderRadius: 7,
              background: sBg, color: sColor, border: `1px solid ${sColor}33`,
            }}>
              <SignalIcon signal={signal} />
              {signal}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              {fmt(confidence)}% conf.
            </span>
          </div>

          {/* Probability bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 9, color: 'var(--sell)', width: 22, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(avg_prob_down * 100, 0)}%</span>
            <div style={{ flex: 1, height: 5, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden', display: 'flex' }}>
              <div style={{ width: `${avg_prob_down * 100}%`, height: '100%', background: 'var(--sell)', borderRadius: '3px 0 0 3px' }} />
              <div style={{ width: `${avg_prob_up * 100}%`, height: '100%', background: 'var(--buy)', borderRadius: '0 3px 3px 0', marginLeft: 'auto' }} />
            </div>
            <span style={{ fontSize: 9, color: 'var(--buy)', width: 22, fontFamily: 'monospace' }}>{fmt(avg_prob_up * 100, 0)}%</span>
          </div>

          {/* Target / Stop */}
          {target_price > 0 && (
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
              <span>Target <strong style={{ color: 'var(--buy)', fontFamily: 'monospace' }}>{fmtPrice(target_price)}</strong></span>
              <span>Stop <strong style={{ color: 'var(--sell)', fontFamily: 'monospace' }}>{fmtPrice(stop_loss)}</strong></span>
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Not analysed — click Scan All or Open to analyse
        </div>
      )}

      {/* Action */}
      <button
        onClick={() => onOpenAnalysis(stock)}
        style={{
          marginTop: 2,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          padding: '7px 0', borderRadius: 7, fontSize: 12, fontWeight: 600,
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          color: 'var(--text-secondary)', cursor: 'pointer', width: '100%',
        }}
      >
        <ExternalLink size={12} /> Open Analysis
      </button>
    </div>
  )
}

// ── Summary bar ───────────────────────────────────────────────────────────────

function SummaryChip({ label, value, color }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '5px 12px', borderRadius: 20,
      background: color + '15', border: `1px solid ${color}44`,
    }}>
      <span style={{ fontSize: 16, fontWeight: 800, fontFamily: 'monospace', color }}>{value}</span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DiscoverPage() {
  const { setSelectedStock, setActiveTab } = useStore()

  const [stocks,    setStocks]    = useState([])    // popular list (unscanned)
  const [results,   setResults]   = useState({})    // stockCode → result
  const [scanning,  setScanning]  = useState(false)
  const [search,    setSearch]    = useState('')
  const [sigFilter, setSigFilter] = useState('All')
  const [sector,    setSector]    = useState('All')
  const [sort,      setSort]      = useState('signal')

  // Load popular list on mount
  useEffect(() => {
    stocksApi.getPopular()
      .then(d => setStocks(d.stocks || []))
      .catch(() => toast.error('Failed to load stock list'))
  }, [])

  const handleScanAll = async () => {
    setScanning(true)
    toast.loading('Scanning all stocks — this takes ~60s…', { id: 'scan' })
    try {
      const data = await stocksApi.scan()
      const map = {}
      for (const r of (data.results || [])) map[r.stock_code] = r
      setResults(map)
      const s = data.summary || {}
      toast.success(`Done — ${s.buy ?? 0} BUY · ${s.hold ?? 0} HOLD · ${s.sell ?? 0} SELL`, { id: 'scan' })
    } catch (e) {
      toast.error(e.message, { id: 'scan' })
    } finally {
      setScanning(false)
    }
  }

  const handleOpenAnalysis = (stock) => {
    setSelectedStock({ stock_code: stock.stock_code, name: stock.name, exchange_code: stock.exchange_code || 'NSE' })
    setActiveTab('analysis')
  }

  // Merge popular list with scan results
  const merged = useMemo(() => stocks.map(s => ({
    ...s,
    ...(results[s.stock_code] || {}),
  })), [stocks, results])

  const scannedCount = Object.keys(results).length
  const summary = useMemo(() => ({
    buy:  merged.filter(s => s.signal === 'BUY').length,
    sell: merged.filter(s => s.signal === 'SELL').length,
    hold: merged.filter(s => s.signal === 'HOLD').length,
  }), [merged])

  const filtered = useMemo(() => {
    let list = [...merged]
    if (search)              list = list.filter(s => s.stock_code.includes(search.toUpperCase()) || s.name?.toLowerCase().includes(search.toLowerCase()))
    if (sigFilter !== 'All') list = list.filter(s => s.signal === sigFilter)
    if (sector    !== 'All') list = list.filter(s => s.sector === sector)
    if (sort === 'signal')   list.sort((a, b) => {
      const o = { BUY: 0, HOLD: 1, SELL: 2 }
      const da = o[a.signal] ?? 3, db = o[b.signal] ?? 3
      return da !== db ? da - db : (b.confidence || 0) - (a.confidence || 0)
    })
    if (sort === 'change')   list.sort((a, b) => (b.change_pct || 0) - (a.change_pct || 0))
    if (sort === 'price')    list.sort((a, b) => (a.current_price || 0) - (b.current_price || 0))
    if (sort === 'name')     list.sort((a, b) => a.stock_code.localeCompare(b.stock_code))
    return list
  }, [merged, search, sigFilter, sector, sort])

  return (
    <div style={{ padding: '20px 24px' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ScanLine size={20} style={{ color: 'var(--primary)' }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>Discover</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Scan {stocks.length} popular NSE stocks for AI buy/sell signals
            </div>
          </div>
        </div>

        <button
          onClick={handleScanAll}
          disabled={scanning}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 20px', borderRadius: 8,
            background: scanning ? 'var(--bg-elevated)' : 'var(--primary)',
            border: `1px solid ${scanning ? 'var(--border)' : 'var(--primary)'}`,
            color: scanning ? 'var(--text-muted)' : '#fff',
            fontSize: 13, fontWeight: 600,
            cursor: scanning ? 'not-allowed' : 'pointer',
            opacity: scanning ? 0.7 : 1,
          }}
        >
          {scanning ? <Loader size={14} className="pulse" /> : <ScanLine size={14} />}
          {scanning ? 'Scanning…' : scannedCount > 0 ? 'Re-scan All' : 'Scan All'}
        </button>
      </div>

      {/* Summary chips */}
      {scannedCount > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          <SummaryChip label="BUY signals"  value={summary.buy}  color="var(--buy)" />
          <SummaryChip label="HOLD signals" value={summary.hold} color="#f59e0b" />
          <SummaryChip label="SELL signals" value={summary.sell} color="var(--sell)" />
        </div>
      )}

      {/* Filter / sort bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search stock…"
            style={{ paddingLeft: 28, paddingRight: 10, paddingTop: 5, paddingBottom: 5, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-primary)', fontSize: 12, width: 140 }}
          />
        </div>

        {/* Signal filter */}
        {['All', 'BUY', 'HOLD', 'SELL'].map(f => (
          <button key={f} onClick={() => setSigFilter(f)} style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: sigFilter === f ? (f === 'BUY' ? 'var(--buy-dim)' : f === 'SELL' ? 'var(--sell-dim)' : f === 'HOLD' ? 'rgba(245,158,11,0.12)' : 'var(--primary)') : 'var(--bg-elevated)',
            border: `1px solid ${sigFilter === f ? (SIGNAL_COLOR[f] || 'var(--primary)') : 'var(--border)'}`,
            color: sigFilter === f ? (SIGNAL_COLOR[f] || '#fff') : 'var(--text-muted)',
          }}>{f}</button>
        ))}

        {/* Sector filter */}
        <select
          value={sector} onChange={e => setSector(e.target.value)}
          style={{ padding: '5px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}
        >
          {SECTORS.map(s => <option key={s} value={s}>{s === 'All' ? 'All Sectors' : s}</option>)}
        </select>

        {/* Sort */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sort:</span>
          <select
            value={sort} onChange={e => setSort(e.target.value)}
            style={{ padding: '5px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}
          >
            <option value="signal">Signal (BUY first)</option>
            <option value="change">Price Change %</option>
            <option value="price">Price (low→high)</option>
            <option value="name">Name (A–Z)</option>
          </select>
        </div>
      </div>

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <ScanLine size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
          <div style={{ fontSize: 14, marginBottom: 6 }}>No stocks match your filter</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {filtered.map(s => (
            <StockCard
              key={s.stock_code}
              stock={s}
              scanning={scanning}
              onOpenAnalysis={handleOpenAnalysis}
            />
          ))}
        </div>
      )}

      {/* Hint when no scan yet */}
      {scannedCount === 0 && !scanning && (
        <div style={{
          marginTop: 28, padding: '16px 20px', borderRadius: 10,
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8,
        }}>
          <strong style={{ color: 'var(--text-secondary)' }}>How Scan All works:</strong>{' '}
          Fetches live prices + runs the 5-model ML ensemble for every stock in parallel.
          Takes ~60 seconds for {stocks.length} stocks. Results are sorted BUY → HOLD → SELL by confidence.
          Click <strong style={{ color: 'var(--text-secondary)' }}>Open Analysis</strong> on any card to see the full candlestick chart, indicators, and detailed prediction.
        </div>
      )}
    </div>
  )
}
