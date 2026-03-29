import { useState, useMemo } from 'react'
import useStore from '../../store/useStore'

const fmt = (n, prefix = '₹') =>
  n != null
    ? `${prefix}${parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—'

const pnlColor = (v) => (v >= 0 ? 'var(--buy)' : 'var(--sell)')

export default function PositionTable({ positions = [] }) {
  const setActiveTab = useStore((s) => s.setActiveTab)
  const setSelectedStock = useStore((s) => s.setSelectedStock)
  const [sortConfig, setSortConfig] = useState({ key: 'current_value', direction: 'desc' })

  const handleSort = (key) => {
    let direction = 'desc'
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc'
    }
    setSortConfig({ key, direction })
  }

  const sortedPositions = useMemo(() => {
    let sortableItems = [...positions]
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        const valA = a[sortConfig.key]
        const valB = b[sortConfig.key]

        // Handle string alphabetic sorting (Stock code, sector) vs numeric (PnL, value)
        if (typeof valA === 'string') {
           if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1
           if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1
           return 0
        }

        return sortConfig.direction === 'asc' ? (valA || 0) - (valB || 0) : (valB || 0) - (valA || 0)
      })
    }
    return sortableItems
  }, [positions, sortConfig])

  const goAnalyze = (pos) => {
    setSelectedStock({
      stock_code: pos.stock_code,
      exchange_code: pos.exchange_code || 'NSE',
      name: pos.stock_code, // fallback name
      sector: pos.sector
    })
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

  const Th = ({ label, sortKey }) => (
    <th 
      onClick={() => handleSort(sortKey)} 
      style={{ cursor: 'pointer', userSelect: 'none' }}
      title={`Sort by ${label}`}
    >
      {label} {sortConfig.key === sortKey ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
    </th>
  )

  return (
    <div className="positions-table-wrap">
      <table>
        <thead>
          <tr style={{ cursor: 'pointer' }}>
            <Th label="Stock" sortKey="stock_code" />
            <Th label="Sector" sortKey="sector" />
            <Th label="Qty" sortKey="quantity" />
            <Th label="Avg Buy" sortKey="avg_buy_price" />
            <Th label="LTP" sortKey="current_price" />
            <Th label="Invested" sortKey="invested_value" />
            <Th label="Current Value" sortKey="current_value" />
            <Th label="P&L" sortKey="pnl" />
            <Th label="P&L %" sortKey="pnl_pct" />
          </tr>
        </thead>
        <tbody>
          {sortedPositions.map((pos) => {
            const isPositive = pos.pnl >= 0
            return (
              <tr key={pos.stock_code}>
                <td 
                  onClick={() => goAnalyze(pos)}
                  style={{ cursor: 'pointer' }}
                  title="Click to run AI Prediction"
                >
                  <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, color: 'var(--accent-blue)', textDecoration: 'underline' }}>
                    {pos.stock_code}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pos.exchange_code}</div>
                </td>
                <td style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'var(--text-muted)' }}>
                  {pos.sector || 'Unknown'}
                </td>
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
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
