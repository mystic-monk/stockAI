import { useEffect, useState } from 'react'
import useStore from '../store/useStore'
import { stocksApi } from '../services/api'
import QuoteBar from '../components/stock/QuoteBar'
import ChartContainer from '../components/charts/ChartContainer'
import { CHART_REGISTRY } from '../components/charts/chartRegistry'
import PredictionCard from '../components/prediction/PredictionCard'
import IndicatorPanel from '../components/prediction/IndicatorPanel'

export default function AnalysisPage() {
  const {
    selectedStock,
    prediction,
    historyBars, setHistoryBars,
    indicators,  setIndicators,
  } = useStore()

  const [peerData, setPeerData] = useState(null)

  // Fetch history + indicators whenever stock changes
  useEffect(() => {
    if (!selectedStock) return

    // Immediately Purge Legacy UI arrays
    // Fixes the frozen chart caching glitch
    setHistoryBars([])
    setIndicators(null)
    setPeerData(null)

    stocksApi.getHistory(selectedStock.stock_code, selectedStock.exchange_code).then((d) => {
      setHistoryBars(d.bars || [])
    }).catch(console.error)

    stocksApi.getIndicators(selectedStock.stock_code, selectedStock.exchange_code).then((d) => {
      setIndicators(d)
    }).catch(console.error)

    // Resolve sector peer after a 1200ms async waterfall delay 
    // Decouples ICICIDirect blocking and loads peer chart gently into the background perfectly
    const timerId = setTimeout(() => {
      stocksApi.getPeer(selectedStock.stock_code).then((p) => {
        const peerCode = p.peer.stock_code
        stocksApi.getHistory(peerCode, 'NSE').then((hist) => {
          setPeerData({ name: p.peer.name, code: peerCode, bars: hist.bars })
        })
      }).catch(console.error)
    }, 1200)

    return () => clearTimeout(timerId)
  }, [selectedStock?.stock_code])

  const series = indicators?.series || {}

  return (
    <div className="main-content">
      {/* Live quote bar */}
      <QuoteBar />

      {/* Modular chart grid — driven entirely by CHART_REGISTRY */}
      <div className="charts-grid">
        {CHART_REGISTRY.filter((c) => c.enabled).map((chartDef) => {
          const ChartComp = chartDef.component

          // Build the props each chart type needs
          let chartProps = {}
          if (chartDef.id === 'candlestick') chartProps = { bars: historyBars, indicators, prediction, peerData, height: chartDef.height }
          if (chartDef.id === 'volume')       chartProps = { bars: historyBars, height: chartDef.height }
          if (chartDef.id === 'rsi')          chartProps = { series: series.rsi || [], height: chartDef.height }
          if (chartDef.id === 'macd')         chartProps = { series: { macd: series.macd, macd_signal: series.macd_signal, macd_hist: series.macd_hist }, height: chartDef.height }

          return (
            <ChartContainer key={chartDef.id} title={chartDef.title} legend={chartDef.legend}>
              <ChartComp {...chartProps} />
            </ChartContainer>
          )
        })}
      </div>

      {/* AI Prediction + Indicator cards */}
      <div className="analysis-grid">
        <PredictionCard />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-secondary)' }}>Technical Indicators</div>
          <IndicatorPanel />
        </div>
      </div>
    </div>
  )
}
