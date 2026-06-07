"""Breeze credentials refresh — updates .env and reconnects without restart."""

import re
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.breeze_client import get_breeze, reset_breeze
from core.config import BASE_DIR, get_settings
from services.data_fetcher import _quote_cache, _history_cache

router = APIRouter()

ENV_FILE = BASE_DIR / ".env"

_ENV_KEYS = {
    "api_key":       "BREEZE_API_KEY",
    "api_secret":    "BREEZE_API_SECRET",
    "session_token": "BREEZE_SESSION_TOKEN",
}


def _upsert_env(text: str, env_key: str, value: str) -> str:
    """Insert or replace a key=value line in .env text."""
    pattern = rf"^{re.escape(env_key)}\s*=.*"
    replacement = f'{env_key}="{value}"'
    if re.search(pattern, text, re.MULTILINE):
        return re.sub(pattern, replacement, text, flags=re.MULTILINE)
    return text + f'\n{replacement}\n'


class SessionUpdate(BaseModel):
    session_token: str = ""
    api_key: str = ""
    api_secret: str = ""


@router.get("/status")
def session_status():
    """Check whether the current Breeze session is alive."""
    try:
        breeze = get_breeze()
        resp = breeze.get_customer_details(api_session=get_settings().breeze_session_token)
        ok = resp.get("Status") == 200
        return {"connected": ok, "token_prefix": get_settings().breeze_session_token[:4] + "****"}
    except Exception as e:
        return {"connected": False, "error": str(e)}


@router.post("/session")
def update_session(body: SessionUpdate):
    """
    Update any combination of Breeze credentials at runtime:
    - Writes provided values to .env (blanks are skipped — existing values kept)
    - Busts settings cache and resets the Breeze singleton
    - Flushes in-memory data caches
    """
    updates = {
        field: getattr(body, field).strip()
        for field in ("api_key", "api_secret", "session_token")
        if getattr(body, field).strip()
    }
    if not updates:
        raise HTTPException(status_code=422, detail="At least one field is required")

    if not ENV_FILE.exists():
        raise HTTPException(status_code=500, detail=".env file not found")

    text = ENV_FILE.read_text()
    for field, value in updates.items():
        text = _upsert_env(text, _ENV_KEYS[field], value)
    ENV_FILE.write_text(text)

    get_settings.cache_clear()
    reset_breeze()
    _quote_cache.clear()
    _history_cache.clear()

    try:
        get_breeze()
        updated = ", ".join(_ENV_KEYS[f] for f in updates)
        return {"ok": True, "message": f"Updated {updated} and reconnected successfully."}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Credentials saved but connection failed: {e}")
