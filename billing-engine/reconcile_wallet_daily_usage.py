"""Recheck yesterday's wallet usage totals without blocking live billing.

Run once daily, separately from the rating worker. Each customer/day row is
locked only while its source transactions are checked, so other customers can
continue settling calls.
"""

from __future__ import annotations

import argparse
from contextlib import closing
from datetime import date, datetime, time, timedelta, timezone

import psycopg2

from config import DATABASE_DSN


def reconcile_day(usage_date: date) -> int:
    start = datetime.combine(usage_date, time.min, timezone.utc)
    end = start + timedelta(days=1)
    with closing(psycopg2.connect(DATABASE_DSN)) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """SELECT customer_id, currency FROM wallet_daily_usage
                   WHERE usage_date = %s ORDER BY customer_id, currency""",
                (usage_date,),
            )
            keys = cursor.fetchall()
        connection.commit()

        for customer_id, currency in keys:
            with connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """SELECT 1 FROM wallet_daily_usage
                           WHERE customer_id = %s AND usage_date = %s AND currency = %s
                           FOR UPDATE""",
                        (customer_id, usage_date, currency),
                    )
                    if cursor.fetchone() is None:
                        continue
                    cursor.execute(
                        """
                        SELECT
                            COUNT(*) FILTER (WHERE source_type = 'cdr'),
                            COUNT(*) FILTER (WHERE source_type = 'recording'),
                            COALESCE(SUM(free_minutes_used) FILTER (WHERE source_type = 'cdr'), 0),
                            COALESCE(SUM(fiat_debit_amount) FILTER (WHERE source_type = 'cdr'), 0),
                            COALESCE(SUM(fiat_debit_amount) FILTER (WHERE source_type = 'recording'), 0)
                        FROM transactions
                        WHERE customer_id = %s AND currency = %s
                          AND created_at >= %s AND created_at < %s
                          AND status = 'posted'
                          AND source_type IN ('cdr', 'recording')
                        """,
                        (customer_id, currency, start, end),
                    )
                    totals = cursor.fetchone()
                    cursor.execute(
                        """
                        UPDATE wallet_daily_usage SET
                            call_count = %s, recording_batches = %s,
                            free_minutes_used = %s, call_charge = %s,
                            recording_charge = %s, updated_at = NOW()
                        WHERE customer_id = %s AND usage_date = %s AND currency = %s
                        """,
                        (*totals, customer_id, usage_date, currency),
                    )
    return len(keys)


def main() -> None:
    parser = argparse.ArgumentParser(description="Reconcile one UTC wallet usage day")
    parser.add_argument("--date", help="UTC day in YYYY-MM-DD; default is yesterday")
    args = parser.parse_args()
    target = date.fromisoformat(args.date) if args.date else datetime.now(timezone.utc).date() - timedelta(days=1)
    print(f"Reconciled {reconcile_day(target)} wallet usage bucket(s) for {target.isoformat()} UTC")


if __name__ == "__main__":
    main()
