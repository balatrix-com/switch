#!/usr/bin/env python3
"""Continuously promote merged raw call events into the final CDR table."""

from __future__ import annotations

import logging
import signal
import sys
import threading
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from livecall_to_cdr.config import BATCH_SIZE, LOG_LEVEL, POLL_SECONDS, RUN_ONCE
    from livecall_to_cdr.repository import LiveCallToCdrRepository
else:
    from .config import BATCH_SIZE, LOG_LEVEL, POLL_SECONDS, RUN_ONCE
    from .repository import LiveCallToCdrRepository


logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s %(levelname)s [LIVE-CALL-TO-CDR] %(message)s",
)
LOGGER = logging.getLogger("live-call-to-cdr")
STOP_EVENT = threading.Event()


def main() -> None:
    repository = LiveCallToCdrRepository()

    def shutdown(_signum: int, _frame: object) -> None:
        STOP_EVENT.set()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)
    repository.initialize()
    LOGGER.info(
        "worker started batch_size=%s poll_seconds=%s",
        BATCH_SIZE,
        POLL_SECONDS,
    )

    try:
        while not STOP_EVENT.is_set():
            try:
                promoted = repository.promote_ready()
                if promoted:
                    LOGGER.info("promoted %s READY call(s) into cdr", promoted)
            except Exception:
                LOGGER.exception("promotion batch failed; transaction was rolled back")
                promoted = 0

            if RUN_ONCE:
                break
            if promoted:
                continue
            STOP_EVENT.wait(POLL_SECONDS)
    finally:
        repository.close()
        LOGGER.info("worker stopped")


if __name__ == "__main__":
    main()
