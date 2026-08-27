"""Concurrent-safe CDR rating worker for customer revenue and carrier cost."""

from __future__ import annotations

import logging
import signal
import time
from typing import Any

import psycopg2
from psycopg2.extras import RealDictCursor

from billing_service import rate_call
from cache_manager import CacheReader
from config import (
    DATABASE_DSN,
    DEFAULT_INCREMENT_SECONDS,
    DEFAULT_INITIAL_INCREMENT_SECONDS,
    RETRY_LIMIT,
    WORKER_BATCH_SIZE,
    WORKER_POLL_SECONDS,
)

logging.basicConfig(level=logging.INFO, format="[BILLING] %(asctime)s %(levelname)s %(message)s")
LOGGER = logging.getLogger("billing-worker")
RUNNING = True


def stop(*_: Any) -> None:
    global RUNNING
    RUNNING = False


def rate_batch(cache_reader: CacheReader) -> int:
    with psycopg2.connect(DATABASE_DSN, cursor_factory=RealDictCursor) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, session_uuid AS "sessionUuid", customer_id AS "customerId",
                       carrier_id AS "carrierId", direction,
                       destination_number AS "destinationNumber", started_at AS "startedAt",
                       answered, billsec, carrier_billsec AS "carrierBillsec"
                FROM cdr
                WHERE rating_status IN ('PENDING', 'ERROR')
                  AND rating_attempts < %s
                ORDER BY created_at, id
                FOR UPDATE SKIP LOCKED
                LIMIT %s
                """,
                (RETRY_LIMIT, WORKER_BATCH_SIZE),
            )
            rows = [dict(row) for row in cursor.fetchall()]
            if not rows:
                return 0

            cache = cache_reader.get()
            for cdr in rows:
                cursor.execute(
                    "UPDATE cdr SET rating_status='PROCESSING', rating_started_at=NOW(), "
                    "rating_attempts=rating_attempts+1, updated_at=NOW() WHERE id=%s",
                    (cdr["id"],),
                )
                try:
                    result = rate_call(
                        cdr,
                        cache,
                        DEFAULT_INITIAL_INCREMENT_SECONDS,
                        DEFAULT_INCREMENT_SECONDS,
                    )
                    cursor.execute(
                        """
                        UPDATE cdr SET
                            rating_status='RATED', rated_seconds=%s,
                            carrier_rated_seconds=%s, rate_card_id=%s,
                            carrier_rate_card_id=%s, rate_card_version=%s,
                            carrier_rate_card_version=%s,
                            customer_minimum_billing_id=%s,
                            carrier_minimum_billing_id=%s,
                            customer_initial_increment_seconds=%s,
                            carrier_initial_increment_seconds=%s,
                            customer_billing_increment_seconds=%s,
                            carrier_billing_increment_seconds=%s,
                            currency=%s, carrier_currency=%s,
                            sell_rate_per_minute=%s, carrier_rate_per_minute=%s,
                            customer_charge=%s, carrier_cost=%s,
                            rating_error=NULL, rated_at=NOW(), updated_at=NOW()
                        WHERE id=%s
                        """,
                        (
                            result.get("ratedSeconds", 0),
                            result.get("carrierRatedSeconds", 0),
                            result.get("rateCardId"),
                            result.get("carrierRateCardId"),
                            result.get("rateCardVersion"),
                            result.get("carrierRateCardVersion"),
                            result.get("customerMinimumBillingId"),
                            result.get("carrierMinimumBillingId"),
                            result.get("customerInitialIncrementSeconds"),
                            result.get("carrierInitialIncrementSeconds"),
                            result.get("customerBillingIncrementSeconds"),
                            result.get("carrierBillingIncrementSeconds"),
                            result.get("currency", "USD"),
                            result.get("carrierCurrency"),
                            result.get("sellRatePerMinute", 0),
                            result.get("carrierRatePerMinute", 0),
                            result["customerCharge"],
                            result["carrierCost"],
                            cdr["id"],
                        ),
                    )
                except Exception as error:  # keep malformed calls visible for review/retry
                    LOGGER.warning("rating failed cdr=%s: %s", cdr["id"], error)
                    cursor.execute(
                        "UPDATE cdr SET rating_status='ERROR', rating_error=%s, updated_at=NOW() WHERE id=%s",
                        (str(error)[:1000], cdr["id"]),
                    )
            return len(rows)


def main() -> None:
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    cache_reader = CacheReader()
    LOGGER.info("worker started batch=%s poll=%ss", WORKER_BATCH_SIZE, WORKER_POLL_SECONDS)
    while RUNNING:
        try:
            processed = rate_batch(cache_reader)
            if processed:
                LOGGER.info("rated batch size=%s", processed)
            else:
                time.sleep(WORKER_POLL_SECONDS)
        except Exception:
            LOGGER.exception("worker cycle failed")
            time.sleep(WORKER_POLL_SECONDS)


if __name__ == "__main__":
    main()

