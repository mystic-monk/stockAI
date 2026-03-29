import useStore from '../../store/useStore'

function IndGauge({ label, value, min, max, greenBelow, redAbove, unit = '' }) {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
  let color = 'var(--accent-blue)'
  if (greenBelow != null && value <= greenBelow) color = 'var(--buy)'
  if (redAbove   != null && value >= redAbove)   color = 'var(--sell)'

  return (
    <div className="indicator-card" style={{ fontSize: 13 }}>
      <div className="indicator-card-label">{label}</div>
      <div className="indicator-value" style={{ color }}>
        {value != null ? `${value.toFixed(2)}${unit}` : '—'}
      </div>
      {value != null && (
        <div className="indicator-bar">
          <div className="indicator-bar-fill" style={{ width: `${pct}%`, background: color }} />
        </div>
      )}
    </div>
  )
}

function IndValue({ label, value, prefix = '', suffix = '', color }) {
  return (
    <div className="indicator-card">
      <div className="indicator-card-label">{label}</div>
      <div className="indicator-value" style={{ color: color || 'var(--text-primary)', fontSize: 17 }}>
        {value != null ? `${prefix}${typeof value === 'number' ? value.toFixed(2) : value}${suffix}` : '—'}
      </div>
    </div>
  )
}

export default function IndicatorPanel() {
  const { indicators } = useStore()
  const latest = indicators?.latest || {}

  const macdColor = latest.macd_hist > 0 ? 'var(--buy)' : 'var(--sell)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="indicators-grid">
        <IndGauge
          label="RSI (14)"
          value={latest.rsi}
          min={0} max={100}
          greenBelow={30} redAbove={70}
        />
        <IndValue
          label="MACD Histogram"
          value={latest.macd_hist}
          color={latest.macd_hist != null ? (latest.macd_hist > 0 ? 'var(--buy)' : 'var(--sell)') : undefined}
        />
        <IndValue label="SMA 20"    value={latest.sma_20}  prefix="₹" />
        <IndValue label="SMA 50"    value={latest.sma_50}  prefix="₹" />
        <IndValue label="SMA 200"   value={latest.sma_200} prefix="₹" />
        <IndGauge
          label="Stochastic %K"
          value={latest.stoch_k}
          min={0} max={100}
          greenBelow={20} redAbove={80}
        />
        <IndValue label="ATR (14)"  value={latest.atr}     prefix="₹" />
        <IndValue
          label="Volume Ratio"
          value={latest.volume_sma_ratio}
          suffix="x"
          color={latest.volume_sma_ratio > 1.5 ? 'var(--buy)' : undefined}
        />
      </div>
    </div>
  )
}
