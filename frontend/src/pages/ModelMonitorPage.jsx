import { useEffect, useState, useMemo } from 'react'
import {
  RefreshCw, Trash2, RotateCcw, AlertTriangle,
  CheckCircle, Clock, Database, Brain, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Minus,
} from 'lucide-react'
import { modelsApi } from '../services/api'
import toast from 'react-hot-toast'

// ── Constants ─────────────────────────────────────────────────────────────────
const RANDOM_BASELINE = 33  // 3-class problem: BUY / SELL / HOLD

const MODEL_NAMES = {
  rf:  'Random Forest',
  et:  'Extra Trees',
  gbc: 'Gradient Boost',
  xgb: 'XGBoost',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const pct  = (v) => (v != null ? `${(v * 100).toFixed(1)}%` : '—')
const num  = (v, d = 2) => (v != null ? parseFloat(v).toFixed(d) : '—')
const delta = (pctVal) => {
  const d = pctVal - RANDOM_BASELINE
  return d >= 0 ? `+${d}pt` : `${d}pt`
}

function modelColor(pctVal) {
  if (pctVal < RANDOM_BASELINE) return '#e05050'
  if (pctVal < 45) return '#f59e0b'
  if (pctVal < 55) return '#7ab8f5'
  if (pctVal < 65) return 'var(--buy)'
  return '#00e676'
}

// ── Retrain decision engine ───────────────────────────────────────────────────
function retrainDecision(model) {
  const accs = Object.values(model.cv_metrics || {}).map(m => Math.round((m.accuracy ?? 0) * 100))
  const avg  = accs.length ? accs.reduce((a, b) => a + b, 0) / accs.length : 0
  const belowRandom = accs.filter(a => a < RANDOM_BASELINE).length
  const nearRandom  = accs.filter(a => a >= RANDOM_BASELINE && a < 45).length

  const reasons = []
  if (model.is_stale)       reasons.push(`Model is ${model.days_since_trained} days old (threshold: 7 days)`)
  if (belowRandom > 0)      reasons.push(`${belowRandom} model${belowRandom > 1 ? 's' : ''} performing below random chance (< ${RANDOM_BASELINE}%)`)
  if (belowRandom === 0 && nearRandom === accs.length)
                            reasons.push('All models are near-random — ensemble signal is weak')
  if (model.n_samples < 100) reasons.push(`Only ${model.n_samples} training samples — more history would help`)

  if (reasons.length === 0 && avg >= 45)
    return { verdict: 'healthy', label: 'Model is healthy', color: 'var(--buy)', icon: '✓', reasons: [] }
  if (belowRandom > 0 || (model.is_stale && avg < 40))
    return { verdict: 'urgent', label: 'Retrain recommended', color: 'var(--sell)', icon: '⚠', reasons }
  return { verdict: 'consider', label: 'Consider retraining', color: '#f59e0b', icon: '↻', reasons }
}

// ── AccuracyRow ───────────────────────────────────────────────────────────────
function AccuracyRow({ label, accuracy }) {
  const pctVal = Math.round((accuracy ?? 0) * 100)
  const d      = pctVal - RANDOM_BASELINE
  const color  = modelColor(pctVal)
  const name   = MODEL_NAMES[label] || label

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 54px 80px', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      {/* Model name */}
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{name}</span>

      {/* Bar with baseline marker */}
      <div style={{ position: 'relative', height: 8, background: 'var(--bg-elevated)', borderRadius: 4 }}>
        <div style={{ width: `${pctVal}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.4s' }} />
        <div style={{
          position: 'absolute', top: -2, left: `${RANDOM_BASELINE}%`,
          width: 2, height: 12, background: 'rgba(255,255,255,0.25)', borderRadius: 1,
        }} />
      </div>

      {/* Score */}
      <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color, textAlign: 'right' }}>{pctVal}%</span>

      {/* Delta vs random */}
      <span style={{
        fontSize: 11, fontWeight: 600, textAlign: 'center', padding: '2px 6px', borderRadius: 6,
        background: color + '20', color,
      }}>
        {delta(pctVal)} vs chance
      </span>
    </div>
  )
}

// ── FeatureBar ────────────────────────────────────────────────────────────────
function FeatureBar({ name, value, max }) {
  const pctVal = max > 0 ? (value / max) * 100 : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 120, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>
        {name}
      </span>
      <div style={{ flex: 1, height: 5, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pctVal}%`, height: '100%', background: 'var(--primary)', borderRadius: 3 }} />
      </div>
      <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text-muted)', minWidth: 40 }}>
        {(value * 100).toFixed(1)}%
      </span>
    </div>
  )
}

// ── Model card ────────────────────────────────────────────────────────────────
function ModelCard({ model, onRetrain, onDelete, retrainingSet }) {
  const [expanded, setExpanded] = useState(false)
  const isRetraining = retrainingSet.has(model.stock_code)

  const cvModels = model.cv_metrics || {}
  const gbr      = model.gbr_metrics || {}

  const accs   = Object.values(cvModels).map(m => Math.round((m.accuracy ?? 0) * 100))
  const avgAcc = accs.length ? Math.round(accs.reduce((a, b) => a + b, 0) / accs.length) : 0
  const bestAcc = Math.max(...accs, 0)
  const decision = useMemo(() => retrainDecision(model), [model])

  const topFeatures = useMemo(() => {
    const feats = model.top_features || {}
    const max   = Math.max(...Object.values(feats), 0.0001)
    return { feats, max }
  }, [model.top_features])

  const borderColor = decision.verdict === 'urgent'
    ? 'var(--sell)' : decision.verdict === 'consider'
    ? '#f59e0b44' : 'var(--border)'

  return (
    <div style={{
      background: 'var(--bg-surface)', border: `1px solid ${borderColor}`,
      borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.2s',
    }}>

      {/* ── Header ── */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>{model.stock_code}</span>

          {/* Age badge */}
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 8,
            background: model.is_stale ? 'var(--sell-dim)' : 'var(--buy-dim)',
            color: model.is_stale ? 'var(--sell)' : 'var(--buy)',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            {model.is_stale ? <AlertTriangle size={9} /> : <CheckCircle size={9} />}
            {model.is_stale ? `Stale · ${model.days_since_trained}d old` : `Fresh · trained ${model.days_since_trained}d ago`}
          </span>

          <button onClick={() => setExpanded(e => !e)}
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
            {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            {expanded ? 'Less' : 'Details'}
          </button>
          <button onClick={() => onRetrain(model.stock_code)} disabled={isRetraining}
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--primary)', borderRadius: 6, padding: '4px 8px', color: 'var(--primary)', cursor: isRetraining ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, opacity: isRetraining ? 0.6 : 1 }}>
            <RotateCcw size={11} className={isRetraining ? 'pulse' : ''} />
            {isRetraining ? 'Queued…' : 'Retrain'}
          </button>
          <button onClick={() => onDelete(model.stock_code)}
            style={{ background: 'var(--sell-dim)', border: '1px solid var(--sell)', borderRadius: 6, padding: '4px 8px', color: 'var(--sell)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
            <Trash2 size={11} />
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          {model.n_samples} training days · {model.data_from} → {model.data_to} · {(model.model_file_kb || 0).toFixed(0)} KB
        </div>
      </div>

      {/* ── Retrain verdict ── */}
      <div style={{
        padding: '8px 14px', display: 'flex', alignItems: 'flex-start', gap: 8,
        background: decision.verdict === 'healthy' ? 'transparent'
          : decision.verdict === 'urgent' ? 'rgba(244,63,94,0.07)' : 'rgba(245,158,11,0.07)',
        borderBottom: decision.verdict !== 'healthy' ? `1px solid ${decision.color}33` : '1px solid transparent',
      }}>
        <span style={{ fontSize: 14, marginTop: 1 }}>{decision.icon}</span>
        <div>
          <span style={{ fontSize: 12, fontWeight: 700, color: decision.color }}>{decision.label}</span>
          {decision.reasons.length > 0 && (
            <ul style={{ margin: '4px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {decision.reasons.map((r, i) => (
                <li key={i} style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {r}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Accuracy section ── */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Direction Classifiers
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Ensemble avg: <strong style={{ color: modelColor(avgAcc), fontFamily: 'monospace' }}>{avgAcc}%</strong>
            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}> · random = {RANDOM_BASELINE}%</span>
          </span>
        </div>

        {/* Baseline legend */}
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, paddingLeft: `calc(130px + 8px + ${RANDOM_BASELINE}% * (1fr))` }}>
        </div>

        {Object.entries(cvModels).map(([name, m]) => (
          <AccuracyRow key={name} label={name} accuracy={m.accuracy} />
        ))}

        {/* Interpretation note */}
        <div style={{
          marginTop: 8, padding: '7px 10px', borderRadius: 7,
          background: 'var(--bg-elevated)', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6,
        }}>
          <strong style={{ color: 'var(--text-secondary)' }}>How to read this:</strong>{' '}
          Each bar shows what % of the time that model correctly predicted BUY / SELL / HOLD
          on data it had never seen (cross-validation).
          Since there are 3 possible outcomes, <strong style={{ color: 'var(--text-secondary)' }}>33% = pure random guessing</strong>.
          A model at 35% is only 2 points better than a coin flip — the ensemble average matters more than any single model.
          {bestAcc >= 45 && ` Best model here is ${bestAcc}% — contributing real signal.`}
          {avgAcc < 40 && ' Overall accuracy is near-random; treat AI signals for this stock as low-confidence.'}
        </div>
      </div>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* F1 + GBR */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              F1 Score (weighted)
              <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: 6 }}>— balances precision vs recall</span>
            </div>
            {Object.entries(cvModels).map(([name, m]) => {
              const f1pct = Math.round((m.f1 ?? 0) * 100)
              return (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 5 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{MODEL_NAMES[name] || name}</span>
                  <span style={{
                    fontFamily: 'monospace', fontWeight: 700,
                    color: f1pct >= 55 ? 'var(--buy)' : f1pct >= 40 ? '#f59e0b' : 'var(--sell)',
                  }}>{f1pct}%</span>
                </div>
              )
            })}

            {Object.keys(gbr).length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 14, marginBottom: 8 }}>
                  GBR Price Regressor
                  <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: 6 }}>— predicts target price</span>
                </div>
                {[
                  { key: 'rmse', label: 'RMSE', hint: 'avg prediction error in ₹', val: `₹${num(gbr.rmse)}`, color: 'var(--text-secondary)' },
                  { key: 'mae',  label: 'MAE',  hint: 'median error in ₹',         val: `₹${num(gbr.mae)}`,  color: 'var(--text-secondary)' },
                  { key: 'r2',   label: 'R²',   hint: '1.0 = perfect fit',         val: num(gbr.r2, 3),      color: gbr.r2 >= 0.8 ? 'var(--buy)' : gbr.r2 >= 0.5 ? '#f59e0b' : 'var(--sell)' },
                ].map(({ key, label, hint, val, color }) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{label} <span style={{ fontSize: 10 }}>({hint})</span></span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color }}>{val}</span>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Feature importances */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Top Features (RF)
              <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: 6 }}>— what drives the signal</span>
            </div>
            {Object.entries(topFeatures.feats).map(([name, val]) => (
              <FeatureBar key={name} name={name} value={val} max={topFeatures.max} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Summary card ──────────────────────────────────────────────────────────────
function SummaryCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', flex: 1, minWidth: 120 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
        <Icon size={11} /> {label}
      </div>
      <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, color: color || 'var(--text-primary)' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ModelMonitorPage() {
  const [models, setModels]         = useState([])
  const [loading, setLoading]       = useState(false)
  const [retraining, setRetraining] = useState(new Set())
  const [filter, setFilter]         = useState('all')
  const [search, setSearch]         = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const data = await modelsApi.getStatus()
      setModels(data.models || [])
    } catch {
      toast.error('Failed to load model status')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleRetrain = async (stockCode) => {
    setRetraining(s => new Set([...s, stockCode]))
    try {
      await modelsApi.retrain(stockCode)
      toast.success(`Retraining ${stockCode} in background`)
    } catch (e) {
      toast.error(e.message)
      setRetraining(s => { const n = new Set(s); n.delete(stockCode); return n })
    }
    setTimeout(() => {
      setRetraining(s => { const n = new Set(s); n.delete(stockCode); return n })
      load()
    }, 30000)
  }

  const handleDelete = async (stockCode) => {
    if (!confirm(`Delete cached model for ${stockCode}? It will retrain on next prediction.`)) return
    try {
      await modelsApi.deleteModel(stockCode)
      setModels(m => m.filter(x => x.stock_code !== stockCode))
      toast.success(`Model for ${stockCode} deleted`)
    } catch (e) { toast.error(e.message) }
  }

  const handleDeleteAll = async () => {
    if (!confirm('Delete ALL cached models? Every stock will retrain on next use.')) return
    try {
      await modelsApi.deleteAll()
      setModels([])
      toast.success('All models cleared')
    } catch (e) { toast.error(e.message) }
  }

  const filtered = useMemo(() => models
    .filter(m => filter === 'all' || (filter === 'stale' ? m.is_stale : !m.is_stale))
    .filter(m => filter !== 'retrain' || retrainDecision(m).verdict !== 'healthy')
    .filter(m => !search || m.stock_code.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const vOrder = { urgent: 0, consider: 1, healthy: 2 }
      const da = retrainDecision(a), db = retrainDecision(b)
      if (da.verdict !== db.verdict) return vOrder[da.verdict] - vOrder[db.verdict]
      return b.days_since_trained - a.days_since_trained
    }),
  [models, filter, search])

  const staleCount   = models.filter(m => m.is_stale).length
  const urgentCount  = models.filter(m => retrainDecision(m).verdict === 'urgent').length
  const avgAccuracy  = models.length
    ? models.reduce((s, m) => {
        const accs = Object.values(m.cv_metrics || {}).map(x => x.accuracy)
        return s + (accs.length ? accs.reduce((a, b) => a + b, 0) / accs.length : 0)
      }, 0) / models.length
    : 0
  const avgAboveRandom = Math.round(avgAccuracy * 100) - RANDOM_BASELINE

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Brain size={20} style={{ color: 'var(--primary)' }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>Model Monitor</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Per-stock ML ensemble · 4 direction classifiers + 1 price regressor
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>
            <RefreshCw size={12} className={loading ? 'pulse' : ''} /> Refresh
          </button>
          <button onClick={handleDeleteAll}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--sell-dim)', border: '1px solid var(--sell)', borderRadius: 7, color: 'var(--sell)', fontSize: 12, cursor: 'pointer' }}>
            <Trash2 size={12} /> Clear All
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <SummaryCard icon={Database}      label="Cached Models"     value={models.length} sub="stocks trained" />
        <SummaryCard icon={AlertTriangle} label="Need Retraining"   value={urgentCount}   color={urgentCount > 0 ? 'var(--sell)' : 'var(--buy)'} sub="urgent or stale" />
        <SummaryCard icon={CheckCircle}   label="Healthy"           value={models.length - urgentCount} color="var(--buy)" sub="no action needed" />
        <SummaryCard
          icon={Brain}
          label="Avg Above Random"
          value={`${avgAboveRandom >= 0 ? '+' : ''}${avgAboveRandom}pt`}
          color={avgAboveRandom >= 12 ? 'var(--buy)' : avgAboveRandom >= 5 ? '#f59e0b' : 'var(--sell)'}
          sub={`avg ${Math.round(avgAccuracy * 100)}% vs ${RANDOM_BASELINE}% baseline`}
        />
        <SummaryCard icon={Clock} label="Retrain Threshold" value="7 days" color="var(--hold)" sub="stale after this" />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {[
          { key: 'all',     label: 'All' },
          { key: 'retrain', label: 'Needs Retrain', badge: urgentCount },
          { key: 'stale',   label: 'Stale',         badge: staleCount },
          { key: 'fresh',   label: 'Fresh' },
        ].map(({ key, label, badge }) => (
          <button key={key} onClick={() => setFilter(key)}
            style={{
              padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: filter === key ? 'var(--primary)' : 'var(--bg-elevated)',
              border: `1px solid ${filter === key ? 'var(--primary)' : 'var(--border)'}`,
              color: filter === key ? '#fff' : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
            {label}
            {badge > 0 && (
              <span style={{ background: filter === key ? 'rgba(255,255,255,0.25)' : 'var(--sell)', color: '#fff', borderRadius: 8, padding: '0 5px', fontSize: 10 }}>{badge}</span>
            )}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search stock…"
          style={{ marginLeft: 'auto', padding: '5px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, width: 160 }} />
      </div>

      {/* Model cards */}
      {loading && models.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="pulse" style={{ marginBottom: 12 }} />
          <div>Loading model status…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <Brain size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
          <div style={{ fontSize: 14, marginBottom: 6 }}>No models cached yet</div>
          <div style={{ fontSize: 12 }}>Run "AI Analysis" on the Portfolio tab to train models for your holdings.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(500px, 1fr))', gap: 12 }}>
          {filtered.map(m => (
            <ModelCard key={m.stock_code} model={m} onRetrain={handleRetrain} onDelete={handleDelete} retrainingSet={retraining} />
          ))}
        </div>
      )}

      {/* Reference */}
      <div style={{ marginTop: 28, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Retrain decision guide</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {[
            { icon: '🔴', title: 'Any model below 33%',    desc: 'Actively wrong — retrain immediately. A model worse than random hurts the ensemble.' },
            { icon: '🟡', title: 'All models 33–45%',      desc: 'Near-random. Signals are low-confidence. Retrain, or wait for a clearer market regime.' },
            { icon: '📅', title: 'Model is stale (>7d)',   desc: 'Market regimes shift. Stale models may have learnt outdated patterns.' },
            { icon: '📢', title: 'After earnings',         desc: 'Quarterly results change price behaviour. Retrain within a week of results.' },
            { icon: '⚡', title: 'After a volatility spike', desc: 'Major news / circuit breaker. Old patterns may no longer apply.' },
            { icon: '✅', title: 'All models above 45%',   desc: 'Ensemble is contributing real signal. No urgency — retrain on the weekly schedule.' },
          ].map(({ icon, title, desc }) => (
            <div key={title} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
