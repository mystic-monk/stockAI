import { useEffect, useState } from 'react'
import { RefreshCw, RotateCcw, TrendingUp, TrendingDown, DollarSign, BarChart2 } from 'lucide-react'
import { portfolioApi } from '../../services/api'
import useStore from '../../store/useStore'
import PositionTable from './PositionTable'
import TradePanel from './TradePanel'
import toast from 'react-hot-toast'

const fmt = (n) =>
  n != null
    ? `₹${parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—'

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

export default function PortfolioDashboard() {
  const { portfolio, setPortfolio } = useStore()
  const [loading, setLoading]       = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await portfolioApi.getPortfolio()
      setPortfolio(data)
    } catch (e) {
      toast.error('Failed to load portfolio')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Live Demat Portfolio</div>
        <div style={{ display: 'flex', gap: 8 }}>
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
        <StatCard label="Cash Balance"      icon={DollarSign}  value={fmt(p?.cash_balance)} />
        <StatCard label="Invested Value"    icon={BarChart2}   value={fmt(p?.total_invested)} />
        <StatCard label="Current Value"     icon={TrendingUp}  value={fmt(p?.total_current_value)} />
        <StatCard
          label="Total P&L"
          icon={pnlPositive ? TrendingUp : TrendingDown}
          value={`${pnlPositive ? '+' : ''}${fmt(p?.total_pnl)} (${p?.total_pnl_pct?.toFixed(2)}%)`}
          color={pnlPositive ? 'var(--buy)' : 'var(--sell)'}
        />
      </div>

      {/* Main grid: Positions + Trade Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Open Positions ({p?.positions?.length ?? 0})</div>
          <PositionTable positions={p?.positions ?? []} />
        </div>
        <TradePanel />
      </div>

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
