import { useEffect, useState, useMemo } from 'react'
import { RefreshCw, RotateCcw, TrendingUp, TrendingDown, DollarSign, BarChart2, Brain, Search, ChevronDown, ChevronUp } from 'lucide-react'
import { portfolioApi, stocksApi, predictionsApi } from '../../services/api'
import useStore from '../../store/useStore'
import PositionTable from './PositionTable'
import TradePanel from './TradePanel'
import toast from 'react-hot-toast'

const fmt = (n) =>
  n != null
    ? `₹${parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—'

const pct = (n) =>
  n != null ? `${n > 0 ? '+' : ''}${parseFloat(n).toFixed(2)}%` : '—'

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="portfolio-stat-card">
      <div className="portfolio-stat-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {Icon && <Icon size={11} />} {label}
      </div>
      <div className="portfolio-stat-value" style={{ color: color || 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  )
}

function AISummaryStrip({ summary, timestamp, loading }) {
  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '10px 16px',
        fontSize: 12, color: 'var(--text-muted)',
      }}>
        <Brain size={14} className="pulse" style={{ color: 'var(--primary)' }} />
        Training models & running predictions for each holding… (first run ~30–90s)
      </div>
    )
  }
  if (!summary) return null
  const chips = [
    { label: `${summary.buy_count} BUY`,  color: 'var(--buy)',  bg: 'var(--buy-dim)' },
    { label: `${summary.sell_count} SELL`, color: 'var(--sell)', bg: 'var(--sell-dim)' },
    { label: `${summary.hold_count} HOLD`, color: 'var(--hold)', bg: 'var(--hold-dim)' },
  ]
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '9px 14px',
    }}>
      <Brain size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
      <div style={{ display: 'flex', gap: 6 }}>
        {chips.map(c => (
          <span key={c.label} style={{
            padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700,
            color: c.color, background: c.bg,
          }}>{c.label}</span>
        ))}
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        avg confidence <strong style={{ color: 'var(--text-primary)' }}>{summary.avg_confidence}%</strong>
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        expected move{' '}
        <strong style={{ color: summary.expected_portfolio_move_pct >= 0 ? 'var(--buy)' : 'var(--sell)' }}>
          {pct(summary.expected_portfolio_move_pct)}
        </strong>
      </span>
      {summary.models_used?.length > 0 && (
        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {summary.models_used.join(' · ')}
        </span>
      )}
      {timestamp && (
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          · {new Date(timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  )
}

const SIGNAL_COLOR = { BUY: 'var(--buy)', SELL: 'var(--sell)', HOLD: 'var(--hold)' }
const SIGNAL_BG    = { BUY: 'var(--buy-dim)', SELL: 'var(--sell-dim)', HOLD: 'var(--bg-elevated)' }

function OpportunitiesPanel({ portfolioPositions }) {
  const { setSelectedStock, setActiveTab } = useStore()
  const [results, setResults]   = useState([])
  const [scanning, setScanning] = useState(false)
  const [open, setOpen]         = useState(false)
  const [popular, setPopular]   = useState([])

  useEffect(() => {
    stocksApi.getPopular().then(d => setPopular(d.stocks || []))
  }, [])

  const portfolioCodes = new Set((portfolioPositions || []).map(p => p.stock_code))
  const candidates = popular.filter(s => !portfolioCodes.has(s.stock_code))

  const scan = async () => {
    setScanning(true)
    setResults([])
    setOpen(true)
    const stocks = candidates.slice(0, 12)
    for (const stock of stocks) {
      try {
        const pred = await predictionsApi.analyze(stock.stock_code, stock.exchange_code || 'NSE')
        setResults(prev => [...prev, { ...stock, ...pred }])
      } catch { /* skip failures silently */ }
    }
    setScanning(false)
  }

  const sorted = [...results].sort((a, b) => {
    const order = { BUY: 0, SELL: 1, HOLD: 2 }
    if (order[a.signal] !== order[b.signal]) return order[a.signal] - order[b.signal]
    return (b.confidence || 0) - (a.confidence || 0)
  })

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer' }}
        onClick={() => setOpen(o => !o)}>
        <Search size={14} style={{ color: 'var(--primary)' }} />
        <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>Market Opportunities</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Scan {candidates.length} popular stocks not in your portfolio for BUY signals
        </span>
        <button
          onClick={e => { e.stopPropagation(); scan() }}
          disabled={scanning}
          style={{
            padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            background: scanning ? 'var(--bg-elevated)' : 'var(--primary)',
            border: '1px solid var(--primary)', color: '#fff',
            cursor: scanning ? 'not-allowed' : 'pointer', opacity: scanning ? 0.7 : 1,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
          <Brain size={11} className={scanning ? 'pulse' : ''} />
          {scanning ? `Scanning… (${results.length}/${Math.min(candidates.length, 12)})` : results.length ? 'Re-scan' : 'Scan for Buys'}
        </button>
        {open ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
      </div>

      {open && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px' }}>
          {sorted.length === 0 && !scanning && (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              Click "Scan for Buys" to run AI analysis on popular stocks not in your portfolio.
              <div style={{ fontSize: 11, marginTop: 6 }}>First scan trains models — takes ~2–5 min. Subsequent scans are instant.</div>
            </div>
          )}
          {scanning && results.length === 0 && (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              <Brain size={20} className="pulse" style={{ marginBottom: 8 }} />
              <div>Training models and running analysis… results appear as each stock completes.</div>
            </div>
          )}
          {sorted.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {sorted.map(r => (
                <div key={r.stock_code}
                  onClick={() => { setSelectedStock(r); setActiveTab('analysis') }}
                  style={{
                    background: 'var(--bg-elevated)', border: `1px solid ${SIGNAL_COLOR[r.signal] || 'var(--border)'}33`,
                    borderRadius: 8, padding: '12px 14px', cursor: 'pointer',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = SIGNAL_COLOR[r.signal] || 'var(--border)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = (SIGNAL_COLOR[r.signal] || 'var(--border)') + '33'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{r.stock_code}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
                      background: SIGNAL_BG[r.signal], color: SIGNAL_COLOR[r.signal],
                    }}>{r.signal}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{r.name}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Confidence</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: SIGNAL_COLOR[r.signal] }}>
                      {r.confidence?.toFixed(0)}%
                    </span>
                  </div>
                  {r.price_change_pct != null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 3 }}>
                      <span style={{ color: 'var(--text-muted)' }}>Expected move</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600, color: r.price_change_pct >= 0 ? 'var(--buy)' : 'var(--sell)' }}>
                        {r.price_change_pct >= 0 ? '+' : ''}{r.price_change_pct?.toFixed(1)}%
                      </span>
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 5, textDecoration: 'underline' }}>
                    Click to deep-analyse →
                  </div>
                </div>
              ))}
              {scanning && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-elevated)', borderRadius: 8, padding: '20px', color: 'var(--text-muted)', fontSize: 12 }}>
                  <Brain size={14} className="pulse" style={{ marginRight: 8 }} /> Analysing next stock…
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const PRED_CACHE_TTL = 60 * 60 * 1000  // 1 hour

export default function PortfolioDashboard() {
  const { portfolio, setPortfolio, portfolioPredictions, setPortfolioPredictions } = useStore()
  const [loading, setLoading]     = useState(false)
  const [predLoading, setPredLoading] = useState(false)
  const [predError, setPredError]   = useState(null)

  // Restore cached predictions immediately (no flash of empty table)
  const [predData, setPredData] = useState(portfolioPredictions?.data || null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await portfolioApi.getPortfolio()
      setPortfolio(data)
    } catch {
      toast.error('Failed to load portfolio')
    } finally {
      setLoading(false)
    }
  }

  const runAnalysis = async (force = false) => {
    // Use cache if fresh enough and not forced
    if (!force && portfolioPredictions?.savedAt) {
      const age = Date.now() - portfolioPredictions.savedAt
      if (age < PRED_CACHE_TTL) return  // cache still valid
    }
    setPredLoading(true)
    setPredError(null)
    try {
      const data = await portfolioApi.getPortfolioPredictions()
      setPredData(data)
      setPortfolioPredictions(data)
    } catch (e) {
      setPredError(e.message)
      toast.error(`Analysis failed: ${e.message}`)
    } finally {
      setPredLoading(false)
    }
  }

  // Build a lookup map: stock_code → prediction row
  const predMap = useMemo(() => {
    if (!predData?.predictions) return null
    return Object.fromEntries(predData.predictions.map(p => [p.stock_code, p]))
  }, [predData])

  useEffect(() => {
    load()
    runAnalysis()   // runs only if cache is stale
  }, [])

  const handleReset = async () => {
    if (!confirm('Reset paper portfolio to ₹10,00,000? All positions and trades will be lost.')) return
    try {
      const data = await portfolioApi.resetPortfolio()
      setPortfolio(data)
      toast.success('Portfolio reset')
    } catch (e) {
      toast.error(e.message)
    }
  }

  if (!portfolio && loading) {
    return (
      <div style={{ display: 'flex', height: '60vh', alignItems: 'center', gap: 12, justifyContent: 'center', opacity: 0.5, fontWeight: 500 }}>
        <RefreshCw size={18} className="pulse" /> Fetching Live Demat holdings...
      </div>
    )
  }

  const p = portfolio
  const pnlPositive = (p?.total_pnl ?? 0) >= 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Live Demat Portfolio</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => runAnalysis(true)}
            disabled={predLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 6,
              background: predLoading ? 'var(--bg-elevated)' : 'var(--primary)',
              border: `1px solid var(--primary)`,
              color: '#fff', fontSize: 12, fontWeight: 600,
              cursor: predLoading ? 'not-allowed' : 'pointer',
              opacity: predLoading ? 0.7 : 1,
            }}
          >
            <Brain size={12} className={predLoading ? 'pulse' : ''} />
            {predLoading ? 'Analyzing…' : predMap ? 'Re-analyze' : 'AI Analysis'}
          </button>
          <button
            onClick={load}
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', color: 'var(--text-secondary)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={12} className={loading ? 'pulse' : ''} /> Refresh
          </button>
          <button
            onClick={handleReset}
            style={{ background: 'var(--sell-dim)', border: '1px solid var(--sell)', borderRadius: 6, padding: '6px 12px', color: 'var(--sell)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="portfolio-summary-grid">
        <StatCard label="Cash Balance"   icon={DollarSign}  value={fmt(p?.cash_balance)} />
        <StatCard label="Invested Value" icon={BarChart2}   value={fmt(p?.total_invested)} />
        <StatCard label="Current Value"  icon={TrendingUp}  value={fmt(p?.total_current_value)} />
        <StatCard
          label="Total P&L"
          icon={pnlPositive ? TrendingUp : TrendingDown}
          value={`${pnlPositive ? '+' : ''}${fmt(p?.total_pnl)} (${p?.total_pnl_pct?.toFixed(2)}%)`}
          color={pnlPositive ? 'var(--buy)' : 'var(--sell)'}
        />
      </div>

      {/* AI summary strip */}
      {(predLoading || predData) && (
        <AISummaryStrip
          summary={predData?.summary}
          timestamp={predData?.timestamp}
          loading={predLoading}
        />
      )}

      {predError && (
        <div style={{ background: 'var(--sell-dim)', border: '1px solid var(--sell)', borderRadius: 8, padding: '10px 14px', color: 'var(--sell)', fontSize: 12 }}>
          Analysis failed: {predError}
        </div>
      )}

      {/* Main grid: Positions + Trade Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>
            Open Positions ({p?.positions?.length ?? 0})
            {predMap && (
              <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                · AI signals shown inline
              </span>
            )}
          </div>
          <PositionTable positions={p?.positions ?? []} predictions={predMap} />
        </div>
        <TradePanel />
      </div>

      {/* Opportunities scanner */}
      <OpportunitiesPanel portfolioPositions={p?.positions ?? []} />

      {/* Trade history */}
      {p?.trades?.length > 0 && (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Recent Trades</div>
          <div className="positions-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Stock</th>
                  <th>Action</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Total</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {[...p.trades].reverse().slice(0, 20).map((t) => (
                  <tr key={t.id}>
                    <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t.id}</td>
                    <td style={{ fontWeight: 600 }}>{t.stock_code}</td>
                    <td style={{ color: t.action === 'BUY' ? 'var(--buy)' : 'var(--sell)', fontWeight: 700 }}>{t.action}</td>
                    <td>{t.quantity}</td>
                    <td>{fmt(t.price)}</td>
                    <td>{fmt(t.total_value)}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                      {new Date(t.timestamp).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
