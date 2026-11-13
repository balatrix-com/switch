"""Environment configuration shared by the cache API and rating worker."""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def _int(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))


def postgres_dsn(url: str) -> str:
    """Remove Prisma-only URL parameters before handing a DSN to psycopg2."""
    parts = urlsplit(url)
    query = [(key, value) for key, value in parse_qsl(parts.query) if key != "schema"]
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


DATABASE_URL = os.getenv("DATABASE_URL", "")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is required")

DATABASE_DSN = postgres_dsn(DATABASE_URL)
_configured_cache_path = Path(os.getenv("BILLING_CACHE_PATH", "cache/billing_cache.json"))
# PM2 may launch the API and worker with different working directories. Both
# processes must resolve a relative cache path against this service directory.
CACHE_PATH = (_configured_cache_path if _configured_cache_path.is_absolute()
              else BASE_DIR / _configured_cache_path).resolve()
CACHE_REFRESH_TOKEN = os.getenv("BILLING_CACHE_REFRESH_TOKEN", "change-me")
API_HOST = os.getenv("BILLING_API_HOST", "127.0.0.1")
API_PORT = _int("BILLING_API_PORT", 9100)
WORKER_BATCH_SIZE = _int("BILLING_WORKER_BATCH_SIZE", 100)
WORKER_POLL_SECONDS = float(os.getenv("BILLING_WORKER_POLL_SECONDS", "2"))
RETRY_LIMIT = _int("BILLING_RETRY_LIMIT", 5)
DEFAULT_INITIAL_INCREMENT_SECONDS = _int("DEFAULT_INITIAL_INCREMENT_SECONDS", 60)
DEFAULT_INCREMENT_SECONDS = _int("DEFAULT_INCREMENT_SECONDS", 60)
