"""FastAPI application entry point."""

import json
import logging
import math
import ssl
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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

# ── NaN-safe JSON encoder ─────────────────────────────────────────────────────
class _SafeEncoder(json.JSONEncoder):
    def iterencode(self, o, _one_shot=False):
        return super().iterencode(self._clean(o), _one_shot)

    def _clean(self, obj):
        if isinstance(obj, dict):
            return {k: self._clean(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [self._clean(v) for v in obj]
        if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
            return 0.0
        return obj


class _SafeJSONResponse(JSONResponse):
    def render(self, content) -> bytes:
        return json.dumps(content, cls=_SafeEncoder, ensure_ascii=False).encode("utf-8")


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    default_response_class=_SafeJSONResponse,
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
from api.routes import auth, models, portfolio, predictions, stocks  # noqa: E402

app.include_router(stocks.router,      prefix="/api/stocks",      tags=["Stocks"])
app.include_router(predictions.router, prefix="/api/predictions",  tags=["Predictions"])
app.include_router(portfolio.router,   prefix="/api/portfolio",    tags=["Portfolio"])
app.include_router(models.router,      prefix="/api/models",       tags=["Models"])
app.include_router(auth.router,        prefix="/api/auth",         tags=["Auth"])


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health", tags=["Health"])
async def health():
    return {"status": "healthy"}


# ── Serve React frontend (production build) ───────────────────────────────────
import os
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

_DIST = Path(__file__).parent.parent / "frontend" / "dist"

if _DIST.exists():
    app.mount("/assets", StaticFiles(directory=_DIST / "assets"), name="assets")

    @app.get("/", include_in_schema=False)
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str = ""):
        # Let /api/* and /docs pass through to FastAPI handlers above
        if full_path.startswith(("api/", "docs", "redoc", "openapi", "health")):
            from fastapi import HTTPException
            raise HTTPException(status_code=404)
        index = _DIST / "index.html"
        return FileResponse(index) if index.exists() else {"error": "Frontend not built"}
else:
    @app.get("/", tags=["Health"])
    async def root():
        return {"name": "StockAI API", "version": "1.0.0", "status": "running",
                "note": "Frontend not built — run: cd frontend && npm run build"}


# ── Dev entrypoint ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
