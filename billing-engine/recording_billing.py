"""Recording billing sub-process.

Called by billing_worker.py AFTER each main CDR billing batch completes.
"""

from __future__ import annotations

import logging
from decimal import Decimal
from datetime import timedelta, datetime
import psycopg2
from psycopg2.extras import RealDictCursor, execute_values
from config import DATABASE_DSN

LOGGER = logging.getLogger(__name__)

def billed_seconds(duration_sec: int, initial_increment: int, increment: int) -> int:
    if duration_sec <= 0:
        return 0
    if duration_sec <= initial_increment:
        return initial_increment
    overage = duration_sec - initial_increment
    full_increments = (overage + increment - 1) // increment
    return initial_increment + (full_increments * increment)

def run_recording_billing(cache: dict) -> dict:
    """Run one batch of recording billing."""
    with psycopg2.connect(DATABASE_DSN, cursor_factory=RealDictCursor) as connection:
        with connection.cursor() as cursor:
            # 1. Check MAX(cdr_id) from rec table
            cursor.execute("SELECT COALESCE(MAX(cdr_id), 0) AS max_cdr_id FROM rec")
            last_cdr_id = cursor.fetchone()["max_cdr_id"]
            
            # 2. Fetch new RATED CDRs with recordings
            cursor.execute(
                """
                SELECT id, customer_id, session_uuid, billsec, duration_seconds,
                       started_at, has_recording
                FROM cdr
                WHERE id > %s
                  AND rating_status = 'RATED'
                  AND has_recording = TRUE
                ORDER BY customer_id ASC, id ASC
                LIMIT 500
                FOR UPDATE SKIP LOCKED
                """,
                (last_cdr_id,)
            )
            rows = [dict(r) for r in cursor.fetchall()]
            if not rows:
                return {"customers_processed": 0, "recordings_billed": 0, "total_charged": Decimal(0)}
            
            # 3. Group by customer
            grouped = {}
            for cdr in rows:
                cust_id = cdr["customer_id"]
                if cust_id not in grouped:
                    grouped[cust_id] = []
                grouped[cust_id].append(cdr)
            
            customer_ids = list(grouped.keys())
            
            # 4. Lock wallets for these customers
            cursor.execute(
                """
                SELECT customer_id, fiat_balance, credit_limit, credit_used, currency, version
                FROM customer_wallets
                WHERE customer_id = ANY(%s)
                ORDER BY customer_id
                FOR UPDATE
                """,
                (customer_ids,)
            )
            wallets = {r["customer_id"]: dict(r) for r in cursor.fetchall()}
            
            rec_rate_cards = cache.get("recRateCards", {})
            customer_rec_rc = cache.get("customerRecRc", {})
            
            transactions_to_insert = []
            rec_rows_to_insert = []
            wallet_updates = {}
            cdrs_to_update = []
            total_charged_overall = Decimal(0)
            customers_processed = 0
            
            # 5. Process each customer
            for cust_id in customer_ids:
                cdrs = grouped[cust_id]
                mapping = customer_rec_rc.get(cust_id)
                wallet = wallets.get(cust_id)
                
                # If no wallet or mapping, mark SKIPPED
                if not mapping or not wallet:
                    for cdr in cdrs:
                        cdrs_to_update.append((cdr["id"], "SKIPPED"))
                    continue
                
                rate_card = rec_rate_cards.get(str(mapping["rec_rc_id"]))
                if not rate_card or rate_card.get("activeIs", "Y") != "Y":
                    for cdr in cdrs:
                        cdrs_to_update.append((cdr["id"], "SKIPPED"))
                    continue
                
                total_charge = Decimal(0)
                pulse = rate_card.get("pulse", 60)
                rate = Decimal(str(rate_card.get("rate", 0)))
                
                # Calculate charges for this customer's recordings
                customer_rec_rows = []
                for cdr in cdrs:
                    duration = int(cdr.get("billsec", 0))
                    billed_sec = billed_seconds(duration, pulse, pulse)
                    
                    # Rate is per minute (60s)
                    rate_per_sec = rate / Decimal(60)
                    amount = (Decimal(billed_sec) * rate_per_sec).quantize(Decimal("0.000001"))
                    
                    started_at = cdr.get("started_at") or datetime.utcnow()
                    expiry_date = (started_at + timedelta(days=rate_card.get("days", 30))).date()
                    
                    customer_rec_rows.append({
                        "cdr_id": cdr["id"],
                        "rec_rc_id": rate_card["id"],
                        "cust_id": cust_id,
                        "rec_file_info": f"{cust_id}/{cdr['session_uuid']}.mp3",
                        "duration": duration,
                        "expiry": expiry_date,
                        "amount": amount
                    })
                    total_charge += amount
                
                # If no charge, just mark BILLED and move on
                if total_charge == 0:
                    for cdr in cdrs:
                        cdrs_to_update.append((cdr["id"], "BILLED"))
                    # Still insert rec rows for 0 amount
                    for row in customer_rec_rows:
                        rec_rows_to_insert.append((
                            row["cdr_id"], row["rec_rc_id"], row["cust_id"], row["rec_file_info"],
                            row["duration"], row["expiry"], row["amount"], None  # tx_id is None
                        ))
                    continue
                
                customers_processed += 1
                total_charged_overall += total_charge
                
                # Wallet debit
                fiat = Decimal(str(wallet["fiat_balance"]))
                credit_used = Decimal(str(wallet["credit_used"]))
                
                if fiat >= total_charge:
                    wallet["fiat_balance"] = fiat - total_charge
                    fiat_debit = total_charge
                    credit_debit = Decimal(0)
                else:
                    fiat_debit = fiat
                    remaining = total_charge - fiat
                    wallet["fiat_balance"] = Decimal(0)
                    wallet["credit_used"] = credit_used + remaining
                    credit_debit = remaining
                
                balance_after = wallet["fiat_balance"]
                wallet_updates[cust_id] = wallet
                
                # Transaction preparation
                tx_kwargs = {
                    "customer_id": cust_id,
                    "source_type": "recording",
                    "idempotency_key": f"rec-{cdrs[-1]['id']}-{cust_id}",
                    "fiat_debit": fiat_debit + credit_debit,
                    "credit_debit": credit_debit,
                    "balance_after": balance_after,
                    "notes": f"Recording billing for {len(cdrs)} calls",
                    "cdrs": cdrs,
                    "rec_rows": customer_rec_rows
                }
                transactions_to_insert.append(tx_kwargs)
            
            # 6. Database Inserts/Updates
            
            # Update skipped/0-amount CDRs
            if cdrs_to_update:
                execute_values(
                    cursor,
                    "UPDATE cdr SET rec_billing_status = data.status FROM (VALUES %s) AS data(id, status) WHERE cdr.id = data.id",
                    cdrs_to_update
                )
            
            # Insert transactions and retrieve their IDs to update rec rows
            for tx in transactions_to_insert:
                cursor.execute(
                    """
                    INSERT INTO transactions (
                        customer_id, source_type, idempotency_key,
                        fiat_debit_amount, credit_debit_amount, balance_after, notes
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (idempotency_key) DO UPDATE SET notes = EXCLUDED.notes
                    RETURNING id
                    """,
                    (
                        tx["customer_id"], tx["source_type"], tx["idempotency_key"],
                        tx["fiat_debit"], tx["credit_debit"], tx["balance_after"], tx["notes"]
                    )
                )
                result = cursor.fetchone()
                if not result:
                    continue
                tx_id = result["id"]
                
                # Insert rec rows for this transaction
                tx_rec_rows = [
                    (
                        r["cdr_id"], r["rec_rc_id"], r["cust_id"], r["rec_file_info"],
                        r["duration"], r["expiry"], r["amount"], tx_id
                    ) for r in tx["rec_rows"]
                ]
                execute_values(
                    cursor,
                    """
                    INSERT INTO rec (
                        cdr_id, rec_rc_id, cust_id, rec_file_info,
                        duration, expiry, amount, tx_id
                    ) VALUES %s
                    """,
                    tx_rec_rows
                )
                
                # Mark these CDRs as BILLED
                billed_cdr_ids = [(c["id"], "BILLED") for c in tx["cdrs"]]
                execute_values(
                    cursor,
                    "UPDATE cdr SET rec_billing_status = data.status FROM (VALUES %s) AS data(id, status) WHERE cdr.id = data.id",
                    billed_cdr_ids
                )
            
            # Insert 0-amount rec rows (no transaction)
            if rec_rows_to_insert:
                execute_values(
                    cursor,
                    """
                    INSERT INTO rec (
                        cdr_id, rec_rc_id, cust_id, rec_file_info,
                        duration, expiry, amount, tx_id
                    ) VALUES %s
                    """,
                    rec_rows_to_insert
                )
            
            # Update Wallets
            for cust_id, w in wallet_updates.items():
                cursor.execute(
                    """
                    UPDATE customer_wallets SET
                        fiat_balance = %s,
                        credit_used = %s,
                        version = version + 1,
                        updated_at = NOW()
                    WHERE customer_id = %s
                    """,
                    (w["fiat_balance"], w["credit_used"], cust_id)
                )
            
            return {
                "customers_processed": customers_processed,
                "recordings_billed": len(rows),
                "total_charged": total_charged_overall
            }
