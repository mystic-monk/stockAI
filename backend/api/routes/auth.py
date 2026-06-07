"""Session token refresh — updates .env and reconnects Breeze without restart."""

import re
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.breeze_client import get_breeze, reset_breeze
from core.config import BASE_DIR, get_settings
from services.data_fetcher import _quote_cache, _history_cache

router = APIRouter()

ENV_FILE = BASE_DIR / ".env"


class SessionUpdate(BaseModel):
    session_token: str


@router.get("/status")
def session_status():
    """Check whether the current Breeze session is alive."""
    try:
        breeze = get_breeze()
        # Lightweight probe — fetch customer details
        resp = breeze.get_customer_details(api_session=get_settings().breeze_session_token)
        ok = resp.get("Status") == 200
        return {"connected": ok, "token_prefix": get_settings().breeze_session_token[:4] + "****"}
    except Exception as e:
        return {"connected": False, "error": str(e)}


@router.post("/session")
def update_session(body: SessionUpdate):
    """
    Update the Breeze session token at runtime:
    1. Write the new token to .env
    2. Bust the settings cache so the new value is picked up
    3. Reset the Breeze singleton so it reconnects on next request
    4. Flush in-memory data caches
    """
    token = body.session_token.strip()
    if not token:
        raise HTTPException(status_code=422, detail="session_token is required")

    # Update .env file
    if ENV_FILE.exists():
        text = ENV_FILE.read_text()
        if re.search(r"^BREEZE_SESSION_TOKEN\s*=", text, re.MULTILINE):
            text = re.sub(
                r"^(BREEZE_SESSION_TOKEN\s*=).*",
                f'BREEZE_SESSION_TOKEN="{token}"',
                text,
                flags=re.MULTILINE,
            )
        else:
            text += f'\nBREEZE_SESSION_TOKEN="{token}"\n'
        ENV_FILE.write_text(text)
    else:
        raise HTTPException(status_code=500, detail=".env file not found")

    # Reload settings + reconnect
    get_settings.cache_clear()
    reset_breeze()
    _quote_cache.clear()
    _history_cache.clear()

    # Verify new session works
    try:
        get_breeze()
        return {"ok": True, "message": "Session updated and reconnected successfully."}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Token saved but connection failed: {e}")
