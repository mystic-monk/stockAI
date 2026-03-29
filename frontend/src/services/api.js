import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 90000, // LSTM training can take ~60s
})

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const message = err.response?.data?.detail || err.message || 'Unknown error'
    return Promise.reject(new Error(message))
  }
)

// ── Stocks ──────────────────────────────────────────────────────────────────
export const stocksApi = {
  getPopular: () => api.get('/stocks/popular'),
  getQuote: (stockCode, exchangeCode = 'NSE') =>
    api.get('/stocks/quote', { params: { stock_code: stockCode, exchange_code: exchangeCode } }),
  getHistory: (stockCode, exchangeCode = 'NSE', interval = '1day', days = 365) =>
    api.get('/stocks/history', { params: { stock_code: stockCode, exchange_code: exchangeCode, interval, days } }),
  getIndicators: (stockCode, exchangeCode = 'NSE') =>
    api.get('/stocks/indicators', { params: { stock_code: stockCode, exchange_code: exchangeCode } }),
  getPeer: (stockCode) =>
    api.get('/stocks/peer', { params: { stock_code: stockCode } }),
}

// ── Predictions ──────────────────────────────────────────────────────────────
export const predictionsApi = {
  analyze: (stockCode, exchangeCode = 'NSE') =>
    api.post('/predictions/analyze', { stock_code: stockCode, exchange_code: exchangeCode }),
}

// ── Portfolio ────────────────────────────────────────────────────────────────
export const portfolioApi = {
  getPortfolio: () => api.get('/portfolio/'),
  placeTrade: (order) => api.post('/portfolio/trade', order),
  resetPortfolio: () => api.delete('/portfolio/reset'),
}
