"""Stock data routes: historical OHLCV, live quotes, indicators, popular stocks."""

import logging
import random

from fastapi import APIRouter, HTTPException, Query

from services.data_fetcher import (
    POPULAR_STOCKS,
    get_historical_data,
    get_live_quote,
)
from services.feature_engineering import add_indicators, latest_indicators

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/popular")
def popular_stocks():
    """Return the curated list of popular NSE stocks."""
    return {"stocks": POPULAR_STOCKS}


@router.get("/peer")
def get_peer_stock(stock_code: str):
    """Find a single peer stock from the same industry sector."""
    code = stock_code.upper()
    idx = next(
        (i for i, s in enumerate(POPULAR_STOCKS) if s["stock_code"] == code), -1
    )
    if idx == -1:
        return {"peer": random.choice(POPULAR_STOCKS)}
    sector = POPULAR_STOCKS[idx].get("sector", "")
    peers = [
        s for s in POPULAR_STOCKS
        if s["sector"] == sector and s["stock_code"] != code
    ]
    if not peers:
        peers = [s for s in POPULAR_STOCKS if s["stock_code"] != code]
    return {"peer": random.choice(peers)}


@router.get("/peers")
def get_peer_stocks(stock_code: str, max_peers: int = 4):
    """Return up to N peers from same sector; fallback to popular stocks."""
    code = stock_code.upper()
    idx = next(
        (i for i, s in enumerate(POPULAR_STOCKS) if s["stock_code"] == code), -1
    )
    sector = POPULAR_STOCKS[idx].get("sector", "") if idx != -1 else ""
    sector_known = bool(sector)

    same_sector = [
        s for s in POPULAR_STOCKS
        if s.get("sector") == sector and s["stock_code"] != code
    ] if sector_known else []

    others = [
        s for s in POPULAR_STOCKS
        if s["stock_code"] != code and s not in same_sector
    ]
    random.shuffle(others)

    peers = (same_sector + others)[:max_peers]
    return {
        "stock_code": code,
        "sector": sector or "Unknown",
        "sector_known": sector_known,
        "peers": peers,
    }


@router.get("/quote")
def live_quote(
    stock_code: str = Query(..., description="NSE stock code, e.g. INFY"),
    exchange_code: str = Query("NSE"),
):
    """Fetch the latest market quote for a stock."""
    try:
        quote = get_live_quote(stock_code.upper(), exchange_code.upper())
        return quote
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("Quote fetch error for %s", stock_code)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history")
def historical_data(
    stock_code: str = Query(...),
    exchange_code: str = Query("NSE"),
    interval: str = Query(
        "1day", description="1day | 1minute | 5minute | 30minute"
    ),
    days: int = Query(365, ge=30, le=730),
):
    """Return OHLCV bars as a list of dicts for chart rendering."""
    try:
        df = get_historical_data(
            stock_code.upper(), exchange_code.upper(), interval, days
        )
        records = df.to_dict(orient="records")
        for r in records:
            if hasattr(r["datetime"], "timestamp"):
                r["datetime"] = int(r["datetime"].timestamp())
        return {"stock_code": stock_code, "interval": interval, "bars": records}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("History fetch error for %s", stock_code)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/indicators")
def technical_indicators(
    stock_code: str = Query(...),
    exchange_code: str = Query("NSE"),
):
    """Return latest indicator values + full time-series for chart overlays."""
    try:
        df = get_historical_data(stock_code.upper(), exchange_code.upper())
        df_ind = add_indicators(df)
        latest = latest_indicators(df_ind)

        tail = df_ind.tail(200)

        def _series(col: str) -> list:
            import math
            return [
                {
                    "datetime": int(row["datetime"].timestamp()),
                    "value": round(float(v), 4),
                }
                for _, row in tail.iterrows()
                if (v := row.get(col)) is not None and not math.isnan(v)
            ]

        return {
            "stock_code": stock_code,
            "latest": latest,
            "series": {
                "rsi": _series("rsi"),
                "macd": _series("macd"),
                "macd_signal": _series("macd_signal"),
                "macd_hist": _series("macd_hist"),
                "sma_20": _series("sma_20"),
                "sma_50": _series("sma_50"),
                "sma_200": _series("sma_200"),
                "bb_upper": _series("bb_upper"),
                "bb_lower": _series("bb_lower"),
                "volume": _series("volume"),
            },
        }
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("Indicator error for %s", stock_code)
        raise HTTPException(status_code=500, detail=str(e))
