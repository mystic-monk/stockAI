"""Prediction routes: run the full ML pipeline for a stock."""

import logging

from fastapi import APIRouter, HTTPException

from models.schemas import PredictionRequest, PredictionResult
from services.data_fetcher import get_historical_data, get_live_quote
from services.predictor import generate_signal

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/analyze", response_model=PredictionResult)
def analyze_stock(req: PredictionRequest):
    """
    Run the full AI analysis pipeline:
    1. Fetch 500 days of daily OHLCV
    2. Add technical indicators
    3. Train/infer RF (direction) + LSTM (price)
    4. Return BUY / SELL / HOLD with confidence and reasoning
    """
    stock_code    = req.stock_code.upper()
    exchange_code = req.exchange_code.upper()

    try:
        # Fetch live price
        quote = get_live_quote(stock_code, exchange_code)
        current_price = quote["last_price"]

        if current_price <= 0:
            raise ValueError("Invalid current price from live quote.")

        # Fetch historical data (500 trading days ≈ 2 years)
        df = get_historical_data(stock_code, exchange_code, interval="1day", days=500)

        # Generate signal
        result = generate_signal(stock_code, df, current_price)
        result["exchange_code"] = exchange_code
        return result

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("Prediction error for %s", stock_code)
        raise HTTPException(status_code=500, detail=f"Prediction failed: {e}")
