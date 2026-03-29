import { AlertCircle, Brain, RefreshCw, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import useStore from '../../store/useStore'
import { predictionsApi } from '../../services/api'
import toast from 'react-hot-toast'

const fmt = (n) =>
  n != null ? `₹${parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'

const SIGNAL_ICONS = { BUY: TrendingUp, SELL: TrendingDown, HOLD: Minus }
const SIGNAL_COLOR = { BUY: 'var(--buy)', SELL: 'var(--sell)', HOLD: 'var(--hold)' }

function ConfidenceMeter({ value, signal }) {
  const color = SIGNAL_COLOR[signal] || 'var(--accent-blue)'
  return (
    <div className="confidence-meter">
      <div className="confidence-label">
        <span>AI Confidence</span>
        <span className="confidence-pct">{value?.toFixed(1)}%</span>
      </div>
      <div className="confidence-track">
        <div
          className="confidence-fill"
          style={{ width: `${value}%`, background: `linear-gradient(90deg, ${color}88, ${color})` }}
        />
      </div>
    </div>
  )
}

export default function PredictionCard() {
  const { selectedStock, prediction, setPrediction, isAnalyzing, setIsAnalyzing } = useStore()

  const analyze = async () => {
    if (!selectedStock || isAnalyzing) return
    setIsAnalyzing(true)
    const toastId = toast.loading('Running AI analysis — training models…', { duration: 120000 })
    try {
      const result = await predictionsApi.analyze(selectedStock.stock_code, selectedStock.exchange_code)
      setPrediction(result)
      toast.success(`Analysis complete: ${result.signal}`, { id: toastId })
    } catch (e) {
      toast.error(e.message || 'Analysis failed', { id: toastId })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const signal = prediction?.signal
  const Icon = signal ? SIGNAL_ICONS[signal] : Brain

  return (
    <div className="prediction-card fade-in">
      <div className="prediction-card-header">
        <span className="prediction-card-title">AI Prediction</span>
        {signal && (
          <span className={`signal-badge ${signal}`}>
            <Icon size={14} />
            {signal}
          </span>
        )}
      </div>

      <div className="prediction-card-body">
        {prediction ? (
          <>
            <ConfidenceMeter value={prediction.confidence} signal={signal} />

            <div className="price-targets">
              <div className="price-target-item">
                <div className="price-target-label">Current</div>
                <div className="price-target-value">{fmt(prediction.current_price)}</div>
              </div>
              <div className="price-target-item">
                <div className="price-target-label">LSTM Forecast</div>
                <div
                  className="price-target-value"
                  style={{ color: prediction.price_change_pct >= 0 ? 'var(--buy)' : 'var(--sell)' }}
                >
                  {fmt(prediction.predicted_price)}
                  <span style={{ fontSize: 11, marginLeft: 4 }}>
                    ({prediction.price_change_pct >= 0 ? '+' : ''}{prediction.price_change_pct?.toFixed(2)}%)
                  </span>
                </div>
              </div>
              <div className="price-target-item">
                <div className="price-target-label">Target</div>
                <div className="price-target-value" style={{ color: 'var(--buy)' }}>{fmt(prediction.target_price)}</div>
              </div>
              <div className="price-target-item">
                <div className="price-target-label">Stop Loss</div>
                <div className="price-target-value" style={{ color: 'var(--sell)' }}>{fmt(prediction.stop_loss)}</div>
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <div style={{ flex: 1, background: 'var(--bg-elevated)', borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>RF UP Prob</div>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
                  {prediction.rf_probability_up?.toFixed(1)}%
                </div>
              </div>
              <div style={{ flex: 1, background: 'var(--bg-elevated)', borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>RSI</div>
                <div
                  style={{
                    fontSize: 14, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace',
                    color: prediction.indicators?.rsi > 70 ? 'var(--sell)' : prediction.indicators?.rsi < 30 ? 'var(--buy)' : 'var(--text-primary)',
                  }}
                >
                  {prediction.indicators?.rsi?.toFixed(1) ?? '—'}
                </div>
              </div>
            </div>

            {/* Reasoning */}
            <ul className="reasoning-list">
              {prediction.reasoning?.map((r, i) => (
                <li key={i} className="reasoning-item">
                  <AlertCircle size={12} className="reasoning-icon" color="var(--accent-blue)" />
                  {r}
                </li>
              ))}
            </ul>

            <button className="analyze-btn" onClick={analyze} disabled={isAnalyzing}>
              <RefreshCw size={13} className={isAnalyzing ? 'pulse' : ''} />
              {isAnalyzing ? 'Analysing…' : 'Re-Analyse'}
            </button>
          </>
        ) : (
          <div className="empty-state" style={{ padding: '30px 0' }}>
            <Brain size={32} color="var(--text-muted)" />
            <div className="empty-state-text">
              {selectedStock ? 'Click Analyse to run AI models' : 'Select a stock first'}
            </div>
            {selectedStock && (
              <button className="analyze-btn" onClick={analyze} disabled={isAnalyzing}>
                <Brain size={13} />
                {isAnalyzing ? 'Training models…' : 'Analyse with AI'}
              </button>
            )}
          </div>
        )}

        <div className="disclaimer" style={{ marginTop: 14 }}>
          ⚠️ AI predictions are for informational purposes only. Not financial advice. Always do your own research.
        </div>
      </div>
    </div>
  )
}
