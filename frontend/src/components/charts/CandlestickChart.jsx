import { useEffect, useRef } from 'react'
import { createChart, CrosshairMode, CandlestickSeries, LineSeries } from 'lightweight-charts'

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

function toTime(b) {
  return typeof b.datetime === 'number' ? b.datetime
    : Math.floor(new Date(b.datetime).getTime() / 1000)
}

export default function CandlestickChart({ bars = [], indicators = null, prediction = null, peerData = null, height = 380 }) {
  const containerRef = useRef(null)
  const chartRef     = useRef(null)
  const seriesRef    = useRef({})

  useEffect(() => {
    if (!containerRef.current) return
    const chart = createChart(containerRef.current, {
      ...CHART_OPTS,
      width:  containerRef.current.clientWidth || 800,
      height,
    })
    chartRef.current = chart

    seriesRef.current.candles = chart.addSeries(CandlestickSeries, {
      upColor: '#00d26a', downColor: '#f43f5e',
      borderUpColor: '#00d26a', borderDownColor: '#f43f5e',
      wickUpColor: '#00d26a', wickDownColor: '#f43f5e',
    })

    const addLine = (color, width = 1) =>
      chart.addSeries(LineSeries, { color, lineWidth: width, priceLineVisible: false, lastValueVisible: false })

    seriesRef.current.sma20  = addLine('#f59e0b')
    seriesRef.current.sma50  = addLine('#3b82f6')
    seriesRef.current.sma200 = addLine('#a78bfa')

    chart.priceScale('left').applyOptions({ visible: false, borderColor: 'rgba(59,130,246,0.12)' })
    seriesRef.current.peer = chart.addSeries(LineSeries, {
      color: '#f472b6', lineWidth: 2,
      priceLineVisible: false, priceScaleId: 'left', lastValueVisible: false,
    })

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: containerRef.current?.clientWidth || 800 })
    })
    ro.observe(containerRef.current)

    return () => { chart.remove(); ro.disconnect(); seriesRef.current = {} }
  }, [height])

  useEffect(() => {
    const s = seriesRef.current.candles
    if (!s || !bars.length) return
    const seen = new Set()
    const data = bars
      .map(b => ({ time: toTime(b), open: b.open, high: b.high, low: b.low, close: b.close }))
      .filter(b => b.time && !isNaN(b.open) && !seen.has(b.time) && seen.add(b.time))
      .sort((a, b) => a.time - b.time)
    s.setData(data)
    chartRef.current?.timeScale().fitContent()
  }, [bars])

  useEffect(() => {
    const { sma20, sma50, sma200 } = seriesRef.current
    if (!sma20) return
    const toLine = (arr = []) =>
      arr.map(d => ({
        time: typeof d.datetime === 'number' ? d.datetime : Math.floor(new Date(d.datetime).getTime() / 1000),
        value: d.value,
      })).filter(d => d.time && isFinite(d.value)).sort((a, b) => a.time - b.time)

    const series = indicators?.series || {}
    sma20.setData(toLine(series.sma_20 || []))
    sma50.setData(toLine(series.sma_50 || []))
    sma200.setData(toLine(series.sma_200 || []))
  }, [indicators])

  useEffect(() => {
    const s = seriesRef.current.candles
    if (!s) return
    try { s.dataByIndex(0) } catch { return }
    if (prediction?.target_price) {
      s.createPriceLine({
        price: prediction.target_price,
        color: 'var(--accent-blue)',
        lineWidth: 2,
        lineStyle: 3,
        axisLabelVisible: true,
        title: 'AI Target',
      })
    }
  }, [prediction?.target_price])

  useEffect(() => {
    const s = seriesRef.current.peer
    if (!s) return
    if (!peerData?.bars?.length) {
      s.setData([])
      chartRef.current?.priceScale('left').applyOptions({ visible: false })
      return
    }
    const seen = new Set()
    const data = peerData.bars
      .map(b => ({ time: toTime(b), value: b.close }))
      .filter(d => d.time && isFinite(d.value) && !seen.has(d.time) && seen.add(d.time))
      .sort((a, b) => a.time - b.time)
    s.setData(data)
    s.applyOptions({ title: `Peer: ${peerData.name || peerData.code}` })
    chartRef.current?.priceScale('left').applyOptions({ visible: true })
  }, [peerData])

  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <div ref={containerRef} style={{ width: '100%', height }} />
      {!bars.length && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-muted)', pointerEvents: 'none',
        }}>
          <span style={{ fontSize: 28, marginBottom: 8 }}>📈</span>
          <span style={{ fontSize: 12 }}>Select a stock to view chart</span>
        </div>
      )}
    </div>
  )
}
