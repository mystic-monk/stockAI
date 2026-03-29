import { useEffect, useRef } from 'react'
import { createChart, CrosshairMode } from 'lightweight-charts'

export default function MacdChart({ series = {}, height = 160 }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current || !series || !series.macd || series.macd.length === 0) return
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null }

    const chart = createChart(containerRef.current, {
      width:  containerRef.current.clientWidth || 800,
      height,
      layout: { background: { color: 'transparent' }, textColor: '#7f8ea3', fontFamily: 'JetBrains Mono, monospace' },
      grid: { vertLines: { color: 'rgba(59,130,246,0.06)' }, horzLines: { color: 'rgba(59,130,246,0.06)' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(59,130,246,0.12)' },
      timeScale: { borderColor: 'rgba(59,130,246,0.12)', timeVisible: true },
    })
    chartRef.current = chart

    const toLine = (arr = []) =>
      arr.map((d) => ({
        time: typeof d.datetime === 'number' ? d.datetime : Math.floor(new Date(d.datetime).getTime() / 1000),
        value: d.value,
      })).filter((d) => d.time && !isNaN(d.value)).sort((a, b) => a.time - b.time)

    const histData = toLine(series?.macd_hist).map((d) => ({
      ...d, color: d.value >= 0 ? 'rgba(0,210,106,0.6)' : 'rgba(244,63,94,0.6)',
    }))
    const hist = chart.addHistogramSeries({ priceScaleId: 'right' })
    if (histData.length) hist.setData(histData)

    const macdLine = chart.addLineSeries({ color: '#3b82f6', lineWidth: 2, priceLineVisible: false, lastValueVisible: true })
    const macdData = toLine(series?.macd)
    if (macdData.length) macdLine.setData(macdData)

    const signalLine = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: true })
    const signalData = toLine(series?.macd_signal)
    if (signalData.length) signalLine.setData(signalData)

    if (histData.length || macdData.length) chart.timeScale().fitContent()

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current)
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
    })
    ro.observe(containerRef.current)
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null }
  }, [series?.macd?.length, series?.macd_hist?.length, height])

  return <div ref={containerRef} style={{ width: '100%', height }} />
}
