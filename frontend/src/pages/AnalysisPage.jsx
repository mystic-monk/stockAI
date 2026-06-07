import { useEffect, useState } from 'react'
import { Brain, RefreshCw, TrendingUp, TrendingDown, Minus, AlertCircle, CheckCircle, Activity } from 'lucide-react'
import useStore from '../store/useStore'
import { stocksApi, predictionsApi } from '../services/api'
import QuoteBar from '../components/stock/QuoteBar'
import ChartContainer from '../components/charts/ChartContainer'
import { CHART_REGISTRY } from '../components/charts/chartRegistry'
import IndicatorPanel from '../components/prediction/IndicatorPanel'
import ComparisonPanel from '../components/analysis/ComparisonPanel'
import toast from 'react-hot-toast'

const fmt = (n) =>
  n != null ? `₹${parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'

const SIGNAL_COLOR = { BUY: 'var(--buy)', SELL: 'var(--sell)', HOLD: 'var(--hold)' }
const SIGNAL_BG    = { BUY: 'var(--buy-dim)', SELL: 'var(--sell-dim)', HOLD: 'var(--bg-elevated)' }
const SIGNAL_ICON  = { BUY: TrendingUp, SELL: TrendingDown, HOLD: Minus }

// ── Quick indicator read (before AI runs) ──────────────────────────────────────

function quickSignal(indicators) {
  if (!indicators?.latest) return null
  const l = indicators.latest
  const signals = []

  if (l.rsi != null) {
    if (l.rsi < 30)      signals.push({ label: `RSI ${l.rsi?.toFixed(0)} oversold`, bias: 1 })
    else if (l.rsi > 70) signals.push({ label: `RSI ${l.rsi?.toFixed(0)} overbought`, bias: -1 })
    else                 signals.push({ label: `RSI ${l.rsi?.toFixed(0)} neutral`, bias: 0 })
  }
  if (l.macd_hist != null) {
    if (l.macd_hist > 0) signals.push({ label: 'MACD bullish crossover', bias: 1 })
    else                 signals.push({ label: 'MACD bearish crossover', bias: -1 })
  }
  if (l.sma_20 != null && l.sma_50 != null) {
    const aboveBoth = (indicators.latest._currentPrice || 0) > l.sma_20
    // Use SMA slope as proxy
    if (l.sma_20 > l.sma_50) signals.push({ label: 'SMA 20 > SMA 50 (uptrend)', bias: 1 })
    else                      signals.push({ label: 'SMA 20 < SMA 50 (downtrend)', bias: -1 })
  }
  if (l.stoch_k != null) {
    if (l.stoch_k < 20)      signals.push({ label: `Stoch %K ${l.stoch_k?.toFixed(0)} oversold`, bias: 1 })
    else if (l.stoch_k > 80) signals.push({ label: `Stoch %K ${l.stoch_k?.toFixed(0)} overbought`, bias: -1 })
  }

  if (!signals.length) return null
  const score = signals.reduce((s, x) => s + x.bias, 0)
  const direction = score >= 2 ? 'BUY' : score <= -2 ? 'SELL' : 'HOLD'
  return { direction, signals, score }
}

// ── Decision card ──────────────────────────────────────────────────────────────

function DecisionCard({ prediction, indicators, isAnalyzing, onAnalyze, selectedStock }) {
  const quick  = !prediction ? quickSignal(indicators) : null
  const signal = prediction?.signal || quick?.direction
  const Icon   = signal ? SIGNAL_ICON[signal] : Activity
  const col    = SIGNAL_COLOR[signal] || 'var(--text-muted)'
  const hasPred = !!prediction

  return (
    <div style={{
      background: signal ? `linear-gradient(135deg, var(--bg-surface), ${SIGNAL_BG[signal]})` : 'var(--bg-surface)',
      border: `1px solid ${signal ? col + '55' : 'var(--border)'}`,
      borderRadius: 12, padding: '18px 20px',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      {/* Top row: badge + action button */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            {hasPred ? 'AI Decision' : quick ? 'Indicator Signal' : 'Decision'}
          </div>
          {signal ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 18px', borderRadius: 10, background: SIGNAL_BG[signal], border: `1px solid ${col}66` }}>
              <Icon size={18} style={{ color: col }} />
              <span style={{ fontSize: 22, fontWeight: 900, color: col }}>{signal}</span>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {selectedStock ? 'Run AI analysis for a signal' : 'Select a stock'}
            </div>
          )}
        </div>

        <button
          onClick={onAnalyze}
          disabled={!selectedStock || isAnalyzing}
          style={{
            padding: '9px 16px', borderRadius: 8, flexShrink: 0,
            background: isAnalyzing ? 'var(--bg-elevated)' : hasPred ? 'var(--bg-elevated)' : 'var(--primary)',
            border: `1px solid ${hasPred ? col + '66' : 'var(--primary)'}`,
            color: hasPred ? col : '#fff',
            fontSize: 12, fontWeight: 600,
            cursor: (!selectedStock || isAnalyzing) ? 'not-allowed' : 'pointer',
            opacity: (!selectedStock || isAnalyzing) ? 0.6 : 1,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <Brain size={13} className={isAnalyzing ? 'pulse' : ''} />
          {isAnalyzing ? 'Analysing…' : hasPred ? 'Re-Analyse' : 'Analyse with AI'}
        </button>
      </div>

      {/* AI prediction details */}
      {hasPred && (
        <>
          {/* Confidence */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
              <span>AI Confidence</span>
              <span style={{ fontFamily: 'monospace', color: col, fontWeight: 700 }}>{prediction.confidence?.toFixed(1)}%</span>
            </div>
            <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${prediction.confidence}%`, height: '100%', background: `linear-gradient(90deg,${col}88,${col})`, borderRadius: 3, transition: 'width 0.5s' }} />
            </div>
          </div>

          {/* Price grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[
              { label: 'Current',   value: fmt(prediction.current_price),   color: 'var(--text-primary)' },
              { label: 'Predicted', value: fmt(prediction.predicted_price), color: prediction.price_change_pct >= 0 ? 'var(--buy)' : 'var(--sell)' },
              { label: 'Target',    value: fmt(prediction.target_price),    color: 'var(--buy)' },
              { label: 'Stop Loss', value: fmt(prediction.stop_loss),       color: 'var(--sell)' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: 'var(--bg-elevated)', borderRadius: 7, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color }}>{value}</div>
              </div>
            ))}
          </div>

          {prediction.price_change_pct != null && (
            <div style={{
              fontSize: 13, fontWeight: 700, textAlign: 'center', padding: '7px',
              borderRadius: 7, background: prediction.price_change_pct >= 0 ? 'var(--buy-dim)' : 'var(--sell-dim)',
              color: prediction.price_change_pct >= 0 ? 'var(--buy)' : 'var(--sell)',
            }}>
              Expected move: {prediction.price_change_pct >= 0 ? '+' : ''}{prediction.price_change_pct?.toFixed(2)}%
            </div>
          )}

          {/* Reasoning */}
          {prediction.reasoning?.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {prediction.reasoning.map((r, i) => (
                <li key={i} style={{ display: 'flex', gap: 7, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  <CheckCircle size={11} style={{ color: col, flexShrink: 0, marginTop: 2 }} />
                  {r}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Quick indicator signals (before AI runs) */}
      {!hasPred && quick && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
            Based on technical indicators — run AI analysis for a full signal
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {quick.signals.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 7, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                <span style={{ color: s.bias > 0 ? 'var(--buy)' : s.bias < 0 ? 'var(--sell)' : 'var(--text-muted)', flexShrink: 0 }}>
                  {s.bias > 0 ? '▲' : s.bias < 0 ? '▼' : '●'}
                </span>
                {s.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Model votes ────────────────────────────────────────────────────────────────

function ModelVoteChip({ model, signal }) {
  const col = SIGNAL_COLOR[signal] || 'var(--text-muted)'
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
      padding: '6px 10px', borderRadius: 8,
      background: SIGNAL_BG[signal] || 'var(--bg-elevated)',
      border: `1px solid ${col}55`, minWidth: 64,
    }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{model}</span>
      <span style={{ fontSize: 12, fontWeight: 800, color: col }}>{signal}</span>
    </div>
  )
}

// ── Stock picker ───────────────────────────────────────────────────────────────

function StockPicker({ onSelect }) {
  const [stocks, setStocks] = useState([])
  useEffect(() => {
    stocksApi.getPopular().then(d => setStocks(d.stocks || [])).catch(() => {})
  }, [])

  const SECTOR_COLOR = {
    Banking: '#3b82f6', IT: '#10b981', Energy: '#f59e0b',
    Finance: '#8b5cf6', FMCG: '#ec4899', Auto: '#f97316',
    Telecom: '#06b6d4', Infrastructure: '#84cc16', Pharma: '#a78bfa', Consumer: '#fb923c',
  }

  return (
    <div style={{ padding: '28px 24px' }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <Brain size={36} style={{ opacity: 0.25, marginBottom: 10 }} />
        <div style={{ fontSize: 20, fontWeight: 700 }}>Select a stock to analyse</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
          Click any stock below, use the search bar above, or click a holding in the Portfolio tab
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
        {stocks.map(s => {
          const sc = SECTOR_COLOR[s.sector] || 'var(--primary)'
          return (
            <button key={s.stock_code} onClick={() => onSelect(s)}
              style={{
                background: 'var(--bg-surface)', border: `1px solid ${sc}33`,
                borderRadius: 10, padding: '14px 12px', cursor: 'pointer', textAlign: 'left',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = sc; e.currentTarget.style.background = sc + '11' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = sc + '33'; e.currentTarget.style.background = 'var(--bg-surface)' }}
            >
              <div style={{ fontWeight: 700, fontSize: 14, color: sc }}>{s.stock_code}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.3 }}>{s.name}</div>
              <div style={{ display: 'inline-block', marginTop: 6, fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 6, background: sc + '22', color: sc }}>{s.sector}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AnalysisPage() {
  const {
    selectedStock, setSelectedStock, setActiveTab,
    prediction, setPrediction,
    historyBars, setHistoryBars,
    indicators,  setIndicators,
    isAnalyzing, setIsAnalyzing,
  } = useStore()

  const [peerData, setPeerData]   = useState(null)
  const [dataError, setDataError] = useState(null)
  const [barsLoading, setBarsLoading] = useState(false)

  useEffect(() => {
    if (!selectedStock) return
    setPeerData(null)
    setDataError(null)
    setBarsLoading(true)

    // Fetch bars and indicators in parallel — render immediately, don't block
    stocksApi.getHistory(selectedStock.stock_code, selectedStock.exchange_code)
      .then(d => { setHistoryBars(d.bars || []); setDataError(null) })
      .catch(e => { setHistoryBars([]); setDataError(e.message || 'No price data available') })
      .finally(() => setBarsLoading(false))

    stocksApi.getIndicators(selectedStock.stock_code, selectedStock.exchange_code)
      .then(d => setIndicators(d))
      .catch(() => setIndicators(null))

    const tid = setTimeout(() => {
      stocksApi.getPeer(selectedStock.stock_code)
        .then(p => stocksApi.getHistory(p.peer.stock_code, 'NSE')
          .then(h => setPeerData({ name: p.peer.name, code: p.peer.stock_code, bars: h.bars }))
        ).catch(() => {})
    }, 1200)

    return () => clearTimeout(tid)
  }, [selectedStock?.stock_code])

  const analyze = async () => {
    if (!selectedStock || isAnalyzing) return
    setIsAnalyzing(true)
    const tid = toast.loading('Running AI analysis…', { duration: 120000 })
    try {
      const result = await predictionsApi.analyze(selectedStock.stock_code, selectedStock.exchange_code)
      setPrediction(result)
      toast.success(`Signal: ${result.signal}`, { id: tid })
    } catch (e) {
      toast.error(e.message || 'Analysis failed', { id: tid })
    } finally {
      setIsAnalyzing(false)
    }
  }

  if (!selectedStock) {
    const pick = (stock) => { setSelectedStock(stock); setActiveTab('analysis') }
    return <div className="main-content"><StockPicker onSelect={pick} /></div>
  }

  const series = indicators?.series || {}

  return (
    <div className="main-content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Live quote bar */}
      <QuoteBar />

      {dataError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8, background: 'var(--sell-dim)', border: '1px solid var(--sell)', color: 'var(--sell)', fontSize: 12 }}>
          <AlertCircle size={13} /> {dataError}
        </div>
      )}

      {/* Decision card — full width, prominent */}
      <DecisionCard
        prediction={prediction}
        indicators={indicators}
        isAnalyzing={isAnalyzing}
        onAnalyze={analyze}
        selectedStock={selectedStock}
      />

      {/* Charts + side panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>

        {/* Charts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {barsLoading && !historyBars.length && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 12, padding: '8px 0' }}>
              <RefreshCw size={13} className="pulse" /> Loading price data…
            </div>
          )}
          {CHART_REGISTRY.filter(c => c.enabled).map(chartDef => {
            const ChartComp = chartDef.component
            let props = {}
            if (chartDef.id === 'candlestick') props = { bars: historyBars, indicators, prediction, peerData, height: chartDef.height }
            if (chartDef.id === 'volume')       props = { bars: historyBars, height: chartDef.height }
            if (chartDef.id === 'rsi')          props = { series: series.rsi || [], height: chartDef.height }
            if (chartDef.id === 'macd')         props = { series: { macd: series.macd, macd_signal: series.macd_signal, macd_hist: series.macd_hist }, height: chartDef.height }
            return (
              <ChartContainer key={chartDef.id} title={chartDef.title} legend={chartDef.legend}>
                <ChartComp {...props} />
              </ChartContainer>
            )
          })}
        </div>

        {/* Right sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Model votes (only shown post AI-analysis if available) */}
          {prediction?.model_votes && Object.keys(prediction.model_votes).length > 0 && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Model Votes</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.entries(prediction.model_votes).map(([model, sig]) => (
                  <ModelVoteChip key={model} model={model} signal={sig} />
                ))}
              </div>
              {prediction.agreement_pct != null && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
                  Agreement: <strong style={{ color: 'var(--text-primary)' }}>{prediction.agreement_pct?.toFixed(0)}%</strong>
                  {prediction.n_models && ` · ${prediction.n_models} models`}
                </div>
              )}
            </div>
          )}

          {/* Technical indicators */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Technical Indicators</div>
            {indicators ? <IndicatorPanel /> : (
              <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>
                <RefreshCw size={14} className="pulse" style={{ marginBottom: 6 }} />
                <div>Loading indicators…</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Comparison panel */}
      <ComparisonPanel primaryStock={selectedStock} />
    </div>
  )
}
