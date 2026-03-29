"""FastAPI application entry point."""

import logging
import ssl
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Global fix for macOS SSL certificate verify failed error
try:
    _create_unverified_https_context = ssl._create_unverified_context
except AttributeError:
    pass
else:
    ssl._create_default_https_context = _create_unverified_https_context

from core.config import get_settings

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s │ %(levelname)-8s │ %(name)s │ %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

settings = get_settings()

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="StockAI — ICICIDirect Prediction Engine",
    description="AI-powered stock analysis, price prediction, and paper trading via Breeze API.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ────────────────────────────────────────────────────────────────────
from api.routes import portfolio, predictions, stocks  # noqa: E402

app.include_router(stocks.router,      prefix="/api/stocks",      tags=["Stocks"])
app.include_router(predictions.router, prefix="/api/predictions",  tags=["Predictions"])
app.include_router(portfolio.router,   prefix="/api/portfolio",    tags=["Portfolio"])


# ── Health & Root ─────────────────────────────────────────────────────────────
@app.get("/", tags=["Health"])
async def root():
    return {
        "name":    "StockAI API",
        "version": "1.0.0",
        "status":  "running",
        "docs":    "/docs",
    }


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "healthy"}


# ── Dev entrypoint ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
