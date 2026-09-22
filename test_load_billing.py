#!/usr/bin/env python3
"""
=============================================================================
  LOAD TEST: 100 Live Call Events -> CDR -> Billing Pipeline
=============================================================================

What this script does:
  1. SEEDS  - Creates 3 test customers with wallets, assigns the real CUSTOMER
              rate card from the DB, and optionally assigns a recording rate
              card to 1 customer.
  2. SEEDS  - Inserts 100 CDR rows (some INBOUND, some OUTBOUND, some TFN,
              some with has_recording=True) spread across 3 customers.
  3. VERIFIES CACHE - Triggers a cache refresh and shows what got loaded.
  4. RUNS BILLING  - Calls rate_batch() exactly as billing_worker.py does in
                     production.
  5. RUNS RECORDING BILLING - Calls run_recording_billing() for recorded CDRs.
  6. REPORTS - For each customer shows:
               * Starting vs ending wallet state
               * Per-CDR: direction, billsec, rated_seconds, free_mins_used,
                          fiat_debit, credit_debit, rate_card used
               * Total transactions generated
               * Recording billing row details
               * Any errors / SKIPPED CDRs

Run from the billing-engine directory:
    python ../test_load_billing.py

=============================================================================
"""

from __future__ import annotations

import sys
import os
import uuid
import random
from datetime import datetime, timezone, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

# ── make billing-engine importable ─────────────────────────────────────────
BILLING_ENGINE_DIR = os.path.join(os.path.dirname(__file__), "billing-engine")
sys.path.insert(0, BILLING_ENGINE_DIR)

import psycopg2
from psycopg2.extras import RealDictCursor, execute_values

from config import DATABASE_DSN, DEFAULT_INITIAL_INCREMENT_SECONDS, DEFAULT_INCREMENT_SECONDS, RETRY_LIMIT, WORKER_BATCH_SIZE
from cache_manager import CacheReader, refresh_cache
from billing_worker import rate_batch
from recording_billing import run_recording_billing

# ── constants ──────────────────────────────────────────────────────────────
TOTAL_CDR       = 100
N_CUSTOMERS     = 3
TAG             = "LOAD_TEST"

# Realistic US/TFN phone numbers
TOLL_FREE_DESTS  = ["18005551234", "18885551234", "18775551234"]
DID_DESTS        = ["12125551234", "13105551234", "17025551234"]
OUTBOUND_DESTS   = ["12015551234", "14155551234", "13235551234"]

# Realistic billsec distributions (seconds)
BILLSEC_DISTRIBUTION = (
    [0]  * 5  +   # 5% unanswered
    [30] * 15 +   # 15% very short
    [65] * 20 +   # 20% first-minute-rounding edge cases
    [120] * 20 +  # 20% 2-minute calls
    [250] * 20 +  # 20% 4-minute calls
    [400] * 15 +  # 15% long calls
    [720] * 5     # 5% very long
)

SEPARATOR = "=" * 72

# ── helpers ────────────────────────────────────────────────────────────────

def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def usd(value: Any) -> str:
    return f"${Decimal(str(value)):.6f}"


def _assert(condition: bool, msg: str) -> None:
    if not condition:
        print(f"  [FAIL] X  {msg}")
    else:
        print(f"  [PASS] OK {msg}")


def print_section(title: str) -> None:
    print(f"\n{SEPARATOR}")
    print(f"  {title}")
    print(SEPARATOR)


def customer_acc(n: int) -> str:
    return f"LT{n:04d}"


def customer_id(n: int) -> str:
    return str(900000 + n)

# ──────────────────────────────────────────────────────────────────────────
# STEP 1: SEED
# ──────────────────────────────────────────────────────────────────────────

def seed(cursor, rate_card_id: str, rec_rate_card_id: int | None) -> list[dict]:
    """Create 3 test customers with wallets + rate card assignments."""

    print_section("STEP 1: SEEDING TEST CUSTOMERS, WALLETS & RATE CARD ASSIGNMENTS")

    customers = []
    for i in range(1, N_CUSTOMERS + 1):
        cid     = customer_id(i)
        acc     = customer_acc(i)
        balance = Decimal(str(round(random.uniform(5.0, 50.0), 2)))
        tfn_fm  = random.choice([0, 100, 500])
        did_fm  = random.choice([0, 100, 300])
        ob_fm   = random.choice([0, 50, 200])

        cursor.execute("""
            INSERT INTO customers (id, account_code, name, updated_at)
            VALUES (%s, %s, %s, NOW())
            ON CONFLICT (id) DO UPDATE
                SET name = EXCLUDED.name, updated_at = NOW()
        """, (cid, acc, f"Load-Test Customer {i}"))

        cursor.execute("""
            INSERT INTO customer_wallets (
                id, customer_id, currency,
                fiat_balance, tfn_free_minutes, did_free_minutes, ob_free_minutes,
                credit_limit, credit_used, version
            )
            VALUES (gen_random_uuid()::text, %s, 'USD', %s, %s, %s, %s, 10.00, 0, 1)
            ON CONFLICT (customer_id) DO UPDATE SET
                fiat_balance       = EXCLUDED.fiat_balance,
                tfn_free_minutes   = EXCLUDED.tfn_free_minutes,
                did_free_minutes   = EXCLUDED.did_free_minutes,
                ob_free_minutes    = EXCLUDED.ob_free_minutes,
                credit_used        = 0,
                version            = 1,
                updated_at         = NOW()
        """, (cid, balance, tfn_fm, did_fm, ob_fm))

        # Assign customer rate card
        cursor.execute("""
            INSERT INTO customer_rate_cards (customer_id, rate_card_id, effective_from, updated_at)
            VALUES (%s, %s, NOW() - INTERVAL '1 day', NOW())
            ON CONFLICT (customer_id) DO UPDATE SET rate_card_id = EXCLUDED.rate_card_id, effective_from = EXCLUDED.effective_from, updated_at = NOW()
        """, (cid, rate_card_id))

        # Assign recording rate card to customer 1 only
        if rec_rate_card_id and i == 1:
            cursor.execute("""
                INSERT INTO customer_rec_rc (cust_id, rec_rc_id)
                VALUES (%s, %s)
                ON CONFLICT (cust_id) DO UPDATE SET rec_rc_id = EXCLUDED.rec_rc_id
            """, (cid, rec_rate_card_id))

        customer = {
            "id": cid, "account_code": acc, "name": f"Load-Test Customer {i}",
            "initial_balance": balance, "initial_tfn_fm": tfn_fm,
            "initial_did_fm": did_fm, "initial_ob_fm": ob_fm,
            "has_recording_rc": (rec_rate_card_id is not None and i == 1),
        }
        customers.append(customer)
        print(f"  Customer {i}: id={cid}  balance={usd(balance)}  TFN={tfn_fm}m DID={did_fm}m OB={ob_fm}m  rec_rc={'YES' if customer['has_recording_rc'] else 'no'}")

    return customers


# ──────────────────────────────────────────────────────────────────────────
# STEP 2: INSERT CDRs
# ──────────────────────────────────────────────────────────────────────────

def insert_cdrs(cursor, customers: list[dict]) -> list[int]:
    """Insert 100 CDR rows spread across 3 customers."""

    print_section("STEP 2: INSERTING 100 CDR ROWS")

    cdr_ids = []
    customer_ids_list = [c["id"] for c in customers]
    recording_customer = customer_ids_list[0]  # only customer 1 has recording rc

    # Build a realistic mix:
    # ~40 OUTBOUND, ~30 INBOUND-DID, ~20 INBOUND-TFN, ~10 UNANSWERED
    scenarios = (
        [("OUTBOUND",  False)] * 40 +
        [("INBOUND",   False)] * 30 +   # DID destination
        [("INBOUND",   True)]  * 20 +   # TFN destination
        [("INBOUND",   False)] * 10     # unanswered (billsec=0)
    )
    random.shuffle(scenarios)

    cursor.execute("SELECT id FROM carriers LIMIT 1")
    carrier_row = cursor.fetchone()
    carrier_id = carrier_row["id"] if carrier_row else None

    for i, (direction, is_tfn) in enumerate(scenarios):
        cust_id = customer_ids_list[i % N_CUSTOMERS]
        billsec = random.choice(BILLSEC_DISTRIBUTION)

        if direction == "OUTBOUND":
            dest = random.choice(OUTBOUND_DESTS)
        elif is_tfn:
            dest = random.choice(TOLL_FREE_DESTS)
        else:
            dest = random.choice(DID_DESTS)

        answered  = billsec > 0
        started   = now_utc() - timedelta(seconds=random.randint(60, 3600))
        ended     = started + timedelta(seconds=billsec + 5)

        # ~30% of answered INBOUND calls from recording customer have recording
        has_rec = (
            cust_id == recording_customer
            and answered
            and random.random() < 0.30
        )

        cursor.execute("""
            INSERT INTO cdr (
                session_uuid, customer_id, carrier_id, direction,
                destination_number, caller_number,
                started_at, ended_at,
                duration_seconds, billsec, carrier_billsec,
                answered, has_recording,
                call_status, rating_status, rec_billing_status
            )
            VALUES (
                %s, %s, %s, %s,
                %s, %s,
                %s, %s,
                %s, %s, %s,
                %s, %s,
                %s, 'PENDING', 'PENDING'
            )
            RETURNING id
        """, (
            str(uuid.uuid4()), cust_id, carrier_id, direction,
            dest, "12125550000",
            started, ended,
            billsec + 5, billsec, billsec,
            answered, has_rec,
            "ANSWERED" if answered else "NO_ANSWER",
        ))
        cdr_ids.append(cursor.fetchone()["id"])

    print(f"  Inserted {len(cdr_ids)} CDRs across {N_CUSTOMERS} customers")
    print(f"  Scenarios: 40 OUTBOUND, 30 INBOUND-DID, 20 INBOUND-TFN, 10 UNANSWERED")
    return cdr_ids


# ──────────────────────────────────────────────────────────────────────────
# STEP 3: CACHE VERIFICATION
# ──────────────────────────────────────────────────────────────────────────

def verify_cache(customers: list[dict]) -> dict:
    """Refresh the cache and verify all 3 customers have a rate card mapped."""

    print_section("STEP 3: CACHE REFRESH & VERIFICATION")

    stats = refresh_cache()
    print(f"  Cache refreshed at: {stats['generatedAt']}")
    print(f"  Rate Cards loaded:         {stats['rateCards']}")
    print(f"  Customer mappings loaded:  {stats['customerMappings']}")
    print(f"  Carrier mappings loaded:   {stats['carrierMappings']}")
    print(f"  Min-billing settings:      {stats['minimumSettings']}")

    cache_reader = CacheReader()
    cache = cache_reader.get()
    customer_rate_cards = cache.get("customerRateCards", {})
    rate_cards = cache.get("rateCards", {})
    rec_rate_cards = cache.get("recRateCards", {})
    customer_rec_rc = cache.get("customerRecRc", {})

    print(f"\n  --- Rate Card Details ---")
    for rc_id, rc in rate_cards.items():
        print(f"  [{rc['type']}] id={rc_id[:8]}... name={rc['name']}  "
              f"in={rc.get('inboundRatePerMinute','?')}/min  out={rc.get('outboundRatePerMinute','?')}/min")

    print(f"\n  --- Customer -> Rate Card Assignments ---")
    for cust in customers:
        mapping = customer_rate_cards.get(cust["id"])
        rec_mapping = customer_rec_rc.get(cust["id"])
        rc_id = mapping["rateCardId"] if mapping else None
        rc = rate_cards.get(rc_id, {}) if rc_id else {}
        rec_rc = rec_rate_cards.get(str(rec_mapping["rec_rc_id"]), {}) if rec_mapping else None
        print(f"  {cust['name']} ({cust['id']}):")
        print(f"    billing_rc: {rc.get('name','NOT ASSIGNED')}  (id={str(rc_id)[:8]}...)")
        print(f"    rec_rc:     {rec_rc['name'] if rec_rc else 'NOT ASSIGNED'}")
        _assert(mapping is not None, f"Customer {cust['id']} has a rate card assigned")

    if rec_rate_cards:
        print(f"\n  --- Recording Rate Card Details ---")
        for rc_id, rc in rec_rate_cards.items():
            print(f"  id={rc_id} name={rc['name']} rate={rc['rate']}/min pulse={rc['pulse']}s days={rc['days']}")

    return cache_reader.get()


# ──────────────────────────────────────────────────────────────────────────
# STEP 4 & 5: RUN BILLING
# ──────────────────────────────────────────────────────────────────────────

def snapshot_wallets(cursor, customer_ids: list[str]) -> dict:
    cursor.execute("""
        SELECT customer_id, fiat_balance, credit_used, tfn_free_minutes,
               did_free_minutes, ob_free_minutes, version
        FROM customer_wallets
        WHERE customer_id = ANY(%s)
    """, (customer_ids,))
    return {r["customer_id"]: dict(r) for r in cursor.fetchall()}


def run_billing_pipeline(customer_ids: list[str]) -> None:
    """Run the full billing pipeline exactly as billing_worker does in production."""

    print_section("STEP 4: RUNNING NORMAL CDR BILLING (rate_batch)")

    cache_reader = CacheReader()

    # Snapshot wallet BEFORE
    with psycopg2.connect(DATABASE_DSN, cursor_factory=RealDictCursor) as conn:
        with conn.cursor() as cur:
            wallets_before = snapshot_wallets(cur, customer_ids)

    total_processed = 0
    passes = 0
    while True:
        processed = rate_batch(cache_reader)
        passes += 1
        if processed == 0:
            break
        total_processed += processed
        print(f"  Pass {passes}: rated {processed} CDRs  (total so far: {total_processed})")

    print(f"\n  Done. Total CDRs rated: {total_processed}  in {passes - 1} pass(es)")

    # ── RECORDING BILLING ───────────────────────────────────────────────
    print_section("STEP 5: RUNNING RECORDING BILLING SUB-PROCESS")
    cache = cache_reader.get()
    rec_stats = run_recording_billing(cache)
    print(f"  Customers processed:  {rec_stats['customers_processed']}")
    print(f"  Recordings billed:    {rec_stats['recordings_billed']}")
    print(f"  Total rec charged:    {usd(rec_stats['total_charged'])}")

    return wallets_before


# ──────────────────────────────────────────────────────────────────────────
# STEP 6: REPORT
# ──────────────────────────────────────────────────────────────────────────

def report(cursor, customers: list[dict], wallets_before: dict) -> None:
    """Produce a detailed per-customer report."""

    print_section("STEP 6: DETAILED BILLING REPORT")

    all_customer_ids = [c["id"] for c in customers]

    # Final wallet state
    wallets_after = snapshot_wallets(cursor, all_customer_ids)

    for cust in customers:
        cid = cust["id"]
        before = wallets_before.get(cid, {})
        after  = wallets_after.get(cid, {})

        print(f"\n{'-' * 60}")
        print(f"  [REPORT]  {cust['name']}  (id={cid})")
        print(f"{'-' * 60}")

        # Wallet summary
        b_fiat  = Decimal(str(before.get("fiat_balance", 0)))
        a_fiat  = Decimal(str(after.get("fiat_balance", 0)))
        b_cr    = Decimal(str(before.get("credit_used", 0)))
        a_cr    = Decimal(str(after.get("credit_used", 0)))
        b_tfn   = before.get("tfn_free_minutes", 0)
        a_tfn   = after.get("tfn_free_minutes", 0)
        b_did   = before.get("did_free_minutes", 0)
        a_did   = after.get("did_free_minutes", 0)
        b_ob    = before.get("ob_free_minutes", 0)
        a_ob    = after.get("ob_free_minutes", 0)

        print(f"\n  WALLET CHANGES:")
        print(f"    Fiat Balance:  {usd(b_fiat):>14}  ->  {usd(a_fiat):>14}  (deducted {usd(b_fiat - a_fiat)})")
        print(f"    Credit Used:   {usd(b_cr):>14}  ->  {usd(a_cr):>14}")
        print(f"    TFN Free Mins: {b_tfn:>4}min  ->  {a_tfn:>4}min  (used {b_tfn - a_tfn}min)")
        print(f"    DID Free Mins: {b_did:>4}min  ->  {a_did:>4}min  (used {b_did - a_did}min)")
        print(f"    OB  Free Mins: {b_ob:>4}min  ->  {a_ob:>4}min  (used {b_ob  - a_ob}min)")
        print(f"    Wallet version: {before.get('version', '?')} -> {after.get('version', '?')}")

        # Per-CDR breakdown
        cursor.execute("""
            SELECT
                c.id,
                c.direction,
                c.destination_number,
                c.billsec,
                c.rated_seconds,
                c.rate_card_id,
                c.rating_status,
                c.rating_error,
                c.has_recording,
                c.rec_billing_status,
                c.customer_charge,
                c.free_minutes_used,
                c.fiat_charged,
                t.fiat_debit_amount,
                t.credit_debit_amount,
                t.number_type,
                t.id AS tx_id,
                r.amount AS rec_amount,
                r.duration AS rec_duration
            FROM cdr c
            LEFT JOIN transactions t ON t.idempotency_key = 'cdr-' || c.session_uuid
            LEFT JOIN rec r ON r.cdr_id = c.id
            WHERE c.customer_id = %s
              AND c.session_uuid LIKE %s
            ORDER BY c.id ASC
        """, (cid, '%'))

        # Re-query without LIKE filter since session_uuid is uuid
        cursor.execute("""
            SELECT
                c.id,
                c.direction,
                c.destination_number,
                c.billsec,
                c.rated_seconds,
                c.rate_card_id,
                c.rating_status,
                c.rating_error,
                c.has_recording,
                c.rec_billing_status,
                c.customer_charge,
                c.free_minutes_used,
                c.fiat_charged,
                t.fiat_debit_amount,
                t.credit_debit_amount,
                t.number_type,
                t.id AS tx_id,
                r.amount AS rec_amount,
                r.duration AS rec_duration
            FROM cdr c
            LEFT JOIN transactions t ON t.idempotency_key = 'cdr-' || c.session_uuid
            LEFT JOIN rec r ON r.cdr_id = c.id
            WHERE c.customer_id = %s
            ORDER BY c.id ASC
        """, (cid,))

        cdrs = [dict(r) for r in cursor.fetchall()]
        total_cdrs = len(cdrs)
        rated_ok   = sum(1 for c in cdrs if c["rating_status"] == "RATED")
        errors     = sum(1 for c in cdrs if c["rating_status"] == "ERROR")
        no_tx      = sum(1 for c in cdrs if c["rating_status"] == "RATED" and c["tx_id"] is None)
        has_rec    = sum(1 for c in cdrs if c["has_recording"])
        rec_billed = sum(1 for c in cdrs if c["rec_billing_status"] == "BILLED")

        print(f"\n  CDR SUMMARY: total={total_cdrs}  rated={rated_ok}  errors={errors}")
        print(f"               no-tx (free/unanswered): {no_tx}")
        print(f"               has_recording={has_rec}  rec_billed={rec_billed}")

        print(f"\n  {'ID':>6}  {'DIR':>8}  {'SEC':>4}  {'RATED':>5}  {'FM_USED':>7}  "
              f"{'FIAT':>11}  {'CR':>11}  {'STATUS':>8}  {'REC':>5}  {'REC_AMT':>10}")
        print(f"  {'-'*6}  {'-'*8}  {'-'*4}  {'-'*5}  {'-'*7}  "
              f"{'-'*11}  {'-'*11}  {'-'*8}  {'-'*5}  {'-'*10}")

        for c in cdrs:
            fiat_d = Decimal(str(c["fiat_debit_amount"] or 0))
            cr_d   = Decimal(str(c["credit_debit_amount"] or 0))
            rec_a  = Decimal(str(c["rec_amount"] or 0))
            direction_short = c["direction"][:2] if c["direction"] else "??"
            rec_status = "Y" if c["rec_billing_status"] == "BILLED" else ("-" if not c["has_recording"] else "skip")
            print(f"  {c['id']:>6}  {direction_short:>8}  {c['billsec']:>4}  "
                  f"{(c['rated_seconds'] or 0):>5}  {(c['free_minutes_used'] or 0):>7}  "
                  f"${fiat_d:>10.6f}  ${cr_d:>10.6f}  {c['rating_status']:>8}  "
                  f"{rec_status:>5}  ${rec_a:>9.6f}")
            if c["rating_error"]:
                print(f"         ERROR: {c['rating_error'][:80]}")

        # Transaction rollup
        cursor.execute("""
            SELECT
                number_type,
                COUNT(*) AS tx_count,
                SUM(fiat_debit_amount) AS total_fiat,
                SUM(credit_debit_amount) AS total_credit,
                SUM(free_minutes_used) AS total_fm,
                SUM(rated_seconds) AS total_secs
            FROM transactions
            WHERE customer_id = %s AND source_type = 'cdr'
            GROUP BY number_type
            ORDER BY number_type
        """, (cid,))
        tx_summary = cursor.fetchall()

        print(f"\n  TRANSACTION ROLL-UP (by bucket/number_type):")
        print(f"  {'TYPE':>6}  {'COUNT':>5}  {'TOTAL_FIAT':>12}  {'TOTAL_CREDIT':>12}  {'FM_USED':>7}  {'RATED_SECS':>10}")
        print(f"  {'-'*6}  {'-'*5}  {'-'*12}  {'-'*12}  {'-'*7}  {'-'*10}")
        grand_fiat   = Decimal(0)
        grand_credit = Decimal(0)
        for t in tx_summary:
            tf = Decimal(str(t["total_fiat"] or 0))
            tc = Decimal(str(t["total_credit"] or 0))
            grand_fiat   += tf
            grand_credit += tc
            print(f"  {str(t['number_type'] or '?'):>6}  {t['tx_count']:>5}  ${tf:>11.6f}  ${tc:>11.6f}  "
                  f"{(t['total_fm'] or 0):>7}  {(t['total_secs'] or 0):>10}")
        print(f"  {'TOTAL':>6}  {'':>5}  ${grand_fiat:>11.6f}  ${grand_credit:>11.6f}")

        # Assertions
        print(f"\n  ASSERTIONS:")
        _assert(rated_ok == total_cdrs, f"All {total_cdrs} CDRs are RATED (got {rated_ok})")
        _assert(errors == 0, "Zero rating errors")

        # Wallet math check
        expected_deducted = (grand_fiat + grand_credit)
        actual_fiat_loss  = b_fiat - a_fiat
        actual_credit_gain = a_cr - b_cr
        _assert(
            abs((actual_fiat_loss + actual_credit_gain) - expected_deducted) < Decimal("0.01"),
            f"Wallet deduction {usd(actual_fiat_loss + actual_credit_gain)} ~= transaction total {usd(expected_deducted)}"
        )


# ──────────────────────────────────────────────────────────────────────────
# CLEANUP
# ──────────────────────────────────────────────────────────────────────────

def cleanup(cursor, customer_ids: list[str]) -> None:
    """Remove only the load-test rows."""
    print_section("STEP 7: CLEANUP")
    print("  Removing CDRs, transactions, rec rows, wallets and test customers...")

    # Get CDR IDs for rec cleanup
    cursor.execute("SELECT id FROM cdr WHERE customer_id = ANY(%s)", (customer_ids,))
    cdr_ids = [r["id"] for r in cursor.fetchall()]

    if cdr_ids:
        cursor.execute("DELETE FROM rec WHERE cdr_id = ANY(%s)", (cdr_ids,))

    cursor.execute("DELETE FROM transactions WHERE customer_id = ANY(%s)", (customer_ids,))
    cursor.execute("DELETE FROM cdr WHERE customer_id = ANY(%s)", (customer_ids,))
    cursor.execute("DELETE FROM customer_rec_rc WHERE cust_id = ANY(%s)", (customer_ids,))
    cursor.execute("DELETE FROM customer_rate_cards WHERE customer_id = ANY(%s)", (customer_ids,))
    cursor.execute("DELETE FROM customer_wallets WHERE customer_id = ANY(%s)", (customer_ids,))
    cursor.execute("DELETE FROM customers WHERE id = ANY(%s)", (customer_ids,))
    print("  Cleanup complete.")


# ──────────────────────────────────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────────────────────────────────

def main() -> None:
    skip_cleanup = "--no-cleanup" in sys.argv

    # ── Look up real rate cards ────────────────────────────────────────
    with psycopg2.connect(DATABASE_DSN, cursor_factory=RealDictCursor) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name, type FROM rate_cards WHERE is_active = TRUE AND type = 'CUSTOMER' LIMIT 1")
            rc = cur.fetchone()
            if not rc:
                print("ERROR: No active CUSTOMER rate card found! Please create one first.")
                sys.exit(1)
            CUSTOMER_RATE_CARD_ID = rc["id"]
            print(f"\nFound real CUSTOMER rate card: '{rc['name']}' (id={CUSTOMER_RATE_CARD_ID[:8]}...)")

            cur.execute("SELECT id, name FROM rec_rate_card WHERE active_is = 'Y' LIMIT 1")
            rec_rc = cur.fetchone()
            REC_RATE_CARD_ID = rec_rc["id"] if rec_rc else None
            if rec_rc:
                print(f"Found real RECORDING rate card: '{rec_rc['name']}' (id={rec_rc['id']})")
            else:
                print("No recording rate card found – will create one for the test")
                cur.execute("""
                    INSERT INTO rec_rate_card (name, days, rate, pulse, active_is)
                    VALUES ('Load-Test-Rec-RC', 30, 0.05, 60, 'Y')
                    RETURNING id
                """)
                REC_RATE_CARD_ID = cur.fetchone()["id"]
                print(f"  Created recording rate card id={REC_RATE_CARD_ID}")

            # ── Seed ──────────────────────────────────────────────────
            customers = seed(cur, CUSTOMER_RATE_CARD_ID, REC_RATE_CARD_ID)
            
    # ── Cache ─────────────────────────────────────────────────────────
    # We must refresh the cache AFTER seeding but BEFORE inserting CDRs,
    # otherwise background PM2 workers might grab the CDRs with stale cache!
    cache = verify_cache(customers)

    # ── Insert CDRs ───────────────────────────────────────────────────
    with psycopg2.connect(DATABASE_DSN, cursor_factory=RealDictCursor) as conn:
        with conn.cursor() as cur:
            cdr_ids = insert_cdrs(cur, customers)

    # ── Billing ───────────────────────────────────────────────────────
    wallets_before = run_billing_pipeline([c["id"] for c in customers])

    # ── Report ────────────────────────────────────────────────────────
    with psycopg2.connect(DATABASE_DSN, cursor_factory=RealDictCursor) as conn:
        with conn.cursor() as cur:
            report(cur, customers, wallets_before)

    # ── Cleanup ───────────────────────────────────────────────────────
    if skip_cleanup:
        print(f"\n  [--no-cleanup]: Leaving test data in DB for inspection.")
        print(f"  Customer IDs: {[c['id'] for c in customers]}")
    else:
        with psycopg2.connect(DATABASE_DSN, cursor_factory=RealDictCursor) as conn:
            with conn.cursor() as cur:
                cleanup(cur, [c["id"] for c in customers])

    print(f"\n{SEPARATOR}")
    print(f"  LOAD TEST COMPLETE")
    print(SEPARATOR)
    print(f"""
  Run flags:
    --no-cleanup   Keep test data in DB after the run for manual inspection

  Manual inspection queries:
    SELECT * FROM cdr WHERE customer_id IN ('900001','900002','900003') LIMIT 10;
    SELECT * FROM transactions WHERE customer_id IN ('900001','900002','900003');
    SELECT * FROM rec WHERE cust_id IN ('900001','900002','900003');
    SELECT * FROM customer_wallets WHERE customer_id IN ('900001','900002','900003');
""")


if __name__ == "__main__":
    main()
