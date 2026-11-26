"""Low-cost, setup-only wallet admission for FreeSWITCH calls.

PostgreSQL remains the wallet ledger. Redis only holds the first rated block
of calls that have started but have not yet been settled by the CDR worker.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from functools import lru_cache

import redis


@dataclass(frozen=True)
class AdmissionResult:
    allowed: bool
    reason: str | None = None


# A single Lua operation serializes competing calls from the same customer.
# Values are first-block reservations only; final rating remains in PostgreSQL.
ADMIT_SCRIPT = """
local key, session = KEYS[1], ARGV[1]
local now, expires = tonumber(ARGV[2]), tonumber(ARGV[3])
local did_available, ob_available, money_available =
    tonumber(ARGV[4]), tonumber(ARGV[5]), tonumber(ARGV[6])
local initial_seconds, rate_micros, direction =
    tonumber(ARGV[7]), tonumber(ARGV[8]), ARGV[9]
local existing = redis.call('HGET', key, session)
if existing then return 1 end
local held_did, held_ob, held_money = 0, 0, 0
local entries = redis.call('HGETALL', key)
for i = 1, #entries, 2 do
    local hold = cjson.decode(entries[i + 1])
    if hold[1] <= now then
        redis.call('HDEL', key, entries[i])
    else
        held_did = held_did + hold[2]
        held_ob = held_ob + hold[3]
        held_money = held_money + hold[4]
    end
end
local free_available = direction == 'INBOUND' and
    math.max(0, did_available - held_did) or math.max(0, ob_available - held_ob)
local free_needed = math.min(math.floor((initial_seconds + 59) / 60), free_available)
local did_needed = direction == 'INBOUND' and free_needed or 0
local ob_needed = direction == 'OUTBOUND' and free_needed or 0
local remaining_seconds = math.max(0, initial_seconds - free_needed * 60)
local money_needed = math.floor(rate_micros * remaining_seconds / 60 + 0.5)
if held_money + money_needed > money_available then
    return 0
end
redis.call('HSET', key, session, cjson.encode({expires, did_needed, ob_needed, money_needed}))
redis.call('EXPIRE', key, tonumber(ARGV[10]))
return 1
"""


def _micros(amount: Decimal) -> int:
    return int((amount * 1_000_000).to_integral_value(rounding=ROUND_HALF_UP))


@lru_cache(maxsize=1)
def _redis_client():
    return redis.Redis.from_url(
        os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0"),
        socket_connect_timeout=0.2, socket_timeout=0.2,
    )


def admit(pool, customer_id: str, number_id: str | None, carrier_id: str,
          direction: str, session: str) -> AdmissionResult:
    """Reserve the first billable block, or refuse the call before its bridge.

    The wallet row is share-locked until Redis accepts the hold. Rating takes
    an exclusive lock on the same row, preventing a stale wallet snapshot from
    racing with the release of a previously rated call's hold.
    """
    if direction not in ("INBOUND", "OUTBOUND"):
        return AdmissionResult(False, "BILLING_CONFIGURATION_ERROR")
    hold_seconds = int(os.getenv("BILLING_ADMISSION_HOLD_SECONDS", str(7 * 86400)))
    if hold_seconds <= 0:
        raise ValueError("BILLING_ADMISSION_HOLD_SECONDS must be positive")
    connection = pool.getconn()
    try:
        with connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT w.fiat_balance, w.credit_limit, w.credit_used,
                           w.did_free_minutes, w.ob_free_minutes, w.is_suspended,
                           rc.currency, rc.inbound_rate_per_minute,
                           rc.outbound_rate_per_minute,
                           COALESCE(ms.initial_increment_seconds,
                                    rc.inbound_initial_increment_seconds),
                           COALESCE(ms.initial_increment_seconds,
                                    rc.outbound_initial_increment_seconds),
                           w.currency,
                           EXISTS (
                             SELECT 1 FROM carrier_rate_cards AS crm
                             JOIN rate_cards AS vendor_card
                               ON vendor_card.id = crm.rate_card_id
                              AND vendor_card.is_active = TRUE
                              AND vendor_card.type = 'VENDOR'
                             WHERE crm.carrier_id = %s
                               AND crm.effective_from <= NOW()
                               AND (crm.effective_to IS NULL OR crm.effective_to > NOW())
                           )
                    FROM customer_wallets AS w
                    LEFT JOIN customer_rate_cards AS mapping
                      ON mapping.customer_id = w.customer_id
                     AND mapping.effective_from <= NOW()
                     AND (mapping.effective_to IS NULL OR mapping.effective_to > NOW())
                    LEFT JOIN number_settings AS ns
                      ON ns.customer_id = w.customer_id
                     AND ns.customer_number_id = %s
                    LEFT JOIN rate_cards AS rc
                      ON rc.id = COALESCE(ns.provider_rate_card_id, mapping.rate_card_id)
                     AND rc.is_active = TRUE AND rc.type = 'CUSTOMER'
                    LEFT JOIN customer_minimum_billing AS cm
                      ON cm.customer_id = w.customer_id
                    LEFT JOIN minimum_billing_settings AS ms
                      ON ms.id = cm.setting_id AND ms.is_active = TRUE
                     AND ms.party = 'CUSTOMER'
                    WHERE w.customer_id = %s
                    FOR SHARE OF w
                    """,
                    (carrier_id, number_id if direction == "INBOUND" else None, customer_id),
                )
                row = cursor.fetchone()
                if not row:
                    return AdmissionResult(False, "WALLET_NOT_FOUND")
                if row[5]:
                    return AdmissionResult(False, "ACCOUNT_SUSPENDED")
                if not row[6]:
                    return AdmissionResult(False, "RATE_CARD_MISSING")
                if row[6] != row[11]:
                    return AdmissionResult(False, "BILLING_CURRENCY_MISMATCH")
                if not row[12]:
                    return AdmissionResult(False, "CARRIER_RATE_CARD_MISSING")
                rate = Decimal(str(row[7] if direction == "INBOUND" else row[8]))
                initial_seconds = int(row[9] if direction == "INBOUND" else row[10])
                if rate < 0 or initial_seconds <= 0:
                    return AdmissionResult(False, "BILLING_CONFIGURATION_ERROR")
                available_money = max(
                    Decimal(0),
                    Decimal(str(row[0])) + Decimal(str(row[1])) - Decimal(str(row[2])),
                )
                now = int(time.time())
                allowed = bool(
                    _redis_client().eval(
                        ADMIT_SCRIPT,
                        1,
                        f"billing:admission:{customer_id}",
                        session,
                        now,
                        now + hold_seconds,
                        max(0, int(row[3])),
                        max(0, int(row[4])),
                        _micros(available_money),
                        initial_seconds,
                        _micros(rate),
                        direction,
                        hold_seconds,
                    )
                )
                return AdmissionResult(allowed, None if allowed else "INSUFFICIENT_BALANCE")
    finally:
        pool.putconn(connection)
