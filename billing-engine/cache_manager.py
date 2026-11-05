"""Build and atomically persist the runtime billing cache from PostgreSQL."""

from __future__ import annotations

import json
import os
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

import psycopg2
from psycopg2.extras import RealDictCursor

from config import CACHE_PATH, DATABASE_DSN


def _json(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    raise TypeError(f"Unsupported cache value: {type(value)!r}")


def _camel(row: dict[str, Any]) -> dict[str, Any]:
    aliases = {
        "rate_card_id": "rateCardId",
        "rate_per_minute": "ratePerMinute",
        "effective_from": "effectiveFrom",
        "effective_to": "effectiveTo",
        "is_active": "isActive",
        "customer_id": "customerId",
        "carrier_id": "carrierId",
        "customer_number_id": "customerNumberId",
        "provider_rate_card_id": "providerRateCardId",
        "setting_id": "settingId",
        "initial_increment_seconds": "initialIncrementSeconds",
        "increment_seconds": "incrementSeconds",
        "inbound_rate_per_minute": "inboundRatePerMinute",
        "inbound_initial_increment_seconds": "inboundInitialIncrementSeconds",
        "inbound_increment_seconds": "inboundIncrementSeconds",
        "outbound_rate_per_minute": "outboundRatePerMinute",
        "outbound_initial_increment_seconds": "outboundInitialIncrementSeconds",
        "outbound_increment_seconds": "outboundIncrementSeconds",
        "active_is": "activeIs",
    }
    return {aliases.get(key, key): value for key, value in row.items()}


def refresh_cache(path: Path = CACHE_PATH) -> dict[str, Any]:
    with psycopg2.connect(DATABASE_DSN, cursor_factory=RealDictCursor) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT id, name, type::text, currency, description, '
                'inbound_rate_per_minute, inbound_initial_increment_seconds, inbound_increment_seconds, '
                'outbound_rate_per_minute, outbound_initial_increment_seconds, outbound_increment_seconds, '
                'version, is_active FROM rate_cards'
            )
            cards = {_row["id"]: _camel(dict(_row)) for _row in cursor.fetchall()}

            cursor.execute(
                'SELECT customer_id, rate_card_id, effective_from, effective_to FROM customer_rate_cards'
            )
            customer_cards = {
                row["customer_id"]: _camel(dict(row)) for row in cursor.fetchall()
            }
            cursor.execute(
                'SELECT customer_number_id, customer_id, provider_rate_card_id '
                'FROM number_settings WHERE provider_rate_card_id IS NOT NULL'
            )
            number_cards = {
                row["customer_number_id"]: _camel(dict(row)) for row in cursor.fetchall()
            }
            cursor.execute(
                'SELECT carrier_id, rate_card_id, effective_from, effective_to FROM carrier_rate_cards'
            )
            carrier_cards = {
                row["carrier_id"]: _camel(dict(row)) for row in cursor.fetchall()
            }
            cursor.execute(
                'SELECT id, name, party::text, initial_increment_seconds, increment_seconds, '
                'description, is_active FROM minimum_billing_settings'
            )
            minimum_settings = {
                row["id"]: _camel(dict(row)) for row in cursor.fetchall()
            }
            cursor.execute('SELECT customer_id, setting_id FROM customer_minimum_billing')
            customer_minimum = {
                row["customer_id"]: _camel(dict(row)) for row in cursor.fetchall()
            }
            cursor.execute('SELECT carrier_id, setting_id FROM carrier_minimum_billing')
            carrier_minimum = {
                row["carrier_id"]: _camel(dict(row)) for row in cursor.fetchall()
            }
            cursor.execute(
                "SELECT id, name, days, rate, pulse, active_is "
                "FROM rec_rate_card WHERE active_is = 'Y'"
            )
            rec_rate_cards = {str(row["id"]): _camel(dict(row)) for row in cursor.fetchall()}

            cursor.execute(
                "SELECT cust_id, rec_rc_id FROM customer_rec_rc"
            )
            customer_rec_rc = {
                row["cust_id"]: _camel(dict(row)) for row in cursor.fetchall()
            }

    payload = {
        "generatedAt": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "rateCards": cards,
        "customerRateCards": customer_cards,
        "numberRateCards": number_cards,
        "carrierRateCards": carrier_cards,
        "minimumSettings": minimum_settings,
        "customerMinimum": customer_minimum,
        "carrierMinimum": carrier_minimum,
        "recRateCards": rec_rate_cards,
        "customerRecRc": customer_rec_rc,
    }

    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + f".{os.getpid()}.tmp")
    temporary.write_text(json.dumps(payload, default=_json, indent=2), encoding="utf-8")
    os.replace(temporary, path)
    return {
        "generatedAt": payload["generatedAt"],
        "rateCards": len(cards),
        "customerMappings": len(customer_cards),
        "numberMappings": len(number_cards),
        "carrierMappings": len(carrier_cards),
        "minimumSettings": len(minimum_settings),
    }


class CacheReader:
    def __init__(self, path: Path = CACHE_PATH):
        self.path = path
        self._mtime = -1.0
        self._data: dict[str, Any] | None = None

    def get(self) -> dict[str, Any]:
        if not self.path.exists():
            refresh_cache(self.path)
        mtime = self.path.stat().st_mtime
        if self._data is None or mtime != self._mtime:
            self._data = json.loads(self.path.read_text(encoding="utf-8"))
            self._mtime = mtime
        return self._data
