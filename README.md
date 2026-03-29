# StockAI — ICICIDirect Breeze Intelligence Platform

AI-powered stock analysis and paper trading using the ICICIDirect Breeze API.

## Stack
- **Backend**: Python · FastAPI · scikit-learn · TensorFlow LSTM · `ta` indicators
- **Frontend**: React · Vite · TradingView Lightweight Charts · Zustand · Axios

---

## Quick Start

### 1. Backend setup

```bash
cd backend

# Create virtualenv & install deps (using uv — recommended)
pip install uv
uv venv && source .venv/bin/activate
uv pip install -e .

# Or with standard pip:
pip install -r requirements.txt

# Set up credentials
cp .env.example .env
# Edit .env with your Breeze API_KEY, API_SECRET, SESSION_TOKEN

# Run the API server
python main.py
# → http://localhost:8000  |  Docs: http://localhost:8000/docs
```

### 2. Frontend setup

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

---

## Getting a Fresh Session Token (Daily)

1. Log in to [ICICIDirect API portal](https://api.icicidirect.com)
2. Generate a new session token
3. Update `SESSION_TOKEN` in `backend/.env`
4. Restart the backend server

---

## Adding a New Chart

1. Create `frontend/src/components/charts/YourChart.jsx`
2. Add one entry to `frontend/src/components/charts/chartRegistry.js`

That's it — the chart renders automatically in the analysis view.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/stocks/popular` | List of 20 popular NSE stocks |
| GET | `/api/stocks/quote?stock_code=INFY` | Live quote |
| GET | `/api/stocks/history?stock_code=INFY` | OHLCV bars |
| GET | `/api/stocks/indicators?stock_code=INFY` | Technical indicators |
| POST | `/api/predictions/analyze` | Run AI analysis |
| GET | `/api/portfolio/` | Full portfolio with live P&L |
| POST | `/api/portfolio/trade` | Execute paper trade |
| DELETE | `/api/portfolio/reset` | Reset to ₹10,00,000 |

---

> ⚠️ **Disclaimer**: Predictions are for informational purposes only. Not financial advice.
