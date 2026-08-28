"""Configuration shared by the live-call-to-CDR worker."""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse


SERVICE_DIRECTORY = Path(__file__).resolve().parent.parent


def load_env_file() -> None:
    env_path = SERVICE_DIRECTORY / ".env"
    if not env_path.is_file():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key and key.replace("_", "").isalnum():
            os.environ.setdefault(key, value.strip().strip('"').strip("'"))


def boolean_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def psycopg_dsn(database_url: str) -> str:
    parsed = urlparse(database_url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.pop("schema", None)
    return urlunparse(parsed._replace(query=urlencode(query)))


load_env_file()

DATABASE_URL = os.environ["DATABASE_URL"]
DB_POOL_MIN = int(os.getenv("CDR_WORKER_DB_POOL_MIN", "1"))
DB_POOL_MAX = int(os.getenv("CDR_WORKER_DB_POOL_MAX", "2"))
BATCH_SIZE = int(os.getenv("CDR_WORKER_BATCH_SIZE", "100"))
POLL_SECONDS = float(os.getenv("CDR_WORKER_POLL_SECONDS", "2"))
AUTO_CREATE_SCHEMA = boolean_env("AUTO_CREATE_SCHEMA", True)
RUN_ONCE = boolean_env("CDR_WORKER_RUN_ONCE", False)
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
HOMER_CAPTURE_ID = int(os.getenv("HOMER_CAPTURE_ID", "61"))
