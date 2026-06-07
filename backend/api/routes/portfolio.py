"""Portfolio routes: live holdings, paper trades, and ML predictions."""

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from models.schemas import Portfolio, PortfolioPredictions, TradeOrder
from services.data_fetcher import get_historical_data, get_live_quote
from services.feature_engineering import add_indicators
from services.ml_ensemble import XGB_AVAILABLE, predict_ensemble
from services.ml_models import TF_AVAILABLE
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


# ── Portfolio ML Predictions ──────────────────────────────────────────────────

def _predict_one(pos: dict) -> dict:
    """Run ensemble prediction for a single position. Thread-safe."""
    code = pos["stock_code"]
    exchange = pos.get("exchange_code", "NSE")
    try:
        quote = get_live_quote(code, exchange)
        current_price = quote["last_price"] or pos["current_price"]

        df = get_historical_data(code, exchange, interval="1day", days=500)
        df_ind = add_indicators(df)

        pred = predict_ensemble(code, df_ind, current_price)

        qty = pos["quantity"]
        current_value = qty * current_price
        expected_gain = qty * pred["predicted_price"] - current_value

        return {
            "stock_code":       code,
            "exchange_code":    exchange,
            "signal":           pred["signal"],
            "confidence":       pred["confidence"],
            "agreement_pct":    pred["agreement_pct"],
            "model_votes":      pred["model_votes"],
            "avg_prob_up":      pred["avg_prob_up"],
            "avg_prob_down":    pred["avg_prob_down"],
            "current_price":    round(current_price, 2),
            "predicted_price":  pred["predicted_price"],
            "price_change_pct": pred["price_change_pct"],
            "price_predictions":pred["price_predictions"],
            "target_price":     pred["target_price"],
            "stop_loss":        pred["stop_loss"],
            "n_models":         pred["n_models"],
            "quantity":         qty,
            "invested_value":   pos["invested_value"],
            "current_value":    round(current_value, 2),
            "pnl":              pos["pnl"],
            "pnl_pct":          pos["pnl_pct"],
            "expected_gain":    round(expected_gain, 2),
            "error":            None,
        }
    except Exception as exc:
        logger.warning("Prediction failed for %s: %s", code, exc)
        return {
            "stock_code":    code,
            "exchange_code": exchange,
            "signal":        "HOLD",
            "confidence":    0.0,
            "agreement_pct": 0.0,
            "model_votes":   {},
            "avg_prob_up":   0.0,
            "avg_prob_down": 0.0,
            "current_price": pos.get("current_price", 0.0),
            "predicted_price": pos.get("current_price", 0.0),
            "price_change_pct": 0.0,
            "price_predictions": {},
            "target_price":  pos.get("current_price", 0.0),
            "stop_loss":     pos.get("current_price", 0.0),
            "n_models":      0,
            "quantity":      pos.get("quantity", 0),
            "invested_value":pos.get("invested_value", 0.0),
            "current_value": pos.get("current_value", 0.0),
            "pnl":           pos.get("pnl", 0.0),
            "pnl_pct":       pos.get("pnl_pct", 0.0),
            "expected_gain": 0.0,
            "error":         str(exc)[:120],
        }


@router.get("/predictions", response_model=PortfolioPredictions)
def portfolio_predictions():
    """
    Run 4-model ML ensemble on every holding and return per-stock signals.

    Models: Random Forest | Extra Trees | Gradient Boosting | XGBoost (if available)
    Price:  GBR regression + LSTM (if available / already cached)
    Runs positions in parallel (max 4 workers) to keep latency reasonable.
    """
    try:
        portfolio = get_portfolio()
        positions = portfolio.get("positions", [])
        if not positions:
            raise HTTPException(status_code=404, detail="No positions found in portfolio.")

        results: list[dict] = []

        # Parallel inference — 4 workers balances speed vs Breeze rate limits
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {pool.submit(_predict_one, pos): pos for pos in positions}
            for future in as_completed(futures):
                results.append(future.result())

        # Sort: BUY first (highest confidence), then HOLD, then SELL
        order = {"BUY": 0, "HOLD": 1, "SELL": 2}
        results.sort(key=lambda r: (order.get(r["signal"], 1), -r["confidence"]))

        # ── Summary ───────────────────────────────────────────────────────────
        analyzed   = [r for r in results if not r["error"]]
        failed     = [r for r in results if r["error"]]
        buy_c  = sum(1 for r in analyzed if r["signal"] == "BUY")
        sell_c = sum(1 for r in analyzed if r["signal"] == "SELL")
        hold_c = sum(1 for r in analyzed if r["signal"] == "HOLD")

        avg_conf = round(
            sum(r["confidence"] for r in analyzed) / len(analyzed), 1
        ) if analyzed else 0.0

        bullish_pct = round(buy_c / len(analyzed) * 100, 1) if analyzed else 0.0

        # Value-weighted expected portfolio move
        total_val = sum(r["current_value"] for r in analyzed) or 1
        exp_move = round(
            sum(r["price_change_pct"] * r["current_value"] / total_val
                for r in analyzed), 2
        )

        model_names = list(analyzed[0]["model_votes"].keys()) if analyzed else []
        if TF_AVAILABLE:
            model_names.append("LSTM")
        if XGB_AVAILABLE and "XGBoost" not in model_names:
            model_names.append("XGBoost")

        return {
            "summary": {
                "total_positions":             len(positions),
                "analyzed":                    len(analyzed),
                "failed":                      len(failed),
                "buy_count":                   buy_c,
                "sell_count":                  sell_c,
                "hold_count":                  hold_c,
                "avg_confidence":              avg_conf,
                "bullish_pct":                 bullish_pct,
                "expected_portfolio_move_pct": exp_move,
                "models_used":                 model_names,
            },
            "predictions": results,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Portfolio predictions error")
        raise HTTPException(status_code=500, detail=str(e))
