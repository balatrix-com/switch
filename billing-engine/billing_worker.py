"""Concurrent-safe CDR rating worker for customer revenue and carrier cost."""

from __future__ import annotations

import logging
import signal
import time
import math
from typing import Any
from decimal import Decimal

import psycopg2
from psycopg2.extras import RealDictCursor, execute_values

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

def calculate_charge(rate: Decimal, seconds: int) -> Decimal:
    if seconds <= 0:
        return Decimal("0.00")
    # Rate is per minute
    minutes = Decimal(seconds) / Decimal("60")
    return (rate * minutes).quantize(Decimal("0.000001"))

def get_minute_bucket(direction: str, destination_number: str) -> str:
    direction = (direction or "").upper()
    if direction == "OUTBOUND":
        return "ob_free_minutes"
    # All inbound DIDs (TFN and local subtypes) share one allowance.
    return "did_free_minutes"


def rate_batch(cache_reader: CacheReader) -> int:
    with psycopg2.connect(DATABASE_DSN, cursor_factory=RealDictCursor) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, session_uuid AS "sessionUuid", customer_id AS "customerId",
                       customer_number_id AS "customerNumberId",
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

            # Lock customer wallets
            customer_ids = list(set(r["customerId"] for r in rows if r["customerId"]))
            wallets = {}
            if customer_ids:
                cursor.execute(
                    """
                    SELECT customer_id, currency, fiat_balance, credit_limit,
                           credit_used, tfn_free_minutes, did_free_minutes,
                           ob_free_minutes, version
                    FROM customer_wallets
                    WHERE customer_id = ANY(%s)
                    ORDER BY customer_id
                    FOR UPDATE
                    """,
                    (customer_ids,)
                )
                wallets = {r["customer_id"]: dict(r) for r in cursor.fetchall()}

            cache = cache_reader.get()
            wallet_dirty = set()
            transactions_to_insert = []
            
            for cdr in rows:
                cdr_id = cdr["id"]
                cursor.execute(
                    "UPDATE cdr SET rating_status='PROCESSING', rating_started_at=NOW(), "
                    "rating_attempts=rating_attempts+1, updated_at=NOW() WHERE id=%s",
                    (cdr_id,),
                )
                try:
                    result = rate_call(
                        cdr,
                        cache,
                        DEFAULT_INITIAL_INCREMENT_SECONDS,
                        DEFAULT_INCREMENT_SECONDS,
                    )
                    
                    customer_charge = Decimal(str(result["customerCharge"]))
                    rated_seconds = result.get("ratedSeconds", 0)
                    
                    # Settlement Logic
                    wallet = wallets.get(cdr["customerId"])
                    
                    free_mins_used = 0
                    fiat_debit = Decimal(0)
                    credit_debit = Decimal(0)
                    bucket = get_minute_bucket(cdr.get("direction"), cdr.get("destinationNumber"))
                    
                    if wallet and customer_charge > 0:
                        free_minutes_available = wallet[bucket]
                        rated_minutes = math.ceil(rated_seconds / 60) if rated_seconds > 0 else 0
                        
                        free_mins_used = min(free_minutes_available, rated_minutes)
                        wallet[bucket] -= free_mins_used
                        
                        if free_mins_used >= rated_minutes:
                            fiat_charge = Decimal(0)
                        else:
                            remaining_seconds = rated_seconds - (free_mins_used * 60)
                            sell_rate = Decimal(str(result.get("sellRatePerMinute", 0)))
                            fiat_charge = calculate_charge(sell_rate, remaining_seconds)
                            
                        # Multi-tier debit
                        fiat_bal = Decimal(str(wallet["fiat_balance"]))
                        credit_used = Decimal(str(wallet["credit_used"]))
                        
                        if fiat_bal >= fiat_charge:
                            wallet["fiat_balance"] = fiat_bal - fiat_charge
                            fiat_debit = fiat_charge
                        else:
                            fiat_debit = fiat_bal
                            remaining = fiat_charge - fiat_bal
                            wallet["fiat_balance"] = Decimal(0)
                            wallet["credit_used"] = credit_used + remaining
                            credit_debit = remaining
                            
                        wallet_dirty.add(cdr["customerId"])
                        
                        # Build Transaction
                        transactions_to_insert.append((
                            cdr["customerId"],
                            "cdr",
                            str(cdr_id),
                            f"cdr-{cdr['sessionUuid']}",
                            cdr.get("direction"),
                            bucket.replace("_free_minutes", "").upper(),
                            cdr.get("billsec", 0),
                            rated_seconds,
                            free_mins_used,
                            -free_mins_used if bucket == "did_free_minutes" else 0,
                            -free_mins_used if bucket == "ob_free_minutes" else 0,
                            fiat_debit + credit_debit,
                            credit_debit,
                            wallet["fiat_balance"],
                            result.get("rateCardId"),
                            result.get("sellRatePerMinute", 0),
                            result.get("carrierCost", 0)
                        ))

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
                            rating_error=NULL, rated_at=NOW(), updated_at=NOW(),
                            txn_status='SETTLED', free_minutes_used=%s, fiat_charged=%s,
                            txn_settled_at=NOW()
                        WHERE id=%s
                        """,
                        (
                            rated_seconds,
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
                            customer_charge,
                            result["carrierCost"],
                            free_mins_used,
                            fiat_debit + credit_debit,
                            cdr_id,
                        ),
                    )
                except Exception as error:  # keep malformed calls visible for review/retry
                    LOGGER.warning("rating failed cdr=%s: %s", cdr_id, error)
                    cursor.execute(
                        "UPDATE cdr SET rating_status='ERROR', rating_error=%s, updated_at=NOW(), txn_status='ERROR' WHERE id=%s",
                        (str(error)[:1000], cdr_id),
                    )
            
            # Bulk Insert Transactions
            if transactions_to_insert:
                execute_values(cursor, """
                    INSERT INTO transactions (
                        customer_id, source_type, source_ref, idempotency_key, 
                        direction, number_type, billsec, rated_seconds, 
                        free_minutes_used, did_minute_delta, ob_minute_delta,
                        fiat_debit_amount, credit_debit_amount,
                        balance_after, rate_card_id, sell_rate_per_minute, carrier_cost
                    ) VALUES %s
                    ON CONFLICT (idempotency_key) DO NOTHING
                """, transactions_to_insert)

            # Bulk Update Wallets
            for cid in wallet_dirty:
                w = wallets[cid]
                cursor.execute("""
                    UPDATE customer_wallets SET
                        fiat_balance = %s,
                        credit_used = %s,
                        tfn_free_minutes = %s,
                        did_free_minutes = %s,
                        ob_free_minutes = %s,
                        version = version + 1,
                        updated_at = NOW()
                    WHERE customer_id = %s
                """, (
                    w["fiat_balance"],
                    w["credit_used"],
                    w["tfn_free_minutes"],
                    w["did_free_minutes"],
                    w["ob_free_minutes"],
                    cid
                ))

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
                LOGGER.info("rated and settled batch size=%s", processed)
            else:
                try:
                    from recording_billing import run_recording_billing
                    cache = cache_reader.get()
                    rec_stats = run_recording_billing(cache)
                    if rec_stats.get("recordings_billed", 0) > 0:
                        LOGGER.info(
                            "recording billing: customers=%s recordings=%s charged=%s",
                            rec_stats["customers_processed"],
                            rec_stats["recordings_billed"],
                            rec_stats["total_charged"],
                        )
                except Exception:
                    LOGGER.exception("recording billing sub-process failed")
                time.sleep(WORKER_POLL_SECONDS)
        except Exception:
            LOGGER.exception("worker cycle failed")
            time.sleep(WORKER_POLL_SECONDS)


if __name__ == "__main__":
    main()
