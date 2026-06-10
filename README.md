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
| **Discover** | Scan all popular NSE stocks for BUY/SELL/HOLD signals; filter by signal, sector, sort by confidence |
| **Portfolio view** | Live Demat holdings from Breeze API with P&L, inline AI signals, and sector info |
| **AI Portfolio analysis** | Bulk signal generation for all holdings with 1-hour cache (no repeat on refresh) |
| **Peer comparison** | Normalized % return chart vs sector peers (auto-loaded + manual add) |
| **Paper trading** | Simulated BUY/SELL orders against a ₹10,00,000 virtual portfolio |
| **Model monitor** | CV accuracy per model vs 33% random baseline; retrain verdict and one-click retrain / tune |
| **Hyperparameter tuning** | Optuna-based HPO (20 trials per model) triggered from the Models tab |
| **Session management** | Update API Key, Secret Key, and Session ID from the UI — no server restart needed |

## Architecture

```
StockApp/
├── backend/               FastAPI + Python
│   ├── api/routes/        stocks · predictions · portfolio · models · auth
│   ├── core/              config (pydantic-settings) · breeze_client singleton
│   ├── models/            Pydantic schemas
│   └── services/
│       ├── data_fetcher.py         Breeze API wrapper, TTL caches
│       ├── feature_engineering.py  35 technical + lag + OBV features
│       ├── ml_ensemble.py          5-model ensemble, Optuna HPO, soft-vote inference
│       ├── ml_models.py            Single-stock RF + MLP predictor
│       ├── predictor.py            Signal generation pipeline
│       └── model_store.py          Disk persistence + metadata for trained models
└── frontend/              React + Vite
    └── src/
        ├── pages/          AnalysisPage · PortfolioPage · DiscoverPage · ModelMonitorPage
        ├── components/
        │   ├── charts/     CandlestickChart · VolumeChart · RsiChart · MacdChart
        │   │               (lightweight-charts v5 API)
        │   ├── analysis/   ComparisonPanel
        │   ├── portfolio/  PortfolioDashboard · PositionTable · TradePanel
        │   ├── prediction/ IndicatorPanel
        │   ├── stock/      QuoteBar · StockSearch
        │   └── layout/     Header · Sidebar
        ├── store/          Zustand store with localStorage + in-memory caching
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
cp .env.example .env   # fill in BREEZE_API_KEY, BREEZE_API_SECRET, BREEZE_SESSION_TOKEN
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

### PM2 (production)

```bash
# From project root — uses .venv/bin/uvicorn
pm2 start ecosystem.config.cjs
```

## Daily Session Token (Breeze API)

The Breeze session token expires every 24 hours. No need to edit `.env` manually:

1. Click **Session** in the top-right of the app header
2. Enter your API Key and Secret Key (only needed once; leave blank to keep existing)
3. Visit the login URL shown — log in to ICICI Direct
4. Copy the `apisession` value from the redirect URL and paste it as the **Session ID**
5. Click **Save & Reconnect** — the backend reconnects without a restart

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
**Features**: 35 features — RSI, MACD, Bollinger, Stochastic, ATR, OBV rate-of-change, OBV/SMA ratio, 15 lag/trend features
**Signal**: soft-vote (averaged class probabilities across models); falls back to HOLD if confidence < threshold
**Targets / Stop-loss**: ATR-based (2× ATR target, 1.5× ATR stop-loss) — adapts to each stock's volatility
**CV**: `TimeSeriesSplit` (no shuffle) — eliminates lookahead bias in accuracy reporting

Retrain automatically when a stock is first analysed. The **Models** tab shows CV accuracy per model vs the 33% random baseline, flags models that need retraining, and tracks live training jobs.

### Hyperparameter Tuning

Click **Tune** on any model card to run Optuna HPO in the background:
- 20 trials per model (RF, ET, GBC, XGB, MLP) using `TimeSeriesSplit(n_splits=3)` for speed
- Best params are saved to model metadata and used for all future predictions
- The card shows a live **Tuning…** badge while in progress; CV scores update automatically when done

## Discover

The **Discover** tab scans all 20 popular NSE stocks for AI signals:

- **Scan All** fetches live quotes + runs the full ensemble in parallel (~60s)
- Cards show signal badge, BUY/SELL probability bar, ATR-based target and stop-loss
- Filter by signal (BUY / HOLD / SELL) and sector; sort by confidence or price change
- **Open Analysis** on any card switches to the full Analysis tab for that stock

## Model Monitor

- **Caching**: model data is cached in the app store for 60 seconds — switching tabs does not re-fetch
- **Live queue**: server tracks every training/tuning job; cards show **Training…** / **Tuning…** / **Queued…** badges updated every 5s
- **No duplicates**: the backend rejects a second queue request for a stock already in progress (HTTP 409)
- **Auto-reload**: when all jobs finish, the model list refreshes automatically to show updated CV scores
- **Sorting**: sort by best/worst accuracy, needs-retrain first, most stale, or name
- **Retrain All**: queues a background retrain for every portfolio holding; skips stocks already in progress

## Environment Variables

| Variable | Description |
|---|---|
| `BREEZE_API_KEY` | ICICIDirect API key |
| `BREEZE_API_SECRET` | ICICIDirect API secret |
| `BREEZE_SESSION_TOKEN` | Daily session token (update via UI — no restart needed) |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |
| `PAPER_PORTFOLIO_FILE` | Path to paper portfolio JSON |
| `INITIAL_CAPITAL` | Starting virtual cash (default ₹10,00,000) |
