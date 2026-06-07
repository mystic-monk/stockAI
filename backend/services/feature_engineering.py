"""Compute technical indicators from an OHLCV DataFrame using the `ta` library."""

import logging
from typing import Any

import pandas as pd
import ta

logger = logging.getLogger(__name__)


def add_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Enrich OHLCV DataFrame with technical indicators and lag features."""
    df = df.copy()

    close = df["close"]
    high  = df["high"]
    low   = df["low"]
    vol   = df["volume"]
    open_ = df["open"]

    # ── Trend: Moving Averages ─────────────────────────────────────────────
    df["sma_10"]  = ta.trend.sma_indicator(close, window=10)
    df["sma_20"]  = ta.trend.sma_indicator(close, window=20)
    df["sma_50"]  = ta.trend.sma_indicator(close, window=50)
    df["sma_200"] = ta.trend.sma_indicator(close, window=200)
    df["ema_12"]  = ta.trend.ema_indicator(close, window=12)
    df["ema_26"]  = ta.trend.ema_indicator(close, window=26)

    # ── Momentum: MACD ─────────────────────────────────────────────────────
    macd_obj           = ta.trend.MACD(close)
    df["macd"]         = macd_obj.macd()
    df["macd_signal"]  = macd_obj.macd_signal()
    df["macd_hist"]    = macd_obj.macd_diff()

    # ── Momentum: RSI ──────────────────────────────────────────────────────
    df["rsi"] = ta.momentum.rsi(close, window=14)

    # ── Momentum: Stochastic ───────────────────────────────────────────────
    stoch         = ta.momentum.StochasticOscillator(high, low, close)
    df["stoch_k"] = stoch.stoch()
    df["stoch_d"] = stoch.stoch_signal()

    # ── Volatility: Bollinger Bands ────────────────────────────────────────
    bb              = ta.volatility.BollingerBands(close, window=20, window_dev=2)
    df["bb_upper"]  = bb.bollinger_hband()
    df["bb_middle"] = bb.bollinger_mavg()
    df["bb_lower"]  = bb.bollinger_lband()
    df["bb_pct"]    = bb.bollinger_pband()

    # ── Volatility: ATR ────────────────────────────────────────────────────
    df["atr"] = ta.volatility.average_true_range(high, low, close, window=14)

    # ── Volume ─────────────────────────────────────────────────────────────
    df["obv"]           = ta.volume.on_balance_volume(close, vol)
    df["vol_sma_20"]    = ta.trend.sma_indicator(vol, window=20)
    df["vol_sma_ratio"] = vol / df["vol_sma_20"].replace(0, float("nan"))
    obv_sma20            = df["obv"].rolling(20).mean()
    _inf                 = float("nan")
    df["obv_roc5"]       = df["obv"].pct_change(5).replace([float("inf"), -float("inf")], _inf)
    df["obv_sma_ratio"]  = (
        df["obv"] / obv_sma20.replace(0, float("nan"))
    ).replace([float("inf"), -float("inf")], _inf)

    # ── Price returns ──────────────────────────────────────────────────────
    df["return_1d"]         = close.pct_change(1)
    df["return_3d"]         = close.pct_change(3)
    df["price_momentum_5"]  = close.pct_change(5)
    df["price_momentum_10"] = close.pct_change(10)
    df["price_momentum_20"] = close.pct_change(20)

    # ── Price vs MAs ───────────────────────────────────────────────────────
    df["close_vs_sma20"]  = (close - df["sma_20"])  / df["sma_20"]
    df["close_vs_sma50"]  = (close - df["sma_50"])  / df["sma_50"]
    df["close_vs_sma200"] = (close - df["sma_200"]) / df["sma_200"]

    # ── MA crossover trend ─────────────────────────────────────────────────
    df["above_sma20"]  = (close > df["sma_20"]).astype(float)
    df["above_sma50"]  = (close > df["sma_50"]).astype(float)
    df["above_sma200"] = (close > df["sma_200"]).astype(float)
    df["sma20_slope"]  = df["sma_20"].pct_change(5)   # SMA20 5-day slope
    df["sma50_slope"]  = df["sma_50"].pct_change(10)  # SMA50 10-day slope

    # ── Candlestick structure ──────────────────────────────────────────────
    df["high_low_range"] = (high - low) / close
    df["body_pct"]       = (close - open_) / close              # positive = bullish
    df["upper_wick"]     = (high - close.clip(lower=open_)) / close
    df["lower_wick"]     = (close.clip(upper=open_) - low) / close

    # ── Lag features (give models "memory" of recent state) ───────────────
    df["rsi_lag1"]       = df["rsi"].shift(1)
    df["rsi_lag3"]       = df["rsi"].shift(3)
    df["rsi_ma5"]        = df["rsi"].rolling(5).mean()    # smoothed RSI
    df["macd_hist_lag1"] = df["macd_hist"].shift(1)
    df["macd_hist_lag3"] = df["macd_hist"].shift(3)
    df["return_lag1"]    = df["return_1d"].shift(1)
    df["return_lag2"]    = df["return_1d"].shift(2)
    df["vol_ratio_lag1"] = df["vol_sma_ratio"].shift(1)

    return df


def latest_indicators(df: pd.DataFrame) -> dict[str, Any]:
    """Extract the last row's indicator values as a clean dict."""
    if df.empty:
        return {}

    row = df.iloc[-1]

    def _safe(col: str) -> float | None:
        val = row.get(col)
        if val is None or pd.isna(val):
            return None
        return round(float(val), 4)

    return {
        "rsi":              _safe("rsi"),
        "macd":             _safe("macd"),
        "macd_signal":      _safe("macd_signal"),
        "macd_hist":        _safe("macd_hist"),
        "sma_20":           _safe("sma_20"),
        "sma_50":           _safe("sma_50"),
        "sma_200":          _safe("sma_200"),
        "ema_12":           _safe("ema_12"),
        "ema_26":           _safe("ema_26"),
        "bb_upper":         _safe("bb_upper"),
        "bb_middle":        _safe("bb_middle"),
        "bb_lower":         _safe("bb_lower"),
        "atr":              _safe("atr"),
        "obv":              _safe("obv"),
        "stoch_k":          _safe("stoch_k"),
        "stoch_d":          _safe("stoch_d"),
        "volume_sma_ratio": _safe("vol_sma_ratio"),
    }
