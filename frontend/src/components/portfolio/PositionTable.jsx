import { useState, useMemo } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import useStore from '../../store/useStore'

const fmt = (n) =>
  n != null
    ? `₹${parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—'

const pnlColor = (v) => (v >= 0 ? 'var(--buy)' : 'var(--sell)')

// ── AI signal sub-components ──────────────────────────────────────────────────

function SignalBadge({ signal }) {
  const cfg = {
    BUY:  { color: 'var(--buy)',  bg: 'var(--buy-dim)',  icon: <TrendingUp  size={10} />, label: 'BUY' },
    SELL: { color: 'var(--sell)', bg: 'var(--sell-dim)', icon: <TrendingDown size={10} />, label: 'SELL' },
    HOLD: { color: 'var(--hold)', bg: 'var(--hold-dim)', icon: <Minus size={10} />,        label: 'HOLD' },
  }
  const c = cfg[signal] || cfg.HOLD
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '2px 8px', borderRadius: 10,
      background: c.bg, color: c.color,
      fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap',
    }}>
      {c.icon} {c.label}
    </span>
  )
}

function ConfBar({ value, signal }) {
  const col = { BUY: 'var(--buy)', SELL: 'var(--sell)', HOLD: 'var(--hold)' }[signal] || 'var(--primary)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 70 }}>
      <div style={{ flex: 1, height: 4, background: 'var(--bg-elevated)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: col, borderRadius: 2, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-secondary)', minWidth: 26 }}>
        {value?.toFixed(0)}%
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PositionTable({ positions = [], predictions = null }) {
  const setActiveTab     = useStore((s) => s.setActiveTab)
  const setSelectedStock = useStore((s) => s.setSelectedStock)
  const [sortConfig, setSortConfig] = useState({ key: 'current_value', direction: 'desc' })

  const handleSort = (key) => {
    setSortConfig(prev =>
      prev.key === key
        ? { key, direction: prev.direction === 'desc' ? 'asc' : 'desc' }
        : { key, direction: 'desc' }
    )
  }

  const sortedPositions = useMemo(() => {
    return [...positions].sort((a, b) => {
      // Allow sorting on prediction fields too
      const pa = predictions?.[a.stock_code]
      const pb = predictions?.[b.stock_code]
      const valA = a[sortConfig.key] ?? pa?.[sortConfig.key]
      const valB = b[sortConfig.key] ?? pb?.[sortConfig.key]
      if (typeof valA === 'string') {
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1
        return 0
      }
      return sortConfig.direction === 'asc' ? (valA ?? 0) - (valB ?? 0) : (valB ?? 0) - (valA ?? 0)
    })
  }, [positions, sortConfig, predictions])

  const goAnalyze = (pos) => {
    setSelectedStock({ stock_code: pos.stock_code, exchange_code: pos.exchange_code || 'NSE', name: pos.stock_code, sector: pos.sector })
    setActiveTab('analysis')
  }

  if (positions.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '50px 20px' }}>
        <div className="empty-state-icon">📂</div>
        <div className="empty-state-text">No active Demat holdings found on ICICI Direct API.</div>
      </div>
    )
  }

  const hasPred = predictions !== null
  const Th = ({ label, sortKey }) => (
    <th onClick={() => handleSort(sortKey)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
        title={`Sort by ${label}`}>
      {label} {sortConfig.key === sortKey ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
    </th>
  )

  return (
    <div className="positions-table-wrap">
      <table>
        <thead>
          <tr>
            <Th label="Stock"         sortKey="stock_code" />
            <Th label="Industry"       sortKey="sector" />
            <Th label="Qty"           sortKey="quantity" />
            <Th label="Avg Buy"       sortKey="avg_buy_price" />
            <Th label="LTP"           sortKey="current_price" />
            <Th label="Invested"      sortKey="invested_value" />
            <Th label="Current Value" sortKey="current_value" />
            <Th label="P&L"           sortKey="pnl" />
            <Th label="P&L %"         sortKey="pnl_pct" />
            {hasPred && <Th label="Signal"    sortKey="signal" />}
            {hasPred && <Th label="Conf"      sortKey="confidence" />}
            {hasPred && <Th label="Target"    sortKey="target_price" />}
            {hasPred && <Th label="Stop Loss" sortKey="stop_loss" />}
            {hasPred && <Th label="Exp Gain"  sortKey="expected_gain" />}
          </tr>
        </thead>
        <tbody>
          {sortedPositions.map((pos) => {
            const isPositive = pos.pnl >= 0
            const pred = predictions?.[pos.stock_code]
            const hasFailed = pred?.error

            return (
              <tr key={pos.stock_code}>
                <td onClick={() => goAnalyze(pos)} style={{ cursor: 'pointer' }} title="Click to deep-analyze">
                  <div style={{ fontWeight: 700, color: 'var(--accent-blue)', textDecoration: 'underline' }}>
                    {pos.stock_code}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pos.exchange_code}</div>
                </td>
                <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pos.sector || 'Unknown'}</td>
                <td>{pos.quantity}</td>
                <td>{fmt(pos.avg_buy_price)}</td>
                <td>{fmt(pos.current_price)}</td>
                <td>{fmt(pos.invested_value)}</td>
                <td>{fmt(pos.current_value)}</td>
                <td style={{ color: pnlColor(pos.pnl), fontWeight: 600 }}>
                  {isPositive ? '+' : ''}{fmt(pos.pnl)}
                </td>
                <td style={{ color: pnlColor(pos.pnl_pct), fontWeight: 600 }}>
                  {isPositive ? '+' : ''}{pos.pnl_pct?.toFixed(2)}%
                </td>

                {hasPred && (
                  <td>
                    {hasFailed
                      ? <span style={{ fontSize: 10, color: 'var(--text-muted)' }} title={pred.error}>⚠ failed</span>
                      : pred ? <SignalBadge signal={pred.signal} /> : '—'
                    }
                  </td>
                )}
                {hasPred && (
                  <td style={{ minWidth: 90 }}>
                    {pred && !hasFailed ? <ConfBar value={pred.confidence} signal={pred.signal} /> : '—'}
                  </td>
                )}
                {hasPred && (
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {pred && !hasFailed ? (
                      <>
                        <div>{fmt(pred.target_price)}</div>
                        <div style={{ fontSize: 10, color: pred.price_change_pct >= 0 ? 'var(--buy)' : 'var(--sell)' }}>
                          {pred.price_change_pct >= 0 ? '+' : ''}{pred.price_change_pct?.toFixed(2)}%
                        </div>
                      </>
                    ) : '—'}
                  </td>
                )}
                {hasPred && (
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--sell)' }}>
                    {pred && !hasFailed ? fmt(pred.stop_loss) : '—'}
                  </td>
                )}
                {hasPred && (
                  <td style={{
                    fontFamily: 'monospace', fontSize: 12, fontWeight: 600,
                    color: (pred?.expected_gain ?? 0) >= 0 ? 'var(--buy)' : 'var(--sell)',
                  }}>
                    {pred && !hasFailed
                      ? `${pred.expected_gain >= 0 ? '+' : ''}${fmt(pred.expected_gain)}`
                      : '—'
                    }
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
