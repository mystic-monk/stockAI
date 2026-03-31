import { useEffect, useRef } from 'react'
import { createChart } from 'lightweight-charts'

export default function VolumeChart({ bars = [], height = 120 }) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current || bars.length === 0) return

    const chart = createChart(containerRef.current, {
      width:  containerRef.current.clientWidth || 800,
      height,
      layout: { background: { color: 'transparent' }, textColor: '#7f8ea3', fontFamily: 'JetBrains Mono, monospace' },
      grid:   { vertLines: { color: 'rgba(59,130,246,0.06)' }, horzLines: { color: 'rgba(59,130,246,0.06)' } },
      rightPriceScale: { borderColor: 'rgba(59,130,246,0.12)' },
      timeScale: { borderColor: 'rgba(59,130,246,0.12)', timeVisible: true },
    })

    const series = chart.addHistogramSeries({
      color: 'rgba(59,130,246,0.5)',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    })

    const seen = new Set()
    const validBars = bars.filter((b) => {
      const t = typeof b.datetime === 'number' ? b.datetime : Math.floor(new Date(b.datetime).getTime() / 1000)
      return t && !isNaN(b.volume) && !seen.has(t) && seen.add(t)
    })

    const data = validBars.map((b) => {
      const time = typeof b.datetime === 'number' ? b.datetime : Math.floor(new Date(b.datetime).getTime() / 1000)
      return {
        time,
        value: b.volume,
        color: b.close >= b.open ? 'rgba(0,210,106,0.5)' : 'rgba(244,63,94,0.5)',
      }
    })
    data.sort((a, b) => a.time - b.time)

    series.setData(data)
    chart.timeScale().fitContent()

    const ro = new ResizeObserver(() => chart.applyOptions({ width: containerRef.current?.clientWidth || 800 }))
    ro.observe(containerRef.current)
    return () => { chart.remove(); ro.disconnect() }
  }, [bars, height])

  if (bars.length === 0) return <div style={{ height }} />
  return <div ref={containerRef} style={{ width: '100%', height }} />
}
