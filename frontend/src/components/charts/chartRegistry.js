/**
 * Chart Registry — register every chart type here.
 *
 * Adding a new chart is ONE step:
 *   1. Import your component
 *   2. Add an entry to CHART_REGISTRY
 *
 * The AnalysisPage will automatically render all charts in the registry
 * whose `enabled` flag is true.
 */
import CandlestickChart from './CandlestickChart'
import MacdChart from './MacdChart'
import RsiChart from './RsiChart'
import VolumeChart from './VolumeChart'

export const CHART_REGISTRY = [
  {
    id: 'candlestick',
    title: 'Price Chart',
    component: CandlestickChart,
    enabled: true,
    legend: [
      { color: 'var(--sma20)',  label: 'SMA 20'  },
      { color: 'var(--sma50)',  label: 'SMA 50'  },
      { color: 'var(--sma200)', label: 'SMA 200' },
    ],
    height: 380,
  },
  {
    id: 'volume',
    title: 'Volume',
    component: VolumeChart,
    enabled: true,
    legend: [{ color: 'var(--accent-blue)', label: 'Volume' }],
    height: 120,
  },
  {
    id: 'rsi',
    title: 'RSI (14)',
    component: RsiChart,
    enabled: true,
    legend: [
      { color: '#a78bfa', label: 'RSI 14' },
      { color: 'var(--sell)', label: 'Overbought 70' },
      { color: 'var(--buy)', label: 'Oversold 30' },
    ],
    height: 160,
  },
  {
    id: 'macd',
    title: 'MACD (12, 26, 9)',
    component: MacdChart,
    enabled: true,
    legend: [
      { color: 'var(--accent-blue)', label: 'MACD' },
      { color: '#f59e0b', label: 'Signal' },
      { color: 'var(--text-muted)', label: 'Histogram' },
    ],
    height: 160,
  },
  // ── Add more chart types below ─────────────────────────────────────────
  // {
  //   id: 'bollinger',
  //   title: 'Bollinger Bands',
  //   component: BollingerChart,
  //   enabled: false,
  //   legend: [],
  //   height: 300,
  // },
]
