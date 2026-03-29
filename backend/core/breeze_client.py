"""Singleton Breeze API session manager."""

import logging

from breeze_connect import BreezeConnect

from .config import get_settings

logger = logging.getLogger(__name__)

_breeze_instance: BreezeConnect | None = None


def get_breeze() -> BreezeConnect:
    """Return (or create) the authenticated Breeze singleton."""
    global _breeze_instance
    if _breeze_instance is None:
        settings = get_settings()
        logger.info("Initialising Breeze API session …")
        breeze = BreezeConnect(api_key=settings.breeze_api_key)
        breeze.generate_session(
            api_secret=settings.breeze_api_secret,
            session_token=settings.breeze_session_token,
        )
        _breeze_instance = breeze
        logger.info("Breeze session established successfully.")
    return _breeze_instance


def reset_breeze() -> None:
    """Drop the singleton so the next call to get_breeze() creates a fresh session.
    Useful when the daily session token is refreshed."""
    global _breeze_instance
    _breeze_instance = None
    logger.info("Breeze session reset.")
