"""Paper trading portfolio routes."""

import logging

from fastapi import APIRouter, HTTPException

from models.schemas import Portfolio, TradeOrder
from services.data_fetcher import get_live_quote
from services.portfolio_service import execute_trade, get_portfolio, reset_portfolio

router = APIRouter()
logger = logging.getLogger(__name__)


def _build_price_lookup(positions: list[dict]) -> dict[str, float]:
    """Fetch live prices for all open positions (best-effort)."""
    prices: dict[str, float] = {}
    for pos in positions:
        code = pos["stock_code"]
        try:
            quote = get_live_quote(code, pos.get("exchange_code", "NSE"))
            prices[code] = quote["last_price"]
        except Exception:
            pass  # fall back to avg_buy_price (handled in portfolio_service)
    return prices


@router.get("/", response_model=Portfolio)
def fetch_portfolio():
    """Return the full portfolio with live P&L."""
    try:
        # Load broker portfolio first
        raw = get_portfolio()
        # Optimistically try fetching latest live quotes for positions to update P&L accuracy on the fly
        prices = _build_price_lookup(raw["positions"])
        
        if prices: 
            return get_portfolio(price_lookup=prices)
        return raw
    except Exception as e:
        logger.exception("Portfolio fetch error")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/trade")
def place_trade(order: TradeOrder):
    """Execute a paper BUY or SELL trade."""
    try:
        # Resolve market price if not provided
        price = order.price
        if price is None:
            quote = get_live_quote(order.stock_code.upper(), order.exchange_code.upper())
            price = quote["last_price"]

        trade = execute_trade(
            stock_code=order.stock_code.upper(),
            exchange_code=order.exchange_code.upper(),
            action=order.action,
            quantity=order.quantity,
            price=price,
        )
        return {"success": True, "trade": trade}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("Trade execution error")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/reset")
def reset():
    """Reset the paper portfolio to initial capital (₹10,00,000)."""
    try:
        return reset_portfolio()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
