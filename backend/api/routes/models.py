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

# ── In-progress job tracking ──────────────────────────────────────────────────
# Maps stock_code → "retraining" | "tuning". Updated by background tasks.
_job_queue: dict[str, str] = {}


@router.get("/queue")
def queue_status():
    """Return stocks currently being trained or tuned."""
    return {"queue": dict(_job_queue)}


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
    from services.model_store import STALE_DAYS
    from datetime import timedelta
    trained_at = datetime.fromisoformat(meta["trained_at"])
    delta = datetime.now(timezone.utc) - trained_at
    meta["days_since_trained"] = delta.days
    meta["is_stale"] = delta > timedelta(days=STALE_DAYS)
    return meta


# ── Retrain ───────────────────────────────────────────────────────────────────

def _retrain_bg(stock_code: str, exchange_code: str) -> None:
    _job_queue[stock_code] = "retraining"
    try:
        df = get_historical_data(stock_code, exchange_code, interval="1day", days=500)
        df_ind = add_indicators(df)
        train_ensemble(stock_code, df_ind, force=True)
        logger.info("Retrain complete for %s", stock_code)
    except Exception as e:
        logger.error("Retrain failed for %s: %s", stock_code, e)
    finally:
        _job_queue.pop(stock_code, None)


@router.post("/{stock_code}/retrain")
def retrain_model(
    stock_code: str,
    background_tasks: BackgroundTasks,
    exchange_code: str = "NSE",
):
    code = stock_code.upper()
    if code in _job_queue:
        raise HTTPException(
            status_code=409,
            detail=f"{code} is already {_job_queue[code]} — wait for it to finish."
        )
    _job_queue[code] = "queued"
    background_tasks.add_task(_retrain_bg, code, exchange_code.upper())
    return {"message": f"Retraining {code} in background.", "stock_code": code, "status": "queued"}


@router.post("/retrain-all")
def retrain_all_models(background_tasks: BackgroundTasks):
    """Queue retrain for every portfolio holding not already in progress."""
    try:
        portfolio = get_portfolio()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not fetch portfolio: {e}")

    holdings = portfolio.get("holdings", [])
    if not holdings:
        return {"message": "No portfolio holdings found.", "queued": [], "skipped": []}

    queued, skipped = [], []
    for h in holdings:
        code = h.get("stock_code", "").upper()
        exch = h.get("exchange_code", "NSE").upper()
        if not code:
            continue
        if code in _job_queue:
            skipped.append(code)
        else:
            _job_queue[code] = "queued"
            background_tasks.add_task(_retrain_bg, code, exch)
            queued.append(code)

    return {
        "message": f"Queued {len(queued)} stocks ({len(skipped)} already in progress).",
        "queued": queued,
        "skipped": skipped,
        "status": "queued",
    }


# ── Tune ──────────────────────────────────────────────────────────────────────

def _tune_bg(stock_code: str, exchange_code: str, n_trials: int) -> None:
    _job_queue[stock_code] = "tuning"
    try:
        df = get_historical_data(stock_code, exchange_code, interval="1day", days=500)
        df_ind = add_indicators(df)
        tune_ensemble(stock_code, df_ind, n_trials=n_trials)
        logger.info("Tuning complete for %s", stock_code)
    except Exception as e:
        logger.error("Tuning failed for %s: %s", stock_code, e)
    finally:
        _job_queue.pop(stock_code, None)


@router.post("/{stock_code}/tune")
def tune_model(
    stock_code: str,
    background_tasks: BackgroundTasks,
    exchange_code: str = "NSE",
    n_trials: int = 20,
):
    code = stock_code.upper()
    if code in _job_queue:
        raise HTTPException(
            status_code=409,
            detail=f"{code} is already {_job_queue[code]} — wait for it to finish."
        )
    _job_queue[code] = "queued"
    background_tasks.add_task(_tune_bg, code, exchange_code.upper(), n_trials)
    return {
        "message": f"Tuning {code} with {n_trials} trials per model in background.",
        "stock_code": code,
        "n_trials": n_trials,
        "status": "queued",
    }


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/{stock_code}")
def delete_stock_model(stock_code: str):
    code = stock_code.upper()
    deleted = delete_model(code)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"No cached model for {code}.")
    return {"message": f"Model for {code} deleted.", "stock_code": code}


@router.delete("/")
def delete_all_models():
    """Delete ALL cached models."""
    from services.model_store import CACHE_DIR
    import shutil
    if CACHE_DIR.exists():
        shutil.rmtree(CACHE_DIR)
    return {"message": "All model caches cleared."}
