import { useState } from 'react'
import { portfolioApi } from '../../services/api'
import useStore from '../../store/useStore'
import toast from 'react-hot-toast'

export default function TradePanel() {
  const { selectedStock, quote, portfolio, setPortfolio } = useStore()
  const [action, setAction]     = useState('BUY')
  const [quantity, setQuantity] = useState('')
  const [loading, setLoading]   = useState(false)

  const currentPrice = quote?.last_price ?? null
  const stockCode   = selectedStock?.stock_code ?? ''
  const totalCost   = currentPrice && quantity ? (currentPrice * Number(quantity)).toFixed(2) : null
  const cashBalance = portfolio?.cash_balance ?? 0

  const submit = async () => {
    if (!stockCode || !quantity || Number(quantity) <= 0) {
      toast.error('Enter a valid quantity')
      return
    }
    setLoading(true)
    try {
      await portfolioApi.placeTrade({
        stock_code:    stockCode,
        exchange_code: selectedStock?.exchange_code ?? 'NSE',
        action,
        quantity:      Number(quantity),
        price:         currentPrice ?? undefined,
      })
      toast.success(`${action} ${quantity} × ${stockCode} executed`)
      setQuantity('')
      const updated = await portfolioApi.getPortfolio()
      setPortfolio(updated)
    } catch (e) {
      toast.error(e.message || 'Trade failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="trade-panel">
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Execute Live Trade</span>
        {currentPrice && (
          <span className="mono" style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
            LTP ₹{currentPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        )}
      </div>

      <div className="trade-tabs">
        <button
          className={`trade-tab ${action === 'BUY' ? 'active-buy' : ''}`}
          onClick={() => setAction('BUY')}
        >BUY</button>
        <button
          className={`trade-tab ${action === 'SELL' ? 'active-sell' : ''}`}
          onClick={() => setAction('SELL')}
        >SELL</button>
      </div>

      <div className="trade-form">
        <div className="form-group">
          <label className="form-label">Stock</label>
          <input className="form-input" value={stockCode || 'Select a stock'} readOnly style={{ opacity: 0.7 }} />
        </div>
        <div className="form-group">
          <label className="form-label">Quantity (shares)</label>
          <input
            className="form-input"
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="e.g. 10"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Price</label>
          <input
            className="form-input"
            value={currentPrice ? `₹${currentPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (Market)` : 'Select a stock'}
            readOnly
            style={{ opacity: 0.7 }}
          />
        </div>

        {totalCost && (
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 6, padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)' }}>
              <span>Total {action === 'BUY' ? 'Cost' : 'Proceeds'}</span>
              <span className="mono" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                ₹{Number(totalCost).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            {action === 'BUY' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                <span>Cash after trade</span>
                <span className="mono" style={{ color: cashBalance - totalCost < 0 ? 'var(--sell)' : 'var(--buy)' }}>
                  ₹{(cashBalance - Number(totalCost)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>
        )}

        <button
          className={`trade-btn ${action.toLowerCase()}`}
          onClick={submit}
          disabled={loading || !stockCode || !quantity}
        >
          {loading ? 'Executing…' : `${action} ${quantity || ''} ${stockCode}`}
        </button>
      </div>
    </div>
  )
}
