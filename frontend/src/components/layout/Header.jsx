import { TrendingUp, KeyRound, X, CheckCircle, AlertCircle } from 'lucide-react'
import StockSearch from '../stock/StockSearch'
import useStore from '../../store/useStore'
import { useState, useEffect } from 'react'
import axios from 'axios'

const TABS = [
  { id: 'analysis',  label: 'Analysis' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'discover',  label: 'Discover' },
  { id: 'models',    label: 'Models' },
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

  const hour    = parseInt(p.hour || 0)
  const minute  = parseInt(p.minute || 0)
  const day     = p.weekday
  const isWeekend = day === 'Sat' || day === 'Sun'
  const timeNum = hour * 100 + minute
  const isOpen  = !isWeekend && (timeNum >= 915 && timeNum < 1530)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>
      <div
        title={isOpen ? 'Market Open' : 'Market Closed'}
        style={{ width: '8px', height: '8px', borderRadius: '50%', background: isOpen ? 'var(--buy)' : 'var(--sell)', boxShadow: isOpen ? '0 0 8px var(--buy-dim)' : 'none' }}
      />
      <span style={{ color: 'var(--text-secondary)' }}>{fmtTime} IST</span>
    </div>
  )
}

// ── Session token modal ────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  padding: '9px 12px', borderRadius: 8, fontSize: 13,
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  color: 'var(--text-primary)', fontFamily: 'monospace',
}

function Field({ label, hint, value, onChange, placeholder, autoFocus }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
        {hint && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{hint}</span>}
      </div>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        autoFocus={autoFocus} style={inputStyle} />
    </div>
  )
}

function SessionModal({ onClose }) {
  const [apiKey,    setApiKey]    = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [saving, setSaving]       = useState(false)
  const [result, setResult]       = useState(null)

  const save = async () => {
    const payload = {}
    if (apiKey.trim())    payload.api_key       = apiKey.trim()
    if (apiSecret.trim()) payload.api_secret    = apiSecret.trim()
    if (sessionId.trim()) payload.session_token = sessionId.trim()
    if (!Object.keys(payload).length) return

    setSaving(true)
    setResult(null)
    try {
      const res = await axios.post('/api/auth/session', payload)
      setResult({ ok: true, message: res.data.message || 'Connected!' })
    } catch (e) {
      setResult({ ok: false, message: e.response?.data?.detail || e.message })
    } finally {
      setSaving(false)
    }
  }

  const hasAny = apiKey.trim() || apiSecret.trim() || sessionId.trim()

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 14, padding: 28, width: 460, maxWidth: '90vw',
      }} onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <KeyRound size={18} style={{ color: 'var(--primary)' }} />
            <span style={{ fontWeight: 700, fontSize: 15 }}>Breeze Credentials</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.6 }}>
          Leave a field blank to keep its existing value. Only filled fields are updated.
        </p>

        <Field
          label="API Key"
          hint="from registered app on api.icicidirect.com"
          value={apiKey} onChange={setApiKey}
          placeholder="e.g. A1b2C3d4E5f6…"
          autoFocus
        />
        <Field
          label="Secret Key"
          hint="from registered app"
          value={apiSecret} onChange={setApiSecret}
          placeholder="API secret…"
        />

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.7 }}>
            To get the <strong style={{ color: 'var(--text-secondary)' }}>Session ID</strong>:
            visit <code style={{ background: 'var(--bg-elevated)', padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>api.icicidirect.com/apiuser/login?api_key=YOUR_KEY</code>,
            log in, then copy the <strong style={{ color: 'var(--text-secondary)' }}>apisession</strong> value from the redirect URL.
          </div>
          <Field
            label="Session ID"
            hint="from redirect URL · expires daily"
            value={sessionId} onChange={setSessionId}
            placeholder="Paste apisession value…"
          />
        </div>

        {result && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, marginBottom: 12,
            background: result.ok ? 'var(--buy-dim)' : 'var(--sell-dim)',
            color: result.ok ? 'var(--buy)' : 'var(--sell)', fontSize: 12,
            border: `1px solid ${result.ok ? 'var(--buy)' : 'var(--sell)'}`,
          }}>
            {result.ok ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
            {result.message}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!hasAny || saving}
            style={{ padding: '8px 18px', borderRadius: 7, background: 'var(--primary)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: (saving || !hasAny) ? 'not-allowed' : 'pointer', opacity: (saving || !hasAny) ? 0.7 : 1 }}
          >
            {saving ? 'Connecting…' : 'Save & Reconnect'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Header ─────────────────────────────────────────────────────────────────────

export default function Header() {
  const { activeTab, setActiveTab } = useStore()
  const [showSession, setShowSession] = useState(false)

  return (
    <>
      <header className="header">
        <button
          className="header-logo"
          onClick={() => setActiveTab('analysis')}
          title="Go to Analysis"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <TrendingUp size={20} color="var(--accent-blue)" />
          Stock<span>AI</span>
        </button>

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

        <button
          onClick={() => setShowSession(true)}
          title="Refresh Breeze session token"
          style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 7, padding: '6px 10px', color: 'var(--text-muted)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12,
            marginLeft: 8,
          }}
        >
          <KeyRound size={13} />
          Session
        </button>
      </header>

      {showSession && <SessionModal onClose={() => setShowSession(false)} />}
    </>
  )
}
