import { useEffect, useRef } from 'react'
import { createChart, CrosshairMode } from 'lightweight-charts'

const CHART_OPTS = {
  layout: {
    background: { color: 'transparent' },
    textColor: '#7f8ea3',
    fontFamily: 'JetBrains Mono, monospace',
  },
  grid: {
    vertLines: { color: 'rgba(59,130,246,0.06)' },
    horzLines: { color: 'rgba(59,130,246,0.06)' },
  },
  crosshair: { mode: CrosshairMode.Normal },
  rightPriceScale: { borderColor: 'rgba(59,130,246,0.12)' },
  timeScale: { borderColor: 'rgba(59,130,246,0.12)', timeVisible: true },
}

export default function CandlestickChart({ bars = [], indicators = null, prediction = null, peerData = null, height = 380 }) {
  const containerRef = useRef(null)
  const chartRef     = useRef(null)

  useEffect(() => {
    if (!containerRef.current || bars.length === 0) return

    const chart = createChart(containerRef.current, {
      ...CHART_OPTS,
      width:  containerRef.current.clientWidth || 800,
      height,
    })
    chartRef.current = chart

    // ── Candlestick series ─────────────────────────────────────────────
    const candles = chart.addCandlestickSeries({
      upColor:         '#00d26a',
      downColor:       '#f43f5e',
      borderUpColor:   '#00d26a',
      borderDownColor: '#f43f5e',
      wickUpColor:     '#00d26a',
      wickDownColor:   '#f43f5e',
    })

    const seen = new Set()
    const validBars = bars.filter((b) => {
      const t = typeof b.datetime === 'number' ? b.datetime : Math.floor(new Date(b.datetime).getTime() / 1000)
      return t && !isNaN(b.open) && !seen.has(t) && seen.add(t)
    })

    const candleData = validBars.map((b) => {
      const time = typeof b.datetime === 'number' ? b.datetime : Math.floor(new Date(b.datetime).getTime() / 1000)
      return {
        time,
        open:  b.open, high: b.high, low: b.low, close: b.close,
      }
    })
    
    candleData.sort((a, b) => a.time - b.time)
    candles.setData(candleData)

    if (prediction?.target_price) {
      candles.createPriceLine({
        price: prediction.target_price,
        color: 'var(--accent-blue)',
        lineWidth: 2,
        lineStyle: 3, // Dotted
        axisLabelVisible: true,
        title: 'AI Target',
      })
    }

    // ── Moving average overlays ─────────────────────────────────────────
    const addLine = (color, width = 1) =>
      chart.addLineSeries({ color, lineWidth: width, priceLineVisible: false, lastValueVisible: false })

    if (indicators?.series) {
      const { sma_20, sma_50, sma_200 } = indicators.series

      const toLine = (arr = []) =>
        arr.map((d) => ({
          time: typeof d.datetime === 'number' ? d.datetime : Math.floor(new Date(d.datetime).getTime() / 1000),
          value: d.value
        })).filter((d) => d.time && !isNaN(d.value)).sort((a, b) => a.time - b.time)

      if (sma_20?.length)  { const s = addLine('#f59e0b'); s.setData(toLine(sma_20)) }
      if (sma_50?.length)  { const s = addLine('#3b82f6'); s.setData(toLine(sma_50)) }
      if (sma_200?.length) { const s = addLine('#a78bfa'); s.setData(toLine(sma_200)) }
    }

    // ── Peer overlay (Comparative Analysis) ──────────────────────────────────
    if (peerData?.bars?.length > 0) {
      // Enable left price scale for comparative secondary overlay
      chart.priceScale('left').applyOptions({
        visible: true,
        borderColor: 'rgba(59,130,246,0.12)'
      })

      const peerSeries = chart.addLineSeries({
        color: '#f472b6', // soft pink
        lineWidth: 2,
        priceLineVisible: false,
        priceScaleId: 'left',
        title: `Peer: ${peerData.name}`
      })

      const pSeen = new Set()
      const pValid = peerData.bars.filter((b) => {
        const t = typeof b.datetime === 'number' ? b.datetime : Math.floor(new Date(b.datetime).getTime() / 1000)
        return t && !isNaN(b.close) && !pSeen.has(t) && pSeen.add(t)
      })
      const peerLineData = pValid.map((b) => {
        const time = typeof b.datetime === 'number' ? b.datetime : Math.floor(new Date(b.datetime).getTime() / 1000)
        return {
          time,
          value: b.close
        }
      }).filter((b) => b.time && !isNaN(b.value))
      
      peerSeries.setData(peerLineData)
    }

    chart.timeScale().fitContent()

    // Resize observer
    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: containerRef.current?.clientWidth || 800 })
    })
    ro.observe(containerRef.current)

    return () => { chart.remove(); ro.disconnect() }
  }, [bars, indicators, prediction, peerData, height])

  if (bars.length === 0) {
    return (
      <div className="empty-state" style={{ height }}>
        <div className="empty-state-icon">📈</div>
        <div className="empty-state-text">Select a stock to view chart</div>
      </div>
    )
  }

  return <div ref={containerRef} style={{ width: '100%', height }} />
}
