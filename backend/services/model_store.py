"""Persist ensemble models and training metadata to disk.

Layout:
    backend/model_cache/<STOCK_CODE>/ensemble.joblib   — sklearn models dict
    backend/model_cache/<STOCK_CODE>/metadata.json     — KPIs + training info

Stale threshold: 7 days.  Caller decides whether to auto-retrain.
"""

import json
import logging
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

import joblib

logger = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).parent.parent / "model_cache"
STALE_DAYS = 7


def _stock_dir(stock_code: str) -> Path:
    d = CACHE_DIR / stock_code.upper()
    d.mkdir(parents=True, exist_ok=True)
    return d


# ── Save ──────────────────────────────────────────────────────────────────────

def save_models(stock_code: str, models: dict) -> None:
    path = _stock_dir(stock_code) / "ensemble.joblib"
    joblib.dump(models, path, compress=3)
    logger.info("Saved models for %s → %s", stock_code, path)


def save_metadata(stock_code: str, meta: dict) -> None:
    path = _stock_dir(stock_code) / "metadata.json"
    with open(path, "w") as f:
        json.dump(meta, f, indent=2)


# ── Load ──────────────────────────────────────────────────────────────────────

def load_models(stock_code: str) -> Optional[dict]:
    path = _stock_dir(stock_code) / "ensemble.joblib"
    if not path.exists():
        return None
    try:
        models = joblib.load(path)
        logger.info("Loaded cached models for %s", stock_code)
        return models
    except Exception as e:
        logger.warning("Failed to load models for %s: %s", stock_code, e)
        return None


def load_metadata(stock_code: str) -> Optional[dict]:
    path = _stock_dir(stock_code) / "metadata.json"
    if not path.exists():
        return None
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return None


# ── Status helpers ────────────────────────────────────────────────────────────

def is_stale(stock_code: str) -> bool:
    meta = load_metadata(stock_code)
    if not meta:
        return True
    trained_at = datetime.fromisoformat(meta["trained_at"])
    return (datetime.now(timezone.utc) - trained_at) > timedelta(days=STALE_DAYS)


def delete_model(stock_code: str) -> bool:
    """Remove cached models + metadata for a stock. Returns True if anything deleted."""
    d = CACHE_DIR / stock_code.upper()
    deleted = False
    for fname in ("ensemble.joblib", "metadata.json"):
        p = d / fname
        if p.exists():
            p.unlink()
            deleted = True
    return deleted


def list_all_metadata() -> list[dict]:
    """Return metadata for every cached stock, enriched with staleness info."""
    results = []
    if not CACHE_DIR.exists():
        return results
    for stock_dir in sorted(CACHE_DIR.iterdir()):
        if not stock_dir.is_dir():
            continue
        meta_path = stock_dir / "metadata.json"
        if not meta_path.exists():
            continue
        try:
            with open(meta_path) as f:
                meta = json.load(f)
            trained_at = datetime.fromisoformat(meta["trained_at"])
            now = datetime.now(timezone.utc)
            delta = now - trained_at
            meta["days_since_trained"] = delta.days
            meta["is_stale"] = delta > timedelta(days=STALE_DAYS)
            meta["model_file_kb"] = round(
                (stock_dir / "ensemble.joblib").stat().st_size / 1024, 1
            ) if (stock_dir / "ensemble.joblib").exists() else 0
            results.append(meta)
        except Exception as e:
            logger.warning("Bad metadata for %s: %s", stock_dir.name, e)
    return results
