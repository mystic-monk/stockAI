# StockAI — Intelligent Market Analysis

AI-powered stock analysis and paper trading for NSE stocks via the ICICIDirect Breeze API.

## Features

| Feature | Details |
|---|---|
| **Live quotes** | Real-time price, OHLCV, change % via Breeze API (refreshes every 30s) |
| **Candlestick charts** | Interactive OHLCV chart with SMA 20/50/200 overlays and AI target price line |
| **Technical indicators** | RSI, MACD, Bollinger Bands, Stochastic, ATR, OBV, Volume Ratio |
| **AI Signal** | BUY / SELL / HOLD from a 5-model ML ensemble (Random Forest, Extra Trees, GBM, XGBoost, MLP) |
| **Decision card** | Instant indicator-based quick signal before AI runs; full AI signal with confidence, price targets, stop-loss after analysis |
| **Portfolio view** | Live Demat holdings from Breeze API with P&L, inline AI signals, and sector info |
| **AI Portfolio analysis** | Bulk signal generation for all holdings with 1-hour cache (no repeat on refresh) |
| **Market Opportunities** | Scan popular stocks not in your portfolio for BUY signals |
| **Peer comparison** | Normalized % return chart vs sector peers (auto-loaded + manual add) |
| **Paper trading** | Simulated BUY/SELL orders against a ₹10,00,000 virtual portfolio |
| **Model monitor** | CV accuracy per model vs 33% random baseline; retrain verdict and one-click retrain |
| **Session refresh** | Update the Breeze session token from the UI — no server restart needed |

## Architecture

```
StockApp/
├── backend/               FastAPI + Python
│   ├── api/routes/        stocks · predictions · portfolio · models · auth
│   ├── core/              config (pydantic-settings) · breeze_client singleton
│   ├── models/            Pydantic schemas
│   └── services/
│       ├── data_fetcher.py     Breeze API wrapper, TTL caches
│       ├── feature_engineering.py  33 technical + lag features
│       ├── ml_ensemble.py      5-model ensemble, CV metrics, model persistence
│       ├── ml_models.py        Single-stock RF + MLP predictor
│       ├── predictor.py        Signal generation pipeline
│       └── model_store.py      Disk persistence + metadata for trained models
└── frontend/              React + Vite
    └── src/
        ├── pages/          AnalysisPage · PortfolioPage · ModelMonitorPage
        ├── components/
        │   ├── charts/     CandlestickChart · VolumeChart · RsiChart · MacdChart
        │   │               (lightweight-charts v5 API)
        │   ├── analysis/   ComparisonPanel
        │   ├── portfolio/  PortfolioDashboard · PositionTable · TradePanel
        │   ├── prediction/ IndicatorPanel
        │   ├── stock/      QuoteBar · StockSearch
        │   └── layout/     Header (with session modal) · Sidebar
        ├── store/          Zustand store with localStorage persistence
        └── services/       Axios API client
```

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- ICICIDirect Breeze API credentials ([register here](https://api.icicidirect.com/))

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in BREEZE_API_KEY and BREEZE_API_SECRET
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

## Daily Session Token (Breeze API)

The Breeze session token expires every 24 hours. No need to edit `.env` manually:

1. Click **Session** in the top-right of the app header
2. Visit the login URL shown in the dialog
3. Log in to ICICI Direct — copy the `apisession` value from the redirect URL
4. Paste it into the dialog and click **Save & Reconnect**

The backend updates `.env`, flushes caches, and reconnects without a restart.

## ML Models

The prediction engine uses a 5-model ensemble trained on 500 days of daily OHLCV:

| Model | Type |
|---|---|
| Random Forest | Direction classifier |
| Extra Trees | Direction classifier |
| Gradient Boosting | Direction classifier |
| XGBoost | Direction classifier |
| MLP Neural Net | Direction classifier (128→64→32, early stopping) |

**Target**: 5-day forward return ≥ +2% → BUY, ≤ −2% → SELL, else HOLD
**Features**: 33 features including RSI, MACD, Bollinger, Stochastic, ATR + 15 lag/trend features
**Signal**: majority vote + confidence score; falls back to HOLD if confidence < 55%

Retrain automatically when a stock is first analyzed. The **Models** tab shows CV accuracy per model vs the 33% random baseline and flags models that need retraining.

## Environment Variables

| Variable | Description |
|---|---|
| `BREEZE_API_KEY` | ICICIDirect API key |
| `BREEZE_API_SECRET` | ICICIDirect API secret |
| `BREEZE_SESSION_TOKEN` | Daily session token (update via UI — no restart needed) |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |
| `PAPER_PORTFOLIO_FILE` | Path to paper portfolio JSON |
| `INITIAL_CAPITAL` | Starting virtual cash (default ₹10,00,000) |
