"""ML models: Random Forest (direction) + LSTM (price regression).

Both models are trained lazily per-stock on the first request and then cached
in memory.  LSTM training is optional — if TensorFlow is unavailable the app
falls back gracefully to RF-only signals.
"""

import logging
import warnings
from typing import Optional

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import MinMaxScaler

logger = logging.getLogger(__name__)
warnings.filterwarnings("ignore")

# ── Optional TensorFlow import ─────────────────────────────────────────────
try:
    from tensorflow.keras.callbacks import EarlyStopping
    from tensorflow.keras.layers import LSTM, Dense, Dropout
    from tensorflow.keras.models import Sequential

    TF_AVAILABLE = True
    logger.info("TensorFlow detected — LSTM models enabled.")
except ImportError:
    TF_AVAILABLE = False
    logger.warning("TensorFlow not found — running in RF-only mode.")

# ── In-memory model registry (keyed by stock_code) ────────────────────────
_rf_models:    dict[str, RandomForestClassifier] = {}
_lstm_models:  dict[str, any] = {}
_lstm_scalers: dict[str, MinMaxScaler] = {}

# ── Feature columns used by RF ─────────────────────────────────────────────
RF_FEATURES = [
    "rsi", "macd", "macd_signal", "macd_hist",
    "sma_20", "sma_50", "sma_200", "ema_12", "ema_26",
    "bb_upper", "bb_lower", "bb_pct", "atr",
    "stoch_k", "stoch_d",
    "vol_sma_ratio", "price_momentum_5", "price_momentum_10",
    "close_vs_sma20", "close_vs_sma50", "high_low_range",
]

LSTM_SEQ_LEN = 60
LSTM_FEATURES = ["open", "high", "low", "close", "volume",
                 "rsi", "macd", "bb_pct", "atr", "vol_sma_ratio"]


# ── Random Forest ───────────────────────────────────────────────────────────

def _build_rf_dataset(df: pd.DataFrame):
    """Create feature matrix X and label vector y for RF training."""
    df = df.copy().dropna(subset=RF_FEATURES + ["close"])

    X = df[RF_FEATURES].values
    # Label: UP if next close > today close * 1.005, DOWN if < * 0.995
    future_close = df["close"].shift(-1)
    ratio = future_close / df["close"]
    y = np.where(ratio > 1.005, 1, np.where(ratio < 0.995, -1, 0))

    # Remove the last row (no future label)
    return X[:-1], y[:-1]


def train_rf(stock_code: str, df: pd.DataFrame) -> RandomForestClassifier:
    """Train (or re-train) the Random Forest for a given stock."""
    logger.info("Training RF for %s …", stock_code)
    X, y = _build_rf_dataset(df)

    if len(X) < 50:
        raise ValueError("Insufficient data for RF training (need ≥ 50 rows).")

    clf = RandomForestClassifier(
        n_estimators=200,
        max_depth=8,
        min_samples_split=10,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    clf.fit(X, y)
    _rf_models[stock_code] = clf
    logger.info("RF trained for %s — classes: %s", stock_code, clf.classes_)
    return clf


def predict_rf(stock_code: str, df: pd.DataFrame) -> dict:
    """Return RF direction probabilities for the most recent bar."""
    if stock_code not in _rf_models:
        train_rf(stock_code, df)

    clf = _rf_models[stock_code]
    latest = df[RF_FEATURES].dropna().iloc[-1:].values

    proba = clf.predict_proba(latest)[0]
    class_idx = {c: i for i, c in enumerate(clf.classes_)}

    prob_up   = float(proba[class_idx[ 1]]) if  1 in class_idx else 0.0
    prob_down = float(proba[class_idx[-1]]) if -1 in class_idx else 0.0
    prob_hold = float(proba[class_idx[ 0]]) if  0 in class_idx else 0.0

    return {"prob_up": prob_up, "prob_down": prob_down, "prob_hold": prob_hold}


# ── LSTM ───────────────────────────────────────────────────────────────────

def _build_sequences(data: np.ndarray, seq_len: int):
    """Slide a window over data to create (X, y) sequences."""
    X, y = [], []
    for i in range(len(data) - seq_len):
        X.append(data[i : i + seq_len])
        y.append(data[i + seq_len, 3])   # predict next close (col index 3)
    return np.array(X), np.array(y)


def train_lstm(stock_code: str, df: pd.DataFrame) -> Optional[object]:
    """Train an LSTM price-prediction model.  Returns None if TF unavailable."""
    if not TF_AVAILABLE:
        return None

    logger.info("Training LSTM for %s …", stock_code)

    feat_df = df[LSTM_FEATURES].dropna()
    if len(feat_df) < LSTM_SEQ_LEN + 30:
        logger.warning("Insufficient data for LSTM on %s", stock_code)
        return None

    scaler = MinMaxScaler()
    scaled = scaler.fit_transform(feat_df.values)

    X, y = _build_sequences(scaled, LSTM_SEQ_LEN)

    model = Sequential([
        LSTM(128, return_sequences=True, input_shape=(LSTM_SEQ_LEN, len(LSTM_FEATURES))),
        Dropout(0.2),
        LSTM(64),
        Dropout(0.2),
        Dense(32, activation="relu"),
        Dense(1),
    ])
    model.compile(optimizer="adam", loss="huber")

    es = EarlyStopping(monitor="val_loss", patience=5, restore_best_weights=True)
    model.fit(
        X, y,
        epochs=50,
        batch_size=32,
        validation_split=0.1,
        callbacks=[es],
        verbose=0,
    )

    _lstm_models[stock_code]  = model
    _lstm_scalers[stock_code] = scaler
    logger.info("LSTM trained for %s", stock_code)
    return model


def predict_lstm(stock_code: str, df: pd.DataFrame) -> Optional[float]:
    """Return predicted next-day closing price, or None if LSTM unavailable."""
    if not TF_AVAILABLE:
        return None

    if stock_code not in _lstm_models:
        train_lstm(stock_code, df)

    model  = _lstm_models.get(stock_code)
    scaler = _lstm_scalers.get(stock_code)

    if model is None or scaler is None:
        return None

    feat_df = df[LSTM_FEATURES].dropna()
    if len(feat_df) < LSTM_SEQ_LEN:
        return None

    recent  = feat_df.iloc[-LSTM_SEQ_LEN:].values
    scaled  = scaler.transform(recent)
    X       = scaled.reshape(1, LSTM_SEQ_LEN, len(LSTM_FEATURES))
    y_scaled = model.predict(X, verbose=0)[0][0]

    # Invert scale: build a dummy row with prediction in the close column (idx 3)
    dummy        = np.zeros((1, len(LSTM_FEATURES)))
    dummy[0, 3]  = y_scaled
    predicted    = scaler.inverse_transform(dummy)[0, 3]
    return float(predicted)
