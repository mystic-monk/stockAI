"""Fetch historical OHLCV and live quotes from ICICIDirect Breeze API.

Data is cached in-memory (TTL = 5 min for quotes, 30 min for history)
to stay well within Breeze rate limits.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import pandas as pd
from cachetools import TTLCache, cached

from core.breeze_client import get_breeze

logger = logging.getLogger(__name__)

# ── In-memory caches ─────────────────────────────────────────────────────────
_quote_cache: TTLCache = TTLCache(maxsize=200, ttl=300)      # 5 min
_history_cache: TTLCache = TTLCache(maxsize=100, ttl=1800)   # 30 min


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fmt_breeze_date(dt: datetime) -> str:
    """Convert datetime → Breeze ISO8601 string."""
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _parse_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


# ── Symbol Translation ────────────────────────────────────────────────────────
NSE_TO_BREEZE = {
    "RELIANCE": "RELIND", "INFY": "INFTEC", "HDFCBANK": "HDFBAN", 
    "ICICIBANK": "ICIBAN", "KOTAKBANK": "KOTMAH", "SBIN": "STABAN", 
    "AXISBANK": "AXIBAN", "BAJFINANCE": "BAJFIN", "HINDUNILVR": "HINLEV", 
    "BHARTIARTL": "BHAIRT", "LT": "LARTOU", "SUNPHARMA": "SUNPHA", 
    "TITAN": "TITIND", "TATAMOTORS": "TATMOT", "M&M": "MAHMAH",
    "BAJAJFINSV": "BAJFI", "ASIANPAINT": "ASIPAI", "HCLTECH": "HCLTEC",
}

def _resolve_code(code: str) -> str:
    return NSE_TO_BREEZE.get(code.upper(), code.upper())


# ── Historical Data ───────────────────────────────────────────────────────────

def get_historical_data(
    stock_code: str,
    exchange_code: str = "NSE",
    interval: str = "1day",
    days: int = 500,
) -> pd.DataFrame:
    """
    Return a DataFrame of OHLCV bars for the past `days` calendar days.

    Columns: datetime (index), open, high, low, close, volume
    """
    stock_code = _resolve_code(stock_code)
    cache_key = (stock_code, exchange_code, interval, days)
    if cache_key in _history_cache:
        logger.debug("Cache hit for historical data: %s", cache_key)
        return _history_cache[cache_key]

    breeze = get_breeze()
    to_dt = datetime.now(timezone.utc)
    from_dt = to_dt - timedelta(days=days)

    logger.info(
        "Fetching %s days of %s data for %s/%s …",
        days, interval, stock_code, exchange_code,
    )

    try:
        response = breeze.get_historical_data_v2(
            interval=interval,
            from_date=_fmt_breeze_date(from_dt),
            to_date=_fmt_breeze_date(to_dt),
            stock_code=stock_code,
            exchange_code=exchange_code,
            product_type="cash",
        )
    except Exception as e:
        logger.error("Breeze history SDK crash for %s: %s", stock_code, e)
        raise ValueError(f"Breeze network/SDK error: {str(e)}")

    if response.get("Status") != 200 or not response.get("Success"):
        error = response.get("Error", "Unknown error from Breeze API")
        logger.error("Breeze API error for %s: %s", stock_code, error)
        raise ValueError(f"Breeze API error: {error}")

    records = response["Success"]
    df = pd.DataFrame(records)

    # Normalise column names
    col_map = {
        "datetime": "datetime",
        "open": "open",
        "high": "high",
        "low": "low",
        "close": "close",
        "volume": "volume",
    }
    df = df.rename(columns={k: v for k, v in col_map.items() if k in df.columns})

    # Coerce types
    df["datetime"] = pd.to_datetime(df["datetime"])
    for col in ("open", "high", "low", "close", "volume"):
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.sort_values("datetime").reset_index(drop=True)
    df = df.drop_duplicates(subset=["datetime"], keep="last")
    df = df.dropna(subset=["open", "high", "low", "close", "volume"])

    if df.empty:
        raise ValueError(f"No historical data returned for {stock_code}")

    _history_cache[cache_key] = df
    logger.info("Fetched %d bars for %s", len(df), stock_code)
    return df


# ── Live Quote ────────────────────────────────────────────────────────────────

def get_live_quote(stock_code: str, exchange_code: str = "NSE") -> dict:
    """Return the latest quote dict for a stock."""
    stock_code = _resolve_code(stock_code)
    cache_key = (stock_code, exchange_code)
    if cache_key in _quote_cache:
        return _quote_cache[cache_key]

    breeze = get_breeze()
    try:
        response = breeze.get_quotes(
            stock_code=stock_code,
            exchange_code=exchange_code,
            expiry_date="",
            product_type="cash",
            right="others",
            strike_price="0",
        )
    except Exception as e:
        logger.error("Breeze SDK crashed for %s: %s", stock_code, e)
        raise ValueError(f"Breeze network/SDK error: {str(e)}")

    if response.get("Status") != 200 or not response.get("Success"):
        error = response.get("Error", "Unknown error from Breeze API")
        raise ValueError(f"Breeze quote error: {error}")

    raw = response["Success"][0]

    last_price = _parse_float(raw.get("ltp") or raw.get("last_rate"))
    prev_close = _parse_float(raw.get("previous_close") or raw.get("prev_close"))
    change = last_price - prev_close
    change_pct = (change / prev_close * 100) if prev_close else 0.0

    quote = {
        "stock_code": stock_code,
        "exchange_code": exchange_code,
        "last_price": last_price,
        "open": _parse_float(raw.get("open")),
        "high": _parse_float(raw.get("high")),
        "low": _parse_float(raw.get("low")),
        "prev_close": prev_close,
        "change": round(change, 2),
        "change_pct": round(change_pct, 2),
        "volume": _parse_float(raw.get("total_quantity_traded")),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    _quote_cache[cache_key] = quote
    return quote


# ── Popular stocks list ───────────────────────────────────────────────────────

POPULAR_STOCKS = [
    {"stock_code": "RELIND",      "name": "Reliance Industries",  "exchange_code": "NSE", "sector": "Energy"},
    {"stock_code": "TCS",         "name": "Tata Consultancy Services", "exchange_code": "NSE", "sector": "IT"},
    {"stock_code": "INFTEC",      "name": "Infosys",              "exchange_code": "NSE", "sector": "IT"},
    {"stock_code": "HDFBAN",      "name": "HDFC Bank",            "exchange_code": "NSE", "sector": "Banking"},
    {"stock_code": "ICIBAN",      "name": "ICICI Bank",           "exchange_code": "NSE", "sector": "Banking"},
    {"stock_code": "KOTMAH",      "name": "Kotak Mahindra Bank",  "exchange_code": "NSE", "sector": "Banking"},
    {"stock_code": "STABAN",      "name": "State Bank of India",  "exchange_code": "NSE", "sector": "Banking"},
    {"stock_code": "WIPRO",       "name": "Wipro",                "exchange_code": "NSE", "sector": "IT"},
    {"stock_code": "AXIBAN",      "name": "Axis Bank",            "exchange_code": "NSE", "sector": "Banking"},
    {"stock_code": "BAJFIN",      "name": "Bajaj Finance",        "exchange_code": "NSE", "sector": "Finance"},
    {"stock_code": "HINLEV",      "name": "Hindustan Unilever",   "exchange_code": "NSE", "sector": "FMCG"},
    {"stock_code": "ITC",         "name": "ITC Limited",          "exchange_code": "NSE", "sector": "FMCG"},
    {"stock_code": "BHAIRT",      "name": "Bharti Airtel",        "exchange_code": "NSE", "sector": "Telecom"},
    {"stock_code": "LARTOU",      "name": "Larsen & Toubro",      "exchange_code": "NSE", "sector": "Infrastructure"},
    {"stock_code": "MARUTI",      "name": "Maruti Suzuki",        "exchange_code": "NSE", "sector": "Auto"},
    {"stock_code": "SUNPHA",      "name": "Sun Pharmaceutical",   "exchange_code": "NSE", "sector": "Pharma"},
    {"stock_code": "TITIND",      "name": "Titan Company",        "exchange_code": "NSE", "sector": "Consumer"},
    {"stock_code": "TATMOT",      "name": "Tata Motors",          "exchange_code": "NSE", "sector": "Auto"},
    {"stock_code": "ADAPOR",      "name": "Adani Ports",          "exchange_code": "NSE", "sector": "Infrastructure"},
    {"stock_code": "POWGRI",      "name": "Power Grid Corp",      "exchange_code": "NSE", "sector": "Utilities"},
]
