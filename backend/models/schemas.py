"""Pydantic schemas shared across the application."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


# ── Market Data ──────────────────────────────────────────────────────────────

class OHLCV(BaseModel):
    datetime: str
    open: float
    high: float
    low: float
    close: float
    volume: float


class StockQuote(BaseModel):
    stock_code: str
    exchange_code: str
    last_price: float
    open: float
    high: float
    low: float
    prev_close: float
    change: float
    change_pct: float
    volume: float
    timestamp: str


class TechnicalIndicators(BaseModel):
    rsi: Optional[float] = None
    macd: Optional[float] = None
    macd_signal: Optional[float] = None
    macd_hist: Optional[float] = None
    sma_20: Optional[float] = None
    sma_50: Optional[float] = None
    sma_200: Optional[float] = None
    ema_12: Optional[float] = None
    ema_26: Optional[float] = None
    bb_upper: Optional[float] = None
    bb_middle: Optional[float] = None
    bb_lower: Optional[float] = None
    atr: Optional[float] = None
    obv: Optional[float] = None
    stoch_k: Optional[float] = None
    stoch_d: Optional[float] = None
    volume_sma_ratio: Optional[float] = None


# ── Prediction ───────────────────────────────────────────────────────────────

class PredictionRequest(BaseModel):
    stock_code: str
    exchange_code: str = "NSE"


class PredictionResult(BaseModel):
    stock_code: str
    exchange_code: str
    signal: Literal["BUY", "SELL", "HOLD"]
    confidence: float = Field(..., ge=0, le=100)
    current_price: float
    predicted_price: float
    price_change_pct: float
    target_price: float
    stop_loss: float
    indicators: TechnicalIndicators
    rf_probability_up: float
    lstm_prediction: float
    reasoning: list[str]
    timestamp: str


# ── Paper Portfolio ───────────────────────────────────────────────────────────

class TradeOrder(BaseModel):
    stock_code: str
    exchange_code: str = "NSE"
    action: Literal["BUY", "SELL"]
    quantity: int = Field(..., gt=0)
    price: Optional[float] = None  # None = market price


class Position(BaseModel):
    stock_code: str
    exchange_code: str
    quantity: int
    avg_buy_price: float
    current_price: float
    invested_value: float
    current_value: float
    pnl: float
    pnl_pct: float


class Trade(BaseModel):
    id: str
    stock_code: str
    exchange_code: str
    action: str
    quantity: int
    price: float
    total_value: float
    timestamp: str


class Portfolio(BaseModel):
    cash_balance: float
    total_invested: float
    total_current_value: float
    total_pnl: float
    total_pnl_pct: float
    positions: list[Position]
    trades: list[Trade]


# ── Popular Stocks ────────────────────────────────────────────────────────────

class StockInfo(BaseModel):
    stock_code: str
    name: str
    exchange_code: str
    sector: str
