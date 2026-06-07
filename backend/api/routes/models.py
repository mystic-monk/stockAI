"""Model monitoring routes — status, KPIs, retrain, delete."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, HTTPException

from services.data_fetcher import get_historical_data
from services.feature_engineering import add_indicators
from services.ml_ensemble import train_ensemble, tune_ensemble
from services.model_store import delete_model, list_all_metadata, load_metadata
from services.portfolio_service import get_portfolio

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/status")
def all_model_status():
    """Return KPIs for every stock model currently on disk."""
    return {
        "models": list_all_metadata(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/status/{stock_code}")
def stock_model_status(stock_code: str):
    """Return KPIs for a single stock's model."""
    meta = load_metadata(stock_code.upper())
    if not meta:
        raise HTTPException(
            status_code=404,
            detail=f"No cached model found for {stock_code.upper()}. "
                   "Run a portfolio analysis first to train it."
        )
    # Enrich with live staleness
    from services.model_store import STALE_DAYS
    from datetime import timedelta
    trained_at = datetime.fromisoformat(meta["trained_at"])
    delta = datetime.now(timezone.utc) - trained_at
    meta["days_since_trained"] = delta.days
    meta["is_stale"] = delta > timedelta(days=STALE_DAYS)
    return meta


def _retrain_bg(stock_code: str, exchange_code: str) -> None:
    """Background task — fetch data, retrain, save."""
    try:
        df = get_historical_data(stock_code, exchange_code, interval="1day", days=500)
        df_ind = add_indicators(df)
        train_ensemble(stock_code, df_ind, force=True)
        logger.info("Background retrain complete for %s", stock_code)
    except Exception as e:
        logger.error("Background retrain failed for %s: %s", stock_code, e)


@router.post("/{stock_code}/retrain")
def retrain_model(
    stock_code: str,
    background_tasks: BackgroundTasks,
    exchange_code: str = "NSE",
):
    """Trigger an asynchronous retrain for a stock model."""
    code = stock_code.upper()
    background_tasks.add_task(_retrain_bg, code, exchange_code.upper())
    return {
        "message": f"Retraining {code} in background.",
        "stock_code": code,
        "status": "queued",
    }


@router.post("/retrain-all")
def retrain_all_models(background_tasks: BackgroundTasks):
    """Queue a retrain for every stock in the current portfolio holdings."""
    try:
        portfolio = get_portfolio()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not fetch portfolio: {e}")

    holdings = portfolio.get("holdings", [])
    if not holdings:
        return {"message": "No portfolio holdings found.", "queued": []}

    queued = []
    for h in holdings:
        code  = h.get("stock_code", "").upper()
        exch  = h.get("exchange_code", "NSE").upper()
        if code:
            background_tasks.add_task(_retrain_bg, code, exch)
            queued.append(code)

    return {
        "message": f"Queued retrain for {len(queued)} stocks.",
        "queued": queued,
        "status": "queued",
    }


@router.delete("/{stock_code}")
def delete_stock_model(stock_code: str):
    """Delete the cached model for a stock (will retrain on next prediction)."""
    code = stock_code.upper()
    deleted = delete_model(code)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"No cached model for {code}.")
    return {"message": f"Model for {code} deleted.", "stock_code": code}


def _tune_bg(stock_code: str, exchange_code: str, n_trials: int) -> None:
    """Background task — fetch data and run Optuna HPO."""
    try:
        df = get_historical_data(stock_code, exchange_code, interval="1day", days=500)
        df_ind = add_indicators(df)
        tune_ensemble(stock_code, df_ind, n_trials=n_trials)
        logger.info("Background tuning complete for %s", stock_code)
    except Exception as e:
        logger.error("Background tuning failed for %s: %s", stock_code, e)


@router.post("/{stock_code}/tune")
def tune_model(
    stock_code: str,
    background_tasks: BackgroundTasks,
    exchange_code: str = "NSE",
    n_trials: int = 20,
):
    """Run Optuna hyperparameter tuning for a stock model (async)."""
    code = stock_code.upper()
    background_tasks.add_task(_tune_bg, code, exchange_code.upper(), n_trials)
    return {
        "message": f"Tuning {code} with {n_trials} trials per model in background.",
        "stock_code": code,
        "n_trials": n_trials,
        "status": "queued",
    }


@router.delete("/")
def delete_all_models():
    """Delete ALL cached models (nuclear option — everything retrains fresh)."""
    from services.model_store import CACHE_DIR
    import shutil
    if CACHE_DIR.exists():
        shutil.rmtree(CACHE_DIR)
    return {"message": "All model caches cleared."}
