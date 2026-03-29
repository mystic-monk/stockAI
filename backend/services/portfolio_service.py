"""Live ICICIDirect portfolio integration (Read-Only Mode).

Swapped from paper-trading to real Demat tracker.
"""

import logging
from core.breeze_client import get_breeze

logger = logging.getLogger(__name__)

def _parse_float(obj: dict, keys: list[str]) -> float:
    for k in keys:
        if k in obj and obj[k] not in (None, ""):
            try:
                return float(obj[k])
            except ValueError:
                pass
    return 0.0

def get_portfolio(price_lookup: dict[str, float] | None = None) -> dict:
    """Fetch live portfolio constraints and holdings right from the exchange."""
    price_lookup = price_lookup or {}
    breeze = get_breeze()

    cash_balance = 0.0
    try:
        funds = breeze.get_funds()
        if funds and funds.get("Success"):
            for item in funds["Success"]:
                # Aggregate available margins/funding across segments seamlessly
                cash_balance += _parse_float(item, ["available", "available_margin", "AvailableMargin", "cash_balance", "cash"])
    except Exception as e:
        logger.error("Error retrieving live funds: %s", e)

    positions = []
    total_invested = 0.0
    total_current = 0.0

    try:
        from services.data_fetcher import POPULAR_STOCKS
        sector_map = {s["stock_code"]: s["sector"] for s in POPULAR_STOCKS}
        # Note: ISO date ranges are mostly ignored by holding endpoints but required by SDK typing
        # Some SDKs prefer empty string or ISO. We'll pass empty strings to fetch all.
        holdings = breeze.get_portfolio_holdings(exchange_code="NSE", from_date="", to_date="", stock_code="", portfolio_type="")
        if holdings and holdings.get("Success"):
            for item in holdings["Success"]:
                stock = item.get("stock_code") or item.get("symbol", "UNKNOWN")
                qty = int(_parse_float(item, ["quantity", "quantity_available", "quantityAvailable"]))
                avg_price = _parse_float(item, ["average_price", "avg_price", "buy_avg_price"])
                
                if qty <= 0:
                    continue
                
                invested = qty * avg_price
                # Fallback to cost basis if live quote hasn't synced yet (to prevent artificially massive PnL swings)
                cur_price = price_lookup.get(stock, avg_price)
                current = qty * cur_price
                
                pnl = current - invested
                pnl_pct = (pnl / invested * 100) if invested else 0.0
                
                total_invested += invested
                total_current += current
                
                positions.append({
                    "stock_code": stock,
                    "exchange_code": "NSE",
                    "sector": sector_map.get(stock, "Misc"),
                    "quantity": qty,
                    "avg_buy_price": round(avg_price, 2),
                    "current_price": round(cur_price, 2),
                    "invested_value": round(invested, 2),
                    "current_value": round(current, 2),
                    "pnl": round(pnl, 2),
                    "pnl_pct": round(pnl_pct, 2)
                })
    except Exception as e:
        logger.error("Error retrieving holdings: %s", e)

    total_pnl = total_current - total_invested
    total_pnl_pct = (total_pnl / total_invested * 100) if total_invested else 0.0

    return {
        "cash_balance": round(cash_balance, 2),
        "total_invested": round(total_invested, 2),
        "total_current_value": round(total_current, 2),
        "total_pnl": round(total_pnl, 2),
        "total_pnl_pct": round(total_pnl_pct, 2),
        "positions": positions,
        "trades": [],  # Real trades log requires dedicated query APIs
    }


def execute_trade(stock_code: str, exchange_code: str, action: str, quantity: int, price: float) -> dict:
    """Safely block trades. App is configured to Read-Only for live data."""
    raise ValueError("Real-money Trade executions are DISABLED. The app is in READ-ONLY mode to protect your portfolio from automated alterations.")

def reset_portfolio() -> dict:
    raise ValueError("Live brokerage portfolios cannot be arbitrarily reset. Trades must be closed via exchange orders.")
