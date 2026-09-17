#!/usr/bin/env python3
"""Poll FreeSWITCH ESL into Redis only while dashboards are active."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

from redis import Redis

from esl_client import EslClient

WAKE_KEY = "livecalls:wake"
DATA_KEY = "livecalls:data"


def load_env_file() -> None:
    env_path = Path(__file__).with_name(".env")
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


def poll_once(redis: Redis, esl: EslClient) -> bool:
    """Write one snapshot when awake; return whether polling was active."""
    if not redis.exists(WAKE_KEY):
        return False
    redis.set(DATA_KEY, json.dumps(esl.live_calls()), ex=10)
    return True


def main() -> None:
    load_env_file()
    redis = Redis.from_url(
        os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0"),
        decode_responses=True,
        protocol=2,
    )
    esl = EslClient(
        host=os.getenv("ESL_HOST", "127.0.0.1"),
        port=int(os.getenv("ESL_PORT", "8021")),
        password=os.getenv("ESL_PASSWORD", "ClueCon"),
        cache_seconds=0,
    )
    poll_interval = float(os.getenv("ESL_POLL_INTERVAL", "3"))
    idle_interval = float(os.getenv("ESL_IDLE_CHECK_INTERVAL", "30"))

    while True:
        try:
            active = poll_once(redis, esl)
            time.sleep(poll_interval if active else idle_interval)
        except Exception as error:
            print(f"[ESL_POLLER] {type(error).__name__}: {error}", flush=True)
            time.sleep(poll_interval)


if __name__ == "__main__":
    main()
