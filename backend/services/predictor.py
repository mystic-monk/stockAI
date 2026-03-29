"""Combine RF + LSTM outputs → a unified BUY / SELL / HOLD signal."""

import logging
from datetime import datetime, timezone

import pandas as pd

from .feature_engineering import add_indicators, latest_indicators
from .ml_models import predict_lstm, predict_rf

logger = logging.getLogger(__name__)

# ── Weights & thresholds ─────────────────────────────────────────────────────
RF_WEIGHT       = 0.60    # RF contributes 60 % of total confidence
LSTM_WEIGHT     = 0.40    # LSTM contributes 40 %
MIN_CONFIDENCE  = 0.55    # Below this → HOLD

BUY_TARGET_PCT  = 0.025   # 2.5 % above entry
BUY_STOP_PCT    = 0.015   # 1.5 % below entry
SELL_TARGET_PCT = 0.025   # 2.5 % below entry (short target)
SELL_STOP_PCT   = 0.015   # 1.5 % above entry (short stop)


def generate_signal(stock_code: str, df: pd.DataFrame, current_price: float) -> dict:
    """
    Run full prediction pipeline and return a signal dict.

    Args:
        stock_code:    e.g. "INFY"
        df:            raw OHLCV DataFrame
        current_price: latest market price (from live quote)

    Returns:
        Complete prediction dict matching PredictionResult schema.
    """
    # 1. Enrich with technical indicators
    df_ind = add_indicators(df)
    indicators = latest_indicators(df_ind)

    rsi       = indicators.get("rsi")
    macd_hist = indicators.get("macd_hist")
    bb_upper  = indicators.get("bb_upper") or current_price * 1.02
    bb_lower  = indicators.get("bb_lower") or current_price * 0.98

    # 2. RF prediction
    rf_results  = predict_rf(stock_code, df_ind)
    prob_up     = rf_results["prob_up"]
    prob_down   = rf_results["prob_down"]

    # 3. LSTM price prediction
    lstm_price = predict_lstm(stock_code, df_ind)
    if lstm_price is None:
        lstm_price = current_price  # no-op when TF not available
    lstm_delta_pct = (lstm_price - current_price) / current_price

    # 4. Build composite score ────────────────────────────────────────────────
    # RF score: +1 for strong up, -1 for strong down
    rf_score = prob_up - prob_down   # range -1 … +1

    # LSTM score: +1 if predicted >2%, -1 if <-2%, linear between
    lstm_score = max(-1.0, min(1.0, lstm_delta_pct / 0.02))

    composite = RF_WEIGHT * rf_score + LSTM_WEIGHT * lstm_score

    # 5. RSI override (damper / booster) ─────────────────────────────────────
    reasoning: list[str] = []
    rsi_boost = 0.0
    if rsi is not None:
        if rsi < 30:
            rsi_boost = 0.15
            reasoning.append(f"RSI {rsi:.1f} — oversold zone (boosts BUY signal)")
        elif rsi > 70:
            rsi_boost = -0.15
            reasoning.append(f"RSI {rsi:.1f} — overbought zone (boosts SELL signal)")
        else:
            reasoning.append(f"RSI {rsi:.1f} — neutral zone")

    composite += rsi_boost

    # MACD confirmation
    if macd_hist is not None:
        if macd_hist > 0:
            reasoning.append("MACD histogram positive — bullish momentum")
        else:
            reasoning.append("MACD histogram negative — bearish momentum")

    # Bollinger Band position
    if current_price <= bb_lower:
        composite += 0.10
        reasoning.append("Price at/below lower Bollinger Band — mean-reversion opportunity")
    elif current_price >= bb_upper:
        composite -= 0.10
        reasoning.append("Price at/above upper Bollinger Band — overbought caution")

    # 6. Determine signal ─────────────────────────────────────────────────────
    confidence_raw = abs(composite)          # 0 … 1+
    confidence_pct = min(99.0, confidence_raw * 80 + 20)   # scale to %

    if composite > MIN_CONFIDENCE:
        signal = "BUY"
        target_price = round(current_price * (1 + BUY_TARGET_PCT), 2)
        stop_loss    = round(current_price * (1 - BUY_STOP_PCT), 2)
        reasoning.insert(0, f"RF predicts UP with {prob_up*100:.1f}% probability")
        if lstm_delta_pct > 0:
            reasoning.append(f"LSTM forecasts +{lstm_delta_pct*100:.2f}% price move")
    elif composite < -MIN_CONFIDENCE:
        signal = "SELL"
        target_price = round(current_price * (1 - SELL_TARGET_PCT), 2)
        stop_loss    = round(current_price * (1 + SELL_STOP_PCT), 2)
        reasoning.insert(0, f"RF predicts DOWN with {prob_down*100:.1f}% probability")
        if lstm_delta_pct < 0:
            reasoning.append(f"LSTM forecasts {lstm_delta_pct*100:.2f}% price decline")
    else:
        signal = "HOLD"
        target_price = current_price
        stop_loss    = current_price
        confidence_pct = max(20.0, 60.0 - confidence_raw * 40)
        reasoning.insert(0, "Mixed signals — models disagree or confidence below threshold")

    price_change_pct = round((lstm_price - current_price) / current_price * 100, 2)

    return {
        "stock_code":       stock_code,
        "exchange_code":    "NSE",
        "signal":           signal,
        "confidence":       round(confidence_pct, 1),
        "current_price":    round(current_price, 2),
        "predicted_price":  round(lstm_price, 2),
        "price_change_pct": price_change_pct,
        "target_price":     target_price,
        "stop_loss":        stop_loss,
        "indicators":       indicators,
        "rf_probability_up":round(prob_up * 100, 1),
        "lstm_prediction":  round(lstm_price, 2),
        "reasoning":        reasoning[:6],   # cap at 6 bullets
        "timestamp":        datetime.now(timezone.utc).isoformat(),
    }
