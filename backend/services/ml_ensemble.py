"""Multi-model ensemble: direction (majority vote) + price regression.

Direction classifiers (train on 5-day forward return with 2% threshold):
  1. Random Forest
  2. Extra Trees
  3. Gradient Boosting
  4. XGBoost              (requires libomp on macOS)
  5. Neural Network       (MLPClassifier — replaces LSTM when TF unavailable)

Price regression:
  6. Gradient Boosting Regressor
  7. LSTM                 (optional — requires TensorFlow)

Target definition:
  - BUY  if price in 5 trading days is > +2% from today
  - SELL if price in 5 trading days is < −2% from today
  - HOLD otherwise
  Using 5-day forward return rather than 1-day reduces noise significantly.
  2% threshold creates cleaner BUY/SELL labels vs daily ±0.5% noise.
"""

import logging
import threading
import warnings
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from sklearn.ensemble import (
    ExtraTreesClassifier,
    GradientBoostingClassifier,
    GradientBoostingRegressor,
    RandomForestClassifier,
)
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler

from services.model_store import (
    is_stale,
    load_models,
    save_metadata,
    save_models,
)

logger = logging.getLogger(__name__)
warnings.filterwarnings("ignore")

# ── Optional XGBoost ──────────────────────────────────────────────────────────
try:
    from xgboost import XGBClassifier
    XGB_AVAILABLE = True
except Exception:
    XGB_AVAILABLE = False
    logger.warning("XGBoost unavailable (missing libomp?) — 4-model ensemble without XGB.")

# ── Optional LSTM ─────────────────────────────────────────────────────────────
try:
    from services.ml_models import TF_AVAILABLE, predict_lstm
except ImportError:
    TF_AVAILABLE = False
    def predict_lstm(*a, **kw): return None  # noqa: E704

# ── Feature definitions ───────────────────────────────────────────────────────
DIRECTION_FEATURES = [
    # Core momentum
    "rsi", "rsi_lag1", "rsi_lag3", "rsi_ma5",
    "macd", "macd_signal", "macd_hist", "macd_hist_lag1", "macd_hist_lag3",
    # Trend position
    "close_vs_sma20", "close_vs_sma50", "close_vs_sma200",
    "above_sma20", "above_sma50", "above_sma200",
    "sma20_slope", "sma50_slope",
    # Oscillators
    "stoch_k", "stoch_d", "bb_pct",
    # Price returns (lagged so no lookahead)
    "return_1d", "return_lag1", "return_lag2",
    "return_3d", "price_momentum_5", "price_momentum_10",
    # Volatility / volume
    "atr", "high_low_range",
    "vol_sma_ratio", "vol_ratio_lag1",
    # Candle structure
    "body_pct", "upper_wick", "lower_wick",
]

PRICE_FEATURES = [
    "close", "open", "high", "low", "volume",
    "rsi", "macd", "macd_hist", "bb_pct", "atr",
    "sma_20", "sma_50", "vol_sma_ratio",
    "price_momentum_5", "return_1d", "close_vs_sma20",
]

# ── In-memory cache ───────────────────────────────────────────────────────────
_ensemble_cache: dict[str, dict] = {}
_train_locks:    dict[str, threading.Lock] = {}
_locks_lock = threading.Lock()

# How many trading days to look ahead for the direction target
LOOKAHEAD_DAYS  = 5
# Minimum % move to count as BUY / SELL (reduces noise vs 0.5% 1-day threshold)
SIGNAL_THRESHOLD = 0.02


def _get_lock(stock_code: str) -> threading.Lock:
    with _locks_lock:
        if stock_code not in _train_locks:
            _train_locks[stock_code] = threading.Lock()
        return _train_locks[stock_code]


# ── Dataset builders ──────────────────────────────────────────────────────────

def _direction_dataset(df: pd.DataFrame):
    """
    Build X, y for direction classification.

    Target: 5-day forward return
      y =  1 (BUY)  if fwd_return >  +2%
      y = -1 (SELL) if fwd_return <  -2%
      y =  0 (HOLD) otherwise
    """
    df = df.copy()
    df["_fwd"] = df["close"].shift(-LOOKAHEAD_DAYS)
    df = df.dropna(subset=DIRECTION_FEATURES + ["close", "_fwd"])

    ratio = df["_fwd"] / df["close"]
    y = np.where(ratio > 1 + SIGNAL_THRESHOLD, 1,
        np.where(ratio < 1 - SIGNAL_THRESHOLD, -1, 0))

    X = df[DIRECTION_FEATURES].values
    return X, y, df["datetime"].iloc[0], df["datetime"].iloc[-1]


def _price_dataset(df: pd.DataFrame):
    df = df.copy().dropna(subset=PRICE_FEATURES + ["close"])
    df["_target"] = df["close"].shift(-1)
    df = df.dropna(subset=["_target"])
    return df[PRICE_FEATURES].values, df["_target"].values


# ── Training ──────────────────────────────────────────────────────────────────

def train_ensemble(stock_code: str, df: pd.DataFrame, force: bool = False) -> dict:
    lock = _get_lock(stock_code)
    with lock:
        if not force and stock_code in _ensemble_cache:
            return _ensemble_cache[stock_code]

        if not force and not is_stale(stock_code):
            models = load_models(stock_code)
            if models is not None:
                _ensemble_cache[stock_code] = models
                logger.info("Loaded %s from disk cache.", stock_code)
                return models

        logger.info("Training ensemble for %s …", stock_code)
        X_dir, y_dir, data_from, data_to = _direction_dataset(df)
        if len(X_dir) < 80:
            raise ValueError(f"Not enough data for {stock_code} (need ≥ 80 rows after feature calculation)")

        models: dict = {}
        cv_metrics: dict = {}

        # ── 1. Random Forest ─────────────────────────────────────────────
        rf = RandomForestClassifier(
            n_estimators=300, max_depth=6, min_samples_split=15,
            class_weight="balanced", random_state=42, n_jobs=-1,
        ).fit(X_dir, y_dir)
        models["rf"] = rf
        rf_cv = RandomForestClassifier(n_estimators=100, max_depth=6,
                                        min_samples_split=15, class_weight="balanced",
                                        random_state=42, n_jobs=-1)
        cv_metrics["rf"] = {
            "accuracy": round(float(cross_val_score(rf_cv, X_dir, y_dir, cv=5, scoring="accuracy").mean()), 3),
            "f1":       round(float(cross_val_score(rf_cv, X_dir, y_dir, cv=5, scoring="f1_weighted").mean()), 3),
        }

        # ── 2. Extra Trees ───────────────────────────────────────────────
        et = ExtraTreesClassifier(
            n_estimators=300, max_depth=6, class_weight="balanced",
            random_state=7, n_jobs=-1,
        ).fit(X_dir, y_dir)
        models["et"] = et
        et_cv = ExtraTreesClassifier(n_estimators=100, max_depth=6,
                                      class_weight="balanced", random_state=7, n_jobs=-1)
        cv_metrics["et"] = {
            "accuracy": round(float(cross_val_score(et_cv, X_dir, y_dir, cv=5, scoring="accuracy").mean()), 3),
            "f1":       round(float(cross_val_score(et_cv, X_dir, y_dir, cv=5, scoring="f1_weighted").mean()), 3),
        }

        # ── 3. Gradient Boosting ─────────────────────────────────────────
        gbc = GradientBoostingClassifier(
            n_estimators=200, max_depth=4, learning_rate=0.05,
            subsample=0.8, min_samples_split=10, random_state=42,
        ).fit(X_dir, y_dir)
        models["gbc"] = gbc
        gbc_cv = GradientBoostingClassifier(n_estimators=100, max_depth=4,
                                             learning_rate=0.05, subsample=0.8,
                                             n_iter_no_change=10, random_state=42)
        cv_metrics["gbc"] = {
            "accuracy": round(float(cross_val_score(gbc_cv, X_dir, y_dir, cv=5, scoring="accuracy").mean()), 3),
            "f1":       round(float(cross_val_score(gbc_cv, X_dir, y_dir, cv=5, scoring="f1_weighted").mean()), 3),
        }

        # ── 4. XGBoost (optional) ─────────────────────────────────────────
        if XGB_AVAILABLE:
            y_xgb = y_dir + 1  # {-1,0,1} → {0,1,2}
            xgb = XGBClassifier(
                n_estimators=300, max_depth=5, learning_rate=0.05,
                subsample=0.8, colsample_bytree=0.8,
                objective="multi:softprob", num_class=3,
                eval_metric="mlogloss", random_state=42,
                n_jobs=-1, verbosity=0,
            ).fit(X_dir, y_xgb)
            models["xgb"] = xgb
            xgb_cv = XGBClassifier(
                n_estimators=100, max_depth=5, learning_rate=0.05,
                objective="multi:softprob", num_class=3,
                eval_metric="mlogloss", random_state=42, n_jobs=-1, verbosity=0,
            )
            cv_metrics["xgb"] = {
                "accuracy": round(float(cross_val_score(xgb_cv, X_dir, y_xgb, cv=5, scoring="accuracy").mean()), 3),
                "f1":       round(float(cross_val_score(xgb_cv, X_dir, y_xgb, cv=5, scoring="f1_weighted").mean()), 3),
            }

        # ── 5. Neural Network (MLP — LSTM substitute when TF unavailable) ─
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X_dir)
        mlp = MLPClassifier(
            hidden_layer_sizes=(128, 64, 32),
            activation="relu",
            solver="adam",
            alpha=0.005,
            learning_rate="adaptive",
            max_iter=500,
            early_stopping=True,
            validation_fraction=0.1,
            n_iter_no_change=20,
            random_state=42,
        ).fit(X_scaled, y_dir)
        models["mlp"] = mlp
        models["mlp_scaler"] = scaler
        mlp_cv = MLPClassifier(
            hidden_layer_sizes=(64, 32), activation="relu", solver="adam",
            alpha=0.005, learning_rate="adaptive", max_iter=300,
            early_stopping=True, random_state=42,
        )
        cv_metrics["mlp"] = {
            "accuracy": round(float(cross_val_score(mlp_cv, X_scaled, y_dir, cv=5, scoring="accuracy").mean()), 3),
            "f1":       round(float(cross_val_score(mlp_cv, X_scaled, y_dir, cv=5, scoring="f1_weighted").mean()), 3),
        }

        # ── 6. GBR price regressor ────────────────────────────────────────
        X_pr, y_pr = _price_dataset(df)
        gbr_metrics: dict = {}
        if len(X_pr) >= 60:
            X_tr, X_val, y_tr, y_val = train_test_split(X_pr, y_pr, test_size=0.15, shuffle=False)
            gbr = GradientBoostingRegressor(
                n_estimators=300, max_depth=4, learning_rate=0.05,
                subsample=0.8, random_state=42,
            ).fit(X_tr, y_tr)
            models["gbr"] = gbr
            y_hat = gbr.predict(X_val)
            gbr_metrics = {
                "rmse": round(float(np.sqrt(mean_squared_error(y_val, y_hat))), 2),
                "mae":  round(float(mean_absolute_error(y_val, y_hat)), 2),
                "r2":   round(float(r2_score(y_val, y_hat)), 3),
            }

        # ── Feature importances (RF) ──────────────────────────────────────
        importances   = dict(zip(DIRECTION_FEATURES, [round(float(v), 4) for v in rf.feature_importances_]))
        top_features  = dict(sorted(importances.items(), key=lambda x: x[1], reverse=True)[:10])

        metadata = {
            "stock_code":        stock_code,
            "trained_at":        datetime.now(timezone.utc).isoformat(),
            "n_samples":         int(len(X_dir)),
            "n_features":        len(DIRECTION_FEATURES),
            "data_from":         str(data_from)[:10],
            "data_to":           str(data_to)[:10],
            "models_available":  [k for k in models if k != "mlp_scaler"],
            "cv_metrics":        cv_metrics,
            "gbr_metrics":       gbr_metrics,
            "top_features":      top_features,
            "feature_importances": importances,
            "lookahead_days":    LOOKAHEAD_DAYS,
            "signal_threshold":  SIGNAL_THRESHOLD,
            "days_since_trained": 0,
            "is_stale":          False,
        }

        save_models(stock_code, models)
        save_metadata(stock_code, metadata)
        _ensemble_cache[stock_code] = models
        logger.info("Ensemble trained + saved for %s (%d samples, %d features)",
                    stock_code, len(X_dir), len(DIRECTION_FEATURES))
        return models


# ── Inference ─────────────────────────────────────────────────────────────────

def _probs_sklearn(clf, X: np.ndarray) -> tuple[float, float, float]:
    proba = clf.predict_proba(X)[0]
    idx = {c: i for i, c in enumerate(clf.classes_)}
    pu  = float(proba[idx[ 1]]) if  1 in idx else 0.0
    pd_ = float(proba[idx[-1]]) if -1 in idx else 0.0
    ph  = float(proba[idx[ 0]]) if  0 in idx else 0.0
    return pu, pd_, ph


def _signal(pu: float, pd_: float, threshold: float = 0.38) -> str:
    if pu > pd_ and pu > threshold:
        return "BUY"
    if pd_ > pu and pd_ > threshold:
        return "SELL"
    return "HOLD"


def predict_ensemble(stock_code: str, df: pd.DataFrame, current_price: float) -> dict:
    """Run the full ensemble and return a prediction dict."""
    if stock_code not in _ensemble_cache:
        train_ensemble(stock_code, df)

    models = _ensemble_cache[stock_code]
    dir_row = df[DIRECTION_FEATURES].dropna().iloc[-1:]
    if dir_row.empty:
        raise ValueError("No valid feature row for prediction.")
    X = dir_row.values

    votes: list[tuple[str, str, float, float]] = []

    if "rf" in models:
        pu, pd_, _ = _probs_sklearn(models["rf"], X)
        votes.append(("RF", _signal(pu, pd_), pu, pd_))
    if "et" in models:
        pu, pd_, _ = _probs_sklearn(models["et"], X)
        votes.append(("ExtraTrees", _signal(pu, pd_), pu, pd_))
    if "gbc" in models:
        pu, pd_, _ = _probs_sklearn(models["gbc"], X)
        votes.append(("GradBoost", _signal(pu, pd_), pu, pd_))
    if "xgb" in models:
        proba = models["xgb"].predict_proba(X)[0]
        pd__, _, pu = float(proba[0]), float(proba[1]), float(proba[2])
        votes.append(("XGBoost", _signal(pu, pd__), pu, pd__))
    if "mlp" in models and "mlp_scaler" in models:
        X_scaled = models["mlp_scaler"].transform(X)
        pu, pd_, _ = _probs_sklearn(models["mlp"], X_scaled)
        votes.append(("NeuralNet", _signal(pu, pd_), pu, pd_))

    if TF_AVAILABLE:
        lstm_p = predict_lstm(stock_code, df)
        # LSTM gives a price prediction, not a direction — handled in price section

    if not votes:
        raise ValueError("No models available.")

    signals   = [v[1] for v in votes]
    counts    = {s: signals.count(s) for s in ("BUY", "SELL", "HOLD")}
    winning   = max(counts, key=counts.__getitem__)
    agreement = round(counts[winning] / len(votes) * 100, 1)

    avg_pu    = float(np.mean([v[2] for v in votes]))
    avg_pd    = float(np.mean([v[3] for v in votes]))
    composite = avg_pu - avg_pd
    confidence = round(min(99.0, abs(composite) * 60 + (agreement / 100) * 30 + 10), 1)

    # Price predictions
    price_preds: dict[str, float] = {}
    pr_row = df[PRICE_FEATURES].dropna().iloc[-1:]
    if "gbr" in models and not pr_row.empty:
        price_preds["GBR"] = round(float(models["gbr"].predict(pr_row.values)[0]), 2)
    if TF_AVAILABLE:
        lstm_p = predict_lstm(stock_code, df)
        if lstm_p:
            price_preds["LSTM"] = round(float(lstm_p), 2)

    predicted_price = round(float(np.mean(list(price_preds.values()))), 2) \
        if price_preds else current_price
    price_change_pct = round((predicted_price - current_price) / current_price * 100, 2)

    if winning == "BUY":
        target, stop_loss = round(current_price * 1.025, 2), round(current_price * 0.985, 2)
    elif winning == "SELL":
        target, stop_loss = round(current_price * 0.975, 2), round(current_price * 1.015, 2)
    else:
        target = stop_loss = current_price

    return {
        "signal":           winning,
        "confidence":       confidence,
        "agreement_pct":    agreement,
        "model_votes":      {name: sig for name, sig, _, _ in votes},
        "avg_prob_up":      round(avg_pu, 3),
        "avg_prob_down":    round(avg_pd, 3),
        "predicted_price":  predicted_price,
        "price_change_pct": price_change_pct,
        "price_predictions": price_preds,
        "target_price":     target,
        "stop_loss":        stop_loss,
        "n_models":         len(votes),
    }
