"""Pydantic-settings: loads all configuration from the .env file."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Breeze API ──────────────────────────────────────────────────────────
    breeze_api_key: str = "YOUR_API_KEY"
    breeze_api_secret: str = "YOUR_API_SECRET"
    breeze_session_token: str = "YOUR_SESSION_TOKEN"

    # ── Application ─────────────────────────────────────────────────────────
    app_env: str = "development"
    allowed_origins: str = "http://localhost:5173,http://localhost:3000"

    # ── Paper Trading ────────────────────────────────────────────────────────
    paper_portfolio_file: str = str(BASE_DIR / "portfolio.json")
    initial_capital: float = 1_000_000.0

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()
