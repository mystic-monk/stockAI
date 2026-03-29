"""Compute technical indicators from an OHLCV DataFrame using the `ta` library.

Returns the enriched DataFrame and a dict of the most-recent indicator values.
"""

import logging
from typing import Any

import pandas as pd
import ta

logger = logging.getLogger(__name__)


def add_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """
    Enrich OHLCV DataFrame with technical indicator columns.

    Input columns required: open, high, low, close, volume
    """
    df = df.copy()

    close = df["close"]
    high  = df["high"]
    low   = df["low"]
    vol   = df["volume"]

    # ── Trend: Simple & Exponential Moving Averages ───────────────────────
    df["sma_10"]  = ta.trend.sma_indicator(close, window=10)
    df["sma_20"]  = ta.trend.sma_indicator(close, window=20)
    df["sma_50"]  = ta.trend.sma_indicator(close, window=50)
    df["sma_200"] = ta.trend.sma_indicator(close, window=200)
    df["ema_12"]  = ta.trend.ema_indicator(close, window=12)
    df["ema_26"]  = ta.trend.ema_indicator(close, window=26)

    # ── Momentum: MACD ────────────────────────────────────────────────────
    macd_obj           = ta.trend.MACD(close)
    df["macd"]         = macd_obj.macd()
    df["macd_signal"]  = macd_obj.macd_signal()
    df["macd_hist"]    = macd_obj.macd_diff()

    # ── Momentum: RSI ─────────────────────────────────────────────────────
    df["rsi"] = ta.momentum.rsi(close, window=14)

    # ── Momentum: Stochastic ──────────────────────────────────────────────
    stoch         = ta.momentum.StochasticOscillator(high, low, close)
    df["stoch_k"] = stoch.stoch()
    df["stoch_d"] = stoch.stoch_signal()

    # ── Volatility: Bollinger Bands ───────────────────────────────────────
    bb           = ta.volatility.BollingerBands(close, window=20, window_dev=2)
    df["bb_upper"]  = bb.bollinger_hband()
    df["bb_middle"] = bb.bollinger_mavg()
    df["bb_lower"]  = bb.bollinger_lband()
    df["bb_pct"]    = bb.bollinger_pband()   # 0–1 position within band

    # ── Volatility: ATR ───────────────────────────────────────────────────
    df["atr"] = ta.volatility.average_true_range(high, low, close, window=14)

    # ── Volume: OBV & Volume SMA ratio ───────────────────────────────────
    df["obv"]             = ta.volume.on_balance_volume(close, vol)
    df["vol_sma_20"]      = ta.trend.sma_indicator(vol, window=20)
    df["vol_sma_ratio"]   = vol / df["vol_sma_20"].replace(0, float("nan"))

    # ── Price-derived features ─────────────────────────────────────────────
    df["price_momentum_5"]  = close.pct_change(5)
    df["price_momentum_10"] = close.pct_change(10)
    df["close_vs_sma20"]    = (close - df["sma_20"]) / df["sma_20"]
    df["close_vs_sma50"]    = (close - df["sma_50"]) / df["sma_50"]
    df["high_low_range"]    = (high - low) / close

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
        "rsi":             _safe("rsi"),
        "macd":            _safe("macd"),
        "macd_signal":     _safe("macd_signal"),
        "macd_hist":       _safe("macd_hist"),
        "sma_20":          _safe("sma_20"),
        "sma_50":          _safe("sma_50"),
        "sma_200":         _safe("sma_200"),
        "ema_12":          _safe("ema_12"),
        "ema_26":          _safe("ema_26"),
        "bb_upper":        _safe("bb_upper"),
        "bb_middle":       _safe("bb_middle"),
        "bb_lower":        _safe("bb_lower"),
        "atr":             _safe("atr"),
        "obv":             _safe("obv"),
        "stoch_k":         _safe("stoch_k"),
        "stoch_d":         _safe("stoch_d"),
        "volume_sma_ratio":_safe("vol_sma_ratio"),
    }
