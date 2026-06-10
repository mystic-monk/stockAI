import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import {
  RefreshCw, Trash2, RotateCcw, AlertTriangle,
  CheckCircle, Clock, Database, Brain, ChevronDown, ChevronUp, Sliders,
} from 'lucide-react'
import { modelsApi } from '../services/api'
import useStore from '../store/useStore'
import toast from 'react-hot-toast'

// ── Constants ─────────────────────────────────────────────────────────────────
const RANDOM_BASELINE = 33
const CACHE_TTL_MS    = 60_000   // re-fetch only if data is > 60s old
const QUEUE_POLL_MS   = 5_000    // poll server queue every 5s

const MODEL_NAMES = { rf: 'Random Forest', et: 'Extra Trees', gbc: 'Gradient Boost', xgb: 'XGBoost', mlp: 'Neural Net' }

// ── Helpers ───────────────────────────────────────────────────────────────────
const num = (v, d = 2) => v != null ? parseFloat(v).toFixed(d) : '—'

function avgAccuracy(model) {
  const accs = Object.values(model.cv_metrics || {}).map(m => (m.accuracy ?? 0) * 100)
  return accs.length ? accs.reduce((a, b) => a + b, 0) / accs.length : 0
}

function modelColor(pctVal) {
  if (pctVal < RANDOM_BASELINE) return '#e05050'
  if (pctVal < 45) return '#f59e0b'
  if (pctVal < 55) return '#7ab8f5'
  if (pctVal < 65) return 'var(--buy)'
  return '#00e676'
}

function retrainDecision(model) {
  const accs = Object.values(model.cv_metrics || {}).map(m => Math.round((m.accuracy ?? 0) * 100))
  const avg  = accs.length ? accs.reduce((a, b) => a + b, 0) / accs.length : 0
  const belowRandom = accs.filter(a => a < RANDOM_BASELINE).length
  const nearRandom  = accs.filter(a => a >= RANDOM_BASELINE && a < 45).length
  const reasons = []
  if (model.is_stale)        reasons.push(`Model is ${model.days_since_trained} days old (threshold: 7 days)`)
  if (belowRandom > 0)       reasons.push(`${belowRandom} model${belowRandom > 1 ? 's' : ''} below random chance`)
  if (!belowRandom && nearRandom === accs.length) reasons.push('All models near-random — signal is weak')
  if (model.n_samples < 100) reasons.push(`Only ${model.n_samples} training samples`)
  if (reasons.length === 0 && avg >= 45) return { verdict: 'healthy', label: 'Model is healthy', color: 'var(--buy)', icon: '✓', reasons: [] }
  if (belowRandom > 0 || (model.is_stale && avg < 40)) return { verdict: 'urgent', label: 'Retrain recommended', color: 'var(--sell)', icon: '⚠', reasons }
  return { verdict: 'consider', label: 'Consider retraining', color: '#f59e0b', icon: '↻', reasons }
}

// ── Job status badge ──────────────────────────────────────────────────────────
function JobBadge({ status }) {
  const color = status === 'tuning' ? '#8b5cf6' : 'var(--primary)'
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 8,
      background: color + '20', color, border: `1px solid ${color}55`,
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      <RefreshCw size={9} className="pulse" />
      {status === 'tuning' ? 'Tuning…' : status === 'retraining' ? 'Training…' : 'Queued…'}
    </span>
  )
}

// ── AccuracyRow ───────────────────────────────────────────────────────────────
function AccuracyRow({ label, accuracy }) {
  const pctVal = Math.round((accuracy ?? 0) * 100)
  const d      = pctVal - RANDOM_BASELINE
  const color  = modelColor(pctVal)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 54px 80px', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{MODEL_NAMES[label] || label}</span>
      <div style={{ position: 'relative', height: 8, background: 'var(--bg-elevated)', borderRadius: 4 }}>
        <div style={{ width: `${pctVal}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.4s' }} />
        <div style={{ position: 'absolute', top: -2, left: `${RANDOM_BASELINE}%`, width: 2, height: 12, background: 'rgba(255,255,255,0.25)', borderRadius: 1 }} />
      </div>
      <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color, textAlign: 'right' }}>{pctVal}%</span>
      <span style={{ fontSize: 11, fontWeight: 600, textAlign: 'center', padding: '2px 6px', borderRadius: 6, background: color + '20', color }}>
        {d >= 0 ? `+${d}` : d}pt vs chance
      </span>
    </div>
  )
}

function FeatureBar({ name, value, max }) {
  const pctVal = max > 0 ? (value / max) * 100 : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 120, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>{name}</span>
      <div style={{ flex: 1, height: 5, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pctVal}%`, height: '100%', background: 'var(--primary)', borderRadius: 3 }} />
      </div>
      <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text-muted)', minWidth: 40 }}>{(value * 100).toFixed(1)}%</span>
    </div>
  )
}

// ── Model card ────────────────────────────────────────────────────────────────
function ModelCard({ model, jobQueue, onRetrain, onTune, onDelete }) {
  const [expanded, setExpanded] = useState(false)

  const jobStatus = jobQueue[model.stock_code]   // 'queued' | 'retraining' | 'tuning' | undefined
  const busy      = !!jobStatus

  const cvModels = model.cv_metrics || {}
  const gbr      = model.gbr_metrics || {}
  const accs     = Object.values(cvModels).map(m => Math.round((m.accuracy ?? 0) * 100))
  const avg      = accs.length ? Math.round(accs.reduce((a, b) => a + b, 0) / accs.length) : 0
  const bestAcc  = Math.max(...accs, 0)
  const decision = useMemo(() => retrainDecision(model), [model])
  const topFeatures = useMemo(() => {
    const feats = model.top_features || {}
    const max   = Math.max(...Object.values(feats), 0.0001)
    return { feats, max }
  }, [model.top_features])

  const borderColor = busy ? 'var(--primary)' : decision.verdict === 'urgent' ? 'var(--sell)' : decision.verdict === 'consider' ? '#f59e0b44' : 'var(--border)'

  return (
    <div style={{ background: 'var(--bg-surface)', border: `1px solid ${borderColor}`, borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.2s' }}>

      {/* Header */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>{model.stock_code}</span>

          {/* Job status badge (server-driven) */}
          {jobStatus && <JobBadge status={jobStatus} />}

          {/* Age badge (only when not busy) */}
          {!jobStatus && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 8,
              background: model.is_stale ? 'var(--sell-dim)' : 'var(--buy-dim)',
              color: model.is_stale ? 'var(--sell)' : 'var(--buy)',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              {model.is_stale ? <AlertTriangle size={9} /> : <CheckCircle size={9} />}
              {model.is_stale ? `Stale · ${model.days_since_trained}d` : `${model.days_since_trained}d ago`}
            </span>
          )}

          <button onClick={() => setExpanded(e => !e)}
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
            {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            {expanded ? 'Less' : 'Details'}
          </button>
          <button onClick={() => onRetrain(model.stock_code)} disabled={busy}
            title={busy ? `Already ${jobStatus} — wait for it to finish` : 'Retrain model'}
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--primary)', borderRadius: 6, padding: '4px 8px', color: 'var(--primary)', cursor: busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, opacity: busy ? 0.45 : 1 }}>
            <RotateCcw size={11} />
            Retrain
          </button>
          <button onClick={() => onTune(model.stock_code)} disabled={busy}
            title={busy ? `Already ${jobStatus} — wait for it to finish` : 'Run Optuna hyperparameter search (~2–5 min)'}
            style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid #8b5cf6', borderRadius: 6, padding: '4px 8px', color: '#8b5cf6', cursor: busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, opacity: busy ? 0.45 : 1 }}>
            <Sliders size={11} />
            Tune
          </button>
          <button onClick={() => onDelete(model.stock_code)} disabled={busy}
            style={{ background: 'var(--sell-dim)', border: '1px solid var(--sell)', borderRadius: 6, padding: '4px 8px', color: 'var(--sell)', cursor: busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, opacity: busy ? 0.45 : 1 }}>
            <Trash2 size={11} />
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          {model.n_samples} training days · {model.data_from} → {model.data_to} · {(model.model_file_kb || 0).toFixed(0)} KB
        </div>
      </div>

      {/* Verdict */}
      {!busy && (
        <div style={{
          padding: '8px 14px', display: 'flex', alignItems: 'flex-start', gap: 8,
          background: decision.verdict === 'urgent' ? 'rgba(244,63,94,0.07)' : decision.verdict === 'consider' ? 'rgba(245,158,11,0.07)' : 'transparent',
          borderBottom: decision.verdict !== 'healthy' ? `1px solid ${decision.color}33` : '1px solid transparent',
        }}>
          <span style={{ fontSize: 14, marginTop: 1 }}>{decision.icon}</span>
          <div>
            <span style={{ fontSize: 12, fontWeight: 700, color: decision.color }}>{decision.label}</span>
            {decision.reasons.length > 0 && (
              <ul style={{ margin: '4px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {decision.reasons.map((r, i) => <li key={i} style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {r}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Accuracy */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Direction Classifiers</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Avg: <strong style={{ color: modelColor(avg), fontFamily: 'monospace' }}>{avg}%</strong>
            <span style={{ fontStyle: 'italic' }}> · random = {RANDOM_BASELINE}%</span>
          </span>
        </div>
        {Object.entries(cvModels).map(([name, m]) => <AccuracyRow key={name} label={name} accuracy={m.accuracy} />)}
        <div style={{ marginTop: 8, padding: '7px 10px', borderRadius: 7, background: 'var(--bg-elevated)', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text-secondary)' }}>How to read this:</strong>{' '}
          Each bar = % correct on unseen data (cross-validation). 33% = pure random.
          {bestAcc >= 45 && ` Best model: ${bestAcc}% — contributing real signal.`}
          {avg < 40 && ' Near-random — treat signals as low-confidence.'}
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              F1 Score (weighted) <span style={{ fontWeight: 400, textTransform: 'none' }}>— precision vs recall</span>
            </div>
            {Object.entries(cvModels).map(([name, m]) => {
              const f1 = Math.round((m.f1 ?? 0) * 100)
              return (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{MODEL_NAMES[name] || name}</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: f1 >= 55 ? 'var(--buy)' : f1 >= 40 ? '#f59e0b' : 'var(--sell)' }}>{f1}%</span>
                </div>
              )
            })}
            {Object.keys(gbr).length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 14, marginBottom: 8 }}>
                  GBR Price Regressor
                </div>
                {[
                  { key: 'rmse', label: 'RMSE', val: `₹${num(gbr.rmse)}`, color: 'var(--text-secondary)' },
                  { key: 'mae',  label: 'MAE',  val: `₹${num(gbr.mae)}`,  color: 'var(--text-secondary)' },
                  { key: 'r2',   label: 'R²',   val: num(gbr.r2, 3),      color: gbr.r2 >= 0.8 ? 'var(--buy)' : gbr.r2 >= 0.5 ? '#f59e0b' : 'var(--sell)' },
                ].map(({ key, label, val, color }) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color }}>{val}</span>
                  </div>
                ))}
              </>
            )}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Top Features (RF)
            </div>
            {Object.entries(topFeatures.feats).map(([name, val]) => <FeatureBar key={name} name={name} value={val} max={topFeatures.max} />)}
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
      <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, color: color || 'var(--text-primary)' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ModelMonitorPage() {
  const { modelsData, modelsLoadedAt, setModelsData } = useStore()

  const [loading,       setLoading]       = useState(false)
  const [retrainingAll, setRetrainingAll] = useState(false)
  const [jobQueue,      setJobQueue]      = useState({})   // { stockCode: status }
  const [filter,        setFilter]        = useState('all')
  const [sort,          setSort]          = useState('accuracy-desc')
  const [search,        setSearch]        = useState('')

  const prevQueueSize = useRef(0)

  // ── Fetch model list (skips if fresh) ─────────────────────────────────────
  const load = useCallback(async (force = false) => {
    const fresh = Date.now() - modelsLoadedAt < CACHE_TTL_MS
    if (!force && fresh && modelsData.length > 0) return
    setLoading(true)
    try {
      const data = await modelsApi.getStatus()
      setModelsData(data.models || [])
    } catch {
      toast.error('Failed to load model status')
    } finally {
      setLoading(false)
    }
  }, [modelsData, modelsLoadedAt, setModelsData])

  // ── Poll server queue every 5s ─────────────────────────────────────────────
  const pollQueue = useCallback(async () => {
    try {
      const data = await modelsApi.getQueue()
      const queue = data.queue || {}
      setJobQueue(queue)

      // When queue drains to empty, reload model list to pick up fresh CV scores
      const size = Object.keys(queue).length
      if (prevQueueSize.current > 0 && size === 0) {
        load(true)
      }
      prevQueueSize.current = size
    } catch { /* silent */ }
  }, [load])

  useEffect(() => { load() }, [])  // mount: load if stale
  useEffect(() => {
    pollQueue()
    const id = setInterval(pollQueue, QUEUE_POLL_MS)
    return () => clearInterval(id)
  }, [pollQueue])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleRetrain = async (stockCode) => {
    try {
      await modelsApi.retrain(stockCode)
      toast.success(`Retraining ${stockCode} in background`)
      pollQueue()
    } catch (e) { toast.error(e.message) }
  }

  const handleTune = async (stockCode) => {
    try {
      await modelsApi.tune(stockCode)
      toast.success(`Tuning ${stockCode} — takes 2–5 min`)
      pollQueue()
    } catch (e) { toast.error(e.message) }
  }

  const handleDelete = async (stockCode) => {
    if (!confirm(`Delete cached model for ${stockCode}?`)) return
    try {
      await modelsApi.deleteModel(stockCode)
      setModelsData(modelsData.filter(m => m.stock_code !== stockCode))
      toast.success(`Model for ${stockCode} deleted`)
    } catch (e) { toast.error(e.message) }
  }

  const handleRetrainAll = async () => {
    setRetrainingAll(true)
    try {
      const data = await modelsApi.retrainAll()
      const msg = data.skipped?.length
        ? `Queued ${data.queued?.length ?? 0} · skipped ${data.skipped.length} already in progress`
        : data.message
      toast.success(msg)
      pollQueue()
    } catch (e) { toast.error(e.message) }
    finally { setRetrainingAll(false) }
  }

  const handleDeleteAll = async () => {
    if (!confirm('Delete ALL cached models?')) return
    try {
      await modelsApi.deleteAll()
      setModelsData([])
      toast.success('All models cleared')
    } catch (e) { toast.error(e.message) }
  }

  // ── Derived stats ─────────────────────────────────────────────────────────
  const urgentCount = modelsData.filter(m => retrainDecision(m).verdict === 'urgent').length
  const staleCount  = modelsData.filter(m => m.is_stale).length
  const inQueueCount = Object.keys(jobQueue).length

  const avgAccAll = modelsData.length
    ? modelsData.reduce((s, m) => s + avgAccuracy(m), 0) / modelsData.length : 0
  const avgAboveRandom = Math.round(avgAccAll) - RANDOM_BASELINE

  // ── Filtered + sorted list ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...modelsData]
    if (search) list = list.filter(m => m.stock_code.toLowerCase().includes(search.toLowerCase()))
    if (filter === 'stale')   list = list.filter(m => m.is_stale)
    if (filter === 'retrain') list = list.filter(m => retrainDecision(m).verdict !== 'healthy')
    if (filter === 'fresh')   list = list.filter(m => !m.is_stale)
    if (filter === 'queue')   list = list.filter(m => jobQueue[m.stock_code])

    list.sort((a, b) => {
      if (sort === 'accuracy-desc') return avgAccuracy(b) - avgAccuracy(a)
      if (sort === 'accuracy-asc')  return avgAccuracy(a) - avgAccuracy(b)
      if (sort === 'verdict') {
        const o = { urgent: 0, consider: 1, healthy: 2 }
        return (o[retrainDecision(a).verdict] ?? 3) - (o[retrainDecision(b).verdict] ?? 3)
      }
      if (sort === 'staleness') return b.days_since_trained - a.days_since_trained
      return a.stock_code.localeCompare(b.stock_code)
    })
    return list
  }, [modelsData, filter, search, sort, jobQueue])

  return (
    <div style={{ padding: '20px 24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Brain size={20} style={{ color: 'var(--primary)' }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>Model Monitor</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Per-stock ML ensemble · 5 classifiers + 1 price regressor
              {inQueueCount > 0 && <span style={{ color: 'var(--primary)', marginLeft: 8 }}>· {inQueueCount} job{inQueueCount > 1 ? 's' : ''} in progress</span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => load(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>
            <RefreshCw size={12} className={loading ? 'pulse' : ''} /> Refresh
          </button>
          <button onClick={handleRetrainAll} disabled={retrainingAll}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'rgba(59,130,246,0.1)', border: '1px solid var(--primary)', borderRadius: 7, color: 'var(--primary)', fontSize: 12, cursor: retrainingAll ? 'not-allowed' : 'pointer', opacity: retrainingAll ? 0.6 : 1 }}>
            <RotateCcw size={12} className={retrainingAll ? 'pulse' : ''} />
            {retrainingAll ? 'Queuing…' : 'Retrain All'}
          </button>
          <button onClick={handleDeleteAll}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--sell-dim)', border: '1px solid var(--sell)', borderRadius: 7, color: 'var(--sell)', fontSize: 12, cursor: 'pointer' }}>
            <Trash2 size={12} /> Clear All
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <SummaryCard icon={Database}      label="Cached"          value={modelsData.length}  sub="stocks trained" />
        <SummaryCard icon={RefreshCw}     label="In Progress"     value={inQueueCount}        color={inQueueCount > 0 ? 'var(--primary)' : 'var(--text-muted)'} sub="training / tuning" />
        <SummaryCard icon={AlertTriangle} label="Need Retraining" value={urgentCount}         color={urgentCount > 0 ? 'var(--sell)' : 'var(--buy)'} sub="urgent" />
        <SummaryCard icon={CheckCircle}   label="Healthy"         value={modelsData.length - urgentCount} color="var(--buy)" sub="no action needed" />
        <SummaryCard icon={Brain}         label="Avg Above Random" value={`${avgAboveRandom >= 0 ? '+' : ''}${avgAboveRandom}pt`} color={avgAboveRandom >= 12 ? 'var(--buy)' : avgAboveRandom >= 5 ? '#f59e0b' : 'var(--sell)'} sub={`avg ${Math.round(avgAccAll)}% vs ${RANDOM_BASELINE}% baseline`} />
        <SummaryCard icon={Clock}         label="Retrain Threshold" value="7 days" color="var(--hold)" sub="stale after this" />
      </div>

      {/* Filters + sort */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {[
          { key: 'all',     label: 'All' },
          { key: 'retrain', label: 'Needs Retrain', badge: urgentCount },
          { key: 'queue',   label: 'In Progress',   badge: inQueueCount },
          { key: 'stale',   label: 'Stale',         badge: staleCount },
          { key: 'fresh',   label: 'Fresh' },
        ].map(({ key, label, badge }) => (
          <button key={key} onClick={() => setFilter(key)} style={{
            padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: filter === key ? 'var(--primary)' : 'var(--bg-elevated)',
            border: `1px solid ${filter === key ? 'var(--primary)' : 'var(--border)'}`,
            color: filter === key ? '#fff' : 'var(--text-muted)',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            {label}
            {badge > 0 && <span style={{ background: filter === key ? 'rgba(255,255,255,0.25)' : 'var(--sell)', color: '#fff', borderRadius: 8, padding: '0 5px', fontSize: 10 }}>{badge}</span>}
          </button>
        ))}

        {/* Sort */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sort:</span>
          <select value={sort} onChange={e => setSort(e.target.value)}
            style={{ padding: '5px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>
            <option value="accuracy-desc">Best accuracy first</option>
            <option value="accuracy-asc">Worst accuracy first</option>
            <option value="verdict">Needs retrain first</option>
            <option value="staleness">Most stale first</option>
            <option value="name">Name (A–Z)</option>
          </select>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
            style={{ padding: '5px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, width: 130 }} />
        </div>
      </div>

      {/* Cards */}
      {loading && modelsData.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="pulse" style={{ marginBottom: 12 }} />
          <div>Loading model status…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <Brain size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
          <div style={{ fontSize: 14, marginBottom: 6 }}>No models cached yet</div>
          <div style={{ fontSize: 12 }}>Run "AI Analysis" on the Portfolio tab to train models.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(500px, 1fr))', gap: 12 }}>
          {filtered.map(m => (
            <ModelCard key={m.stock_code} model={m} jobQueue={jobQueue}
              onRetrain={handleRetrain} onTune={handleTune} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  )
}
