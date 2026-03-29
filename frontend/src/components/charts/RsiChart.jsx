import { useEffect, useRef } from 'react'
import { createChart, CrosshairMode } from 'lightweight-charts'

export default function RsiChart({ series = [], height = 160 }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current || !series || series.length === 0) return
    // Cleanup any previous chart instance before creating a new one
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null }

    const chart = createChart(containerRef.current, {
      width:  containerRef.current.clientWidth || 800,
      height,
      layout: { background: { color: 'transparent' }, textColor: '#7f8ea3', fontFamily: 'JetBrains Mono, monospace' },
      grid: { vertLines: { color: 'rgba(59,130,246,0.06)' }, horzLines: { color: 'rgba(59,130,246,0.06)' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(59,130,246,0.12)', scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: 'rgba(59,130,246,0.12)', timeVisible: true },
    })
    chartRef.current = chart

    const lineData = series.map((d) => ({
      time: typeof d.datetime === 'number' ? d.datetime : Math.floor(new Date(d.datetime).getTime() / 1000),
      value: d.value,
    })).filter((d) => d.time && !isNaN(d.value)).sort((a, b) => a.time - b.time)

    const rsiLine = chart.addLineSeries({ color: '#a78bfa', lineWidth: 2, priceLineVisible: false, lastValueVisible: true })
    if (lineData.length) rsiLine.setData(lineData)

    const addRef = (value, color) => {
      const s = chart.addLineSeries({ color, lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false })
      if (lineData.length) s.setData(lineData.map((d) => ({ time: d.time, value })))
    }
    addRef(70, 'rgba(244,63,94,0.5)')
    addRef(30, 'rgba(0,210,106,0.5)')

    if (lineData.length) chart.timeScale().fitContent()

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current)
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
    })
    ro.observe(containerRef.current)
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null }
  }, [JSON.stringify(series?.slice?.(0,5)), height])

  return <div ref={containerRef} style={{ width: '100%', height }} />
}
