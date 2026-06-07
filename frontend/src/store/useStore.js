import { create } from 'zustand'

const safeParse = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback }
  catch { localStorage.removeItem(key); return fallback }
}

const useStore = create((set, get) => ({
  // ── Selected stock ─────────────────────────────────────────────────────
  selectedStock: safeParse('stockai-selected', null),
  setSelectedStock: (stock) => {
    localStorage.setItem('stockai-selected', JSON.stringify(stock))
    set({ selectedStock: stock, prediction: null })
  },

  // ── Quote ──────────────────────────────────────────────────────────────
  quote: null,
  setQuote: (quote) => set({ quote }),

  // ── History / chart data ───────────────────────────────────────────────
  historyBars: [],
  setHistoryBars: (bars) => set({ historyBars: bars }),

  // ── Indicators ─────────────────────────────────────────────────────────
  indicators: null,       // { latest: {}, series: {} }
  setIndicators: (ind) => set({ indicators: ind }),

  // ── Prediction ─────────────────────────────────────────────────────────
  prediction: null,
  setPrediction: (pred) => set({ prediction: pred }),
  isAnalyzing: false,
  setIsAnalyzing: (v) => set({ isAnalyzing: v }),

  // ── Active tab (Analysis | Portfolio) ─────────────────────────────────
  activeTab: 'portfolio',
  setActiveTab: (tab) => set({ activeTab: tab }),

  // ── Watchlist ─────────────────────────────────────────────────────────
  watchlist: safeParse('stockai-watchlist', []),
  addToWatchlist: (stock) => {
    const list = get().watchlist
    if (!list.find((s) => s.stock_code === stock.stock_code)) {
      const updated = [...list, stock]
      localStorage.setItem('stockai-watchlist', JSON.stringify(updated))
      set({ watchlist: updated })
    }
  },
  removeFromWatchlist: (stockCode) => {
    const updated = get().watchlist.filter((s) => s.stock_code !== stockCode)
    localStorage.setItem('stockai-watchlist', JSON.stringify(updated))
    set({ watchlist: updated })
  },

  // ── Portfolio ─────────────────────────────────────────────────────────
  portfolio: safeParse('stockai-portfolio', null),
  setPortfolio: (p) => {
    localStorage.setItem('stockai-portfolio', JSON.stringify(p))
    set({ portfolio: p })
  },

  // ── Portfolio predictions (cached to avoid re-running on every refresh) ─
  portfolioPredictions: safeParse('stockai-pred-cache', null),
  setPortfolioPredictions: (data) => {
    const entry = data ? { data, savedAt: Date.now() } : null
    localStorage.setItem('stockai-pred-cache', JSON.stringify(entry))
    set({ portfolioPredictions: entry })
  },
}))

export default useStore
