import { useState } from 'react'
import { Brain, TrendingUp, TrendingDown, Minus, RefreshCw, ChevronUp, ChevronDown } from 'lucide-react'
import { portfolioApi } from '../../services/api'
import useStore from '../../store/useStore'

const fmt = (n) =>
  n != null
    ? `₹${parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—'

const pct = (n, sign = true) =>
  n != null ? `${sign && n > 0 ? '+' : ''}${parseFloat(n).toFixed(2)}%` : '—'

// ── Sub-components ────────────────────────────────────────────────────────────

function SignalBadge({ signal, size = 'sm' }) {
  const cfg = {
    BUY:  { color: 'var(--buy)',  bg: 'var(--buy-dim)',  icon: <TrendingUp  size={11} />, label: '↑ BUY' },
    SELL: { color: 'var(--sell)', bg: 'var(--sell-dim)', icon: <TrendingDown size={11} />, label: '↓ SELL' },
    HOLD: { color: 'var(--hold)', bg: 'var(--hold-dim)', icon: <Minus size={11} />, label: '— HOLD' },
  }
  const c = cfg[signal] || cfg.HOLD
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: size === 'sm' ? '2px 8px' : '4px 12px',
      borderRadius: 12,
      background: c.bg,
      color: c.color,
      fontWeight: 700,
      fontSize: size === 'sm' ? 11 : 13,
      whiteSpace: 'nowrap',
    }}>
      {c.icon} {c.label}
    </span>
  )
}

function ConfBar({ value, signal }) {
  const col = { BUY: 'var(--buy)', SELL: 'var(--sell)', HOLD: 'var(--hold)' }[signal] || 'var(--primary)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 5, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: col, borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)', minWidth: 34 }}>
        {value?.toFixed(0)}%
      </span>
    </div>
  )
}

function ModelVotes({ votes }) {
  if (!votes || !Object.keys(votes).length) return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
  const col = { BUY: 'var(--buy)', SELL: 'var(--sell)', HOLD: 'var(--hold)' }
  return (
    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
      {Object.entries(votes).map(([model, sig]) => (
        <span key={model} title={`${model}: ${sig}`} style={{
          padding: '1px 5px', borderRadius: 4, fontSize: 10, fontWeight: 700,
          color: col[sig] || 'var(--text-muted)',
          border: `1px solid ${col[sig] || 'var(--border)'}`,
          background: 'transparent',
        }}>
          {model.slice(0, 3)}
        </span>
      ))}
    </div>
  )
}

function SummaryCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 14px', flex: 1, minWidth: 120,
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: color || 'var(--text-primary)' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ── Sort helpers ──────────────────────────────────────────────────────────────
const SORT_KEYS = {
  stock_code: 'stock_code', signal: 'signal', confidence: 'confidence',
  agreement_pct: 'agreement_pct', price_change_pct: 'price_change_pct',
  expected_gain: 'expected_gain', current_value: 'current_value',
}

function useSortedData(data) {
  const [sort, setSort] = useState({ key: 'confidence', dir: 'desc' })
  const toggle = (key) => setSort(s =>
    s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }
  )
  const sorted = [...data].sort((a, b) => {
    const va = a[sort.key], vb = b[sort.key]
    if (typeof va === 'string') return sort.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    return sort.dir === 'asc' ? (va ?? 0) - (vb ?? 0) : (vb ?? 0) - (va ?? 0)
  })
  return { sorted, sort, toggle }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PortfolioPredictions() {
  const setSelectedStock = useStore(s => s.setSelectedStock)
  const setActiveTab     = useStore(s => s.setActiveTab)

  const [state, setState] = useState({ data: null, loading: false, error: null })
  const { sorted, sort, toggle } = useSortedData(state.data?.predictions ?? [])

  const runAnalysis = async () => {
    setState({ data: null, loading: true, error: null })
    try {
      const data = await portfolioApi.getPortfolioPredictions()
      setState({ data, loading: false, error: null })
    } catch (e) {
      setState({ data: null, loading: false, error: e.message })
    }
  }

  const goAnalyze = (stockCode) => {
    setSelectedStock({ stock_code: stockCode, exchange_code: 'NSE', name: stockCode, sector: '' })
    setActiveTab('analysis')
  }

  const SortTh = ({ label, k }) => (
    <th onClick={() => toggle(k)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
      {label} {sort.key === k ? (sort.dir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />) : ''}
    </th>
  )

  const s = state.data?.summary

  return (
    <div style={{ marginTop: 24 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Brain size={16} style={{ color: 'var(--primary)' }} />
          <span style={{ fontWeight: 700, fontSize: 15 }}>Portfolio AI Analysis</span>
          {s && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>
              {s.analyzed}/{s.total_positions} positions · {s.models_used?.join(', ')}
            </span>
          )}
        </div>
        <button
          onClick={runAnalysis}
          disabled={state.loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 16px', borderRadius: 7,
            background: state.loading ? 'var(--bg-elevated)' : 'var(--primary)',
            border: '1px solid var(--primary)',
            color: '#fff', fontSize: 12, fontWeight: 600, cursor: state.loading ? 'not-allowed' : 'pointer',
            opacity: state.loading ? 0.7 : 1,
          }}
        >
          <RefreshCw size={12} className={state.loading ? 'pulse' : ''} />
          {state.loading ? 'Analyzing…' : state.data ? 'Re-analyze' : 'Analyze Portfolio'}
        </button>
      </div>

      {/* Loading */}
      {state.loading && (
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '32px 24px', textAlign: 'center',
        }}>
          <div className="pulse" style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
            <Brain size={20} style={{ color: 'var(--primary)', marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
            Training 4-model ensemble for each holding…
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            RF · ExtraTrees · GradientBoosting · XGBoost · GBR · LSTM
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, opacity: 0.7 }}>
            First run trains models per stock (~30-90s). Subsequent runs use cached models.
          </div>
        </div>
      )}

      {/* Error */}
      {state.error && (
        <div style={{
          background: 'var(--sell-dim)', border: '1px solid var(--sell)',
          borderRadius: 8, padding: '12px 16px', color: 'var(--sell)', fontSize: 13,
        }}>
          {state.error}
        </div>
      )}

      {/* Results */}
      {state.data && !state.loading && (
        <>
          {/* Summary cards */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <SummaryCard
              label="BUY signals"
              value={s.buy_count}
              sub={`${((s.buy_count / s.analyzed) * 100).toFixed(0)}% of holdings`}
              color="var(--buy)"
            />
            <SummaryCard
              label="SELL signals"
              value={s.sell_count}
              sub={`${((s.sell_count / s.analyzed) * 100).toFixed(0)}% of holdings`}
              color="var(--sell)"
            />
            <SummaryCard
              label="HOLD signals"
              value={s.hold_count}
              sub={`${((s.hold_count / s.analyzed) * 100).toFixed(0)}% of holdings`}
              color="var(--hold)"
            />
            <SummaryCard
              label="Avg Confidence"
              value={`${s.avg_confidence}%`}
              color="var(--primary)"
            />
            <SummaryCard
              label="Expected Move"
              value={pct(s.expected_portfolio_move_pct)}
              sub="value-weighted"
              color={s.expected_portfolio_move_pct >= 0 ? 'var(--buy)' : 'var(--sell)'}
            />
          </div>

          {/* Predictions table */}
          <div className="positions-table-wrap">
            <table>
              <thead>
                <tr>
                  <SortTh label="Stock"     k="stock_code" />
                  <SortTh label="Signal"    k="signal" />
                  <SortTh label="Conf"      k="confidence" />
                  <SortTh label="Agreement" k="agreement_pct" />
                  <th>Model Votes</th>
                  <th>Current</th>
                  <th>Predicted</th>
                  <SortTh label="Δ Price"   k="price_change_pct" />
                  <SortTh label="Exp Gain"  k="expected_gain" />
                  <SortTh label="P&L"       k="pnl" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => {
                  const isErr = !!row.error
                  return (
                    <tr key={row.stock_code} style={{ opacity: isErr ? 0.5 : 1 }}>
                      <td>
                        <div
                          onClick={() => goAnalyze(row.stock_code)}
                          style={{ fontWeight: 700, color: 'var(--accent-blue)', cursor: 'pointer', textDecoration: 'underline', fontSize: 13 }}
                          title="Deep-analyze this stock"
                        >
                          {row.stock_code}
                        </div>
                        {isErr && <div style={{ fontSize: 10, color: 'var(--sell)' }} title={row.error}>⚠ failed</div>}
                      </td>
                      <td><SignalBadge signal={row.signal} /></td>
                      <td><ConfBar value={row.confidence} signal={row.signal} /></td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                        {row.agreement_pct?.toFixed(0)}%
                      </td>
                      <td><ModelVotes votes={row.model_votes} /></td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{fmt(row.current_price)}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                        {fmt(row.predicted_price)}
                        {row.price_predictions && Object.keys(row.price_predictions).length > 1 && (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {Object.entries(row.price_predictions).map(([m, p]) =>
                              `${m}:${fmt(p)}`
                            ).join(' ')}
                          </div>
                        )}
                      </td>
                      <td style={{
                        fontFamily: 'monospace', fontSize: 12, fontWeight: 600,
                        color: (row.price_change_pct ?? 0) >= 0 ? 'var(--buy)' : 'var(--sell)',
                      }}>
                        {pct(row.price_change_pct)}
                      </td>
                      <td style={{
                        fontFamily: 'monospace', fontSize: 12, fontWeight: 600,
                        color: (row.expected_gain ?? 0) >= 0 ? 'var(--buy)' : 'var(--sell)',
                      }}>
                        {row.expected_gain >= 0 ? '+' : ''}{fmt(row.expected_gain)}
                      </td>
                      <td style={{
                        fontFamily: 'monospace', fontSize: 12, fontWeight: 600,
                        color: (row.pnl ?? 0) >= 0 ? 'var(--buy)' : 'var(--sell)',
                      }}>
                        {row.pnl >= 0 ? '+' : ''}{fmt(row.pnl)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, textAlign: 'right' }}>
            Last analyzed: {new Date(state.data.timestamp).toLocaleString('en-IN')}
            {s.failed > 0 && ` · ${s.failed} stock(s) failed`}
          </div>
        </>
      )}
    </div>
  )
}
