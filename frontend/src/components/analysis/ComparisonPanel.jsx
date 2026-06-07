import { useEffect, useRef, useState } from 'react'
import { createChart, LineSeries } from 'lightweight-charts'
import { Plus, X, TrendingUp } from 'lucide-react'
import { stocksApi } from '../../services/api'

const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#f43f5e', '#a78bfa', '#fb923c']

function toRelative(bars) {
  if (!bars?.length) return []
  const base = bars[0].close
  if (!base) return []
  return bars.map((b) => ({
    time: typeof b.datetime === 'number' ? b.datetime
        : Math.floor(new Date(b.datetime).getTime() / 1000),
    value: parseFloat(((b.close - base) / base * 100).toFixed(3)),
  })).filter(d => d.time && isFinite(d.value)).sort((a, b) => a.time - b.time)
}

function RelativeChart({ stocks }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current || !stocks.some(s => s.bars?.length)) return
    const chart = createChart(ref.current, {
      width: ref.current.clientWidth || 600,
      height: 220,
      layout: { background: { color: 'transparent' }, textColor: '#7f8ea3', fontFamily: 'JetBrains Mono, monospace' },
      grid: { vertLines: { color: 'rgba(59,130,246,0.06)' }, horzLines: { color: 'rgba(59,130,246,0.06)' } },
      rightPriceScale: { borderColor: 'rgba(59,130,246,0.12)' },
      timeScale: { borderColor: 'rgba(59,130,246,0.12)', timeVisible: true },
    })

    stocks.forEach((s, i) => {
      if (!s.bars?.length) return
      const data = toRelative(s.bars)
      if (!data.length) return
      const line = chart.addSeries(LineSeries, {
        color: COLORS[i % COLORS.length],
        lineWidth: 2,
        priceLineVisible: false,
        title: s.code,
      })
      line.setData(data)
    })

    // Zero baseline
    const firstBars = stocks.find(s => s.bars?.length)?.bars || []
    chart.addSeries(LineSeries, {
      color: 'rgba(255,255,255,0.15)',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    }).setData(toRelative(firstBars).map(d => ({ time: d.time, value: 0 })))

    chart.timeScale().fitContent()
    const ro = new ResizeObserver(() => chart.applyOptions({ width: ref.current?.clientWidth || 600 }))
    ro.observe(ref.current)
    return () => { chart.remove(); ro.disconnect() }
  }, [stocks])

  return <div ref={ref} style={{ width: '100%' }} />
}

export default function ComparisonPanel({ primaryStock }) {
  const [stocks, setStocks]   = useState([])
  const [input, setInput]     = useState('')
  const [sectorInfo, setSectorInfo] = useState(null)

  useEffect(() => {
    if (!primaryStock?.stock_code) return
    setStocks([])
    setSectorInfo(null)

    stocksApi.getHistory(primaryStock.stock_code, primaryStock.exchange_code || 'NSE', '1day', 180)
      .then(d => {
        setStocks(prev => {
          if (prev.find(s => s.code === primaryStock.stock_code)) return prev
          return [{ code: primaryStock.stock_code, name: primaryStock.name || primaryStock.stock_code, bars: d.bars || [], loading: false, primary: true }, ...prev.filter(s => !s.primary)]
        })
      }).catch(() => {})

    stocksApi.getPeers(primaryStock.stock_code)
      .then(async data => {
        setSectorInfo({ sector: data.sector, known: data.sector_known })
        for (const peer of data.peers.slice(0, 3)) {
          setStocks(prev => {
            if (prev.find(s => s.code === peer.stock_code)) return prev
            return [...prev, { code: peer.stock_code, name: peer.name, bars: null, loading: true }]
          })
          await new Promise(r => setTimeout(r, 400))
          stocksApi.getHistory(peer.stock_code, 'NSE', '1day', 180)
            .then(d => setStocks(prev => prev.map(s => s.code === peer.stock_code ? { ...s, bars: d.bars || [], loading: false } : s)))
            .catch(() => setStocks(prev => prev.map(s => s.code === peer.stock_code ? { ...s, loading: false, error: true } : s)))
        }
      }).catch(() => {})
  }, [primaryStock?.stock_code])

  const addStock = () => {
    const code = input.trim().toUpperCase()
    if (!code || stocks.find(s => s.code === code)) { setInput(''); return }
    setInput('')
    setStocks(prev => [...prev, { code, name: code, bars: null, loading: true }])
    stocksApi.getHistory(code, 'NSE')
      .then(d => setStocks(prev => prev.map(s => s.code === code ? { ...s, bars: d.bars || [], loading: false } : s)))
      .catch(() => setStocks(prev => prev.map(s => s.code === code ? { ...s, loading: false, error: true } : s)))
  }

  const removeStock = (code) => {
    if (stocks.find(s => s.code === code)?.primary) return
    setStocks(prev => prev.filter(s => s.code !== code))
  }

  const chartStocks = stocks.filter(s => s.bars?.length > 1)
  const withReturn  = stocks.map((s, i) => {
    if (!s.bars?.length) return { ...s, colorIdx: i }
    const first = s.bars[0]?.close
    const last  = s.bars[s.bars.length - 1]?.close
    return { ...s, ret: first ? ((last - first) / first * 100) : null, colorIdx: i }
  })

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <TrendingUp size={14} style={{ color: 'var(--primary)' }} />
        <span style={{ fontWeight: 700, fontSize: 14 }}>Compare</span>
        {sectorInfo && (
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 8,
            background: sectorInfo.known ? 'var(--buy-dim)' : 'var(--bg-elevated)',
            color: sectorInfo.known ? 'var(--buy)' : 'var(--text-muted)',
            border: `1px solid ${sectorInfo.known ? 'var(--buy)' : 'var(--border)'}`,
          }}>
            {sectorInfo.known ? `Sector: ${sectorInfo.sector}` : 'Sector unknown — showing popular peers'}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && addStock()}
            placeholder="Add stock (e.g. TCS)"
            style={{ padding: '4px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, width: 140 }}
          />
          <button
            onClick={addStock}
            style={{ padding: '4px 10px', background: 'var(--primary)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Plus size={12} /> Add
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {withReturn.map((s) => (
          <div key={s.code} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 8,
            background: 'var(--bg-elevated)', border: `1px solid ${COLORS[s.colorIdx % COLORS.length]}44`,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[s.colorIdx % COLORS.length], flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 700 }}>{s.code}</span>
            {s.loading && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>…</span>}
            {s.error   && <span style={{ fontSize: 10, color: 'var(--sell)' }}>err</span>}
            {s.ret != null && (
              <span style={{ fontSize: 11, fontFamily: 'monospace', color: s.ret >= 0 ? 'var(--buy)' : 'var(--sell)' }}>
                {s.ret >= 0 ? '+' : ''}{s.ret.toFixed(1)}%
              </span>
            )}
            {!s.primary && (
              <button onClick={() => removeStock(s.code)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                <X size={11} />
              </button>
            )}
          </div>
        ))}
      </div>

      {chartStocks.length >= 1 ? (
        <>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
            % return from period start — all stocks normalized to 0%
          </div>
          <RelativeChart stocks={chartStocks} />
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: 12 }}>
          Loading comparison data…
        </div>
      )}
    </div>
  )
}
