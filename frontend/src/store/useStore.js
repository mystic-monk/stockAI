import { create } from 'zustand'

const useStore = create((set, get) => ({
  // ── Selected stock ─────────────────────────────────────────────────────
  selectedStock: null,   // full stock info object
  setSelectedStock: (stock) => set({ selectedStock: stock, prediction: null }),

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
  activeTab: 'analysis',
  setActiveTab: (tab) => set({ activeTab: tab }),

  // ── Watchlist ─────────────────────────────────────────────────────────
  watchlist: JSON.parse(localStorage.getItem('stockai-watchlist') || '[]'),
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
  portfolio: JSON.parse(localStorage.getItem('stockai-portfolio') || 'null'),
  setPortfolio: (p) => {
    localStorage.setItem('stockai-portfolio', JSON.stringify(p))
    set({ portfolio: p })
  },
}))

export default useStore
