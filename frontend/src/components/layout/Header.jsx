import { TrendingUp } from 'lucide-react'
import StockSearch from '../stock/StockSearch'
import useStore from '../../store/useStore'
import { useState, useEffect } from 'react'

const TABS = [
  { id: 'analysis', label: 'Analysis' },
  { id: 'portfolio', label: 'Portfolio' },
]

function MarketClock() {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const fmtTime = time.toLocaleTimeString('en-IN', { 
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' 
  })
  
  const formatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', hour: 'numeric', minute: 'numeric', hour12: false, weekday: 'short'
  })
  const parts = formatter.formatToParts(time)
  const p = {}
  parts.forEach(x => p[x.type] = x.value)
  
  const hour = parseInt(p.hour || 0)
  const minute = parseInt(p.minute || 0)
  const day = p.weekday
  
  const isWeekend = day === 'Sat' || day === 'Sun'
  const timeNum = hour * 100 + minute
  const isOpen = !isWeekend && (timeNum >= 915 && timeNum < 1530)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', marginRight: '24px', fontSize: '13px', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>
      <div 
        title={isOpen ? "Market Open" : "Market Closed"}
        style={{ 
          width: '8px', height: '8px', borderRadius: '50%', 
          background: isOpen ? 'var(--buy)' : 'var(--sell)', 
          boxShadow: isOpen ? '0 0 8px var(--buy-dim)' : 'none' 
        }} 
      />
      <span style={{ color: 'var(--text-secondary)' }}>{fmtTime} IST</span>
    </div>
  )
}

export default function Header() {
  const { activeTab, setActiveTab } = useStore()

  return (
    <header className="header">
      <div className="header-logo">
        <TrendingUp size={20} color="var(--accent-blue)" />
        Stock<span>AI</span>
      </div>

      <StockSearch />
      
      <MarketClock />

      <nav className="nav-tabs" style={{ borderBottom: 'none' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`nav-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </header>
  )
}
