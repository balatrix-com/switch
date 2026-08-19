#!/usr/bin/env python3
"""Copy active billing-switch source_ip_auth rows into Kamailio's address table.

Run this after creating/removing a carrier or customer source identity, then
reload Kamailio permissions with: kamcmd permissions.addressReload
"""

from __future__ import annotations

import os
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import psycopg2


def load_env_file() -> None:
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if not os.path.isfile(env_path):
        return
    with open(env_path, encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            if key and key.replace("_", "").isalnum():
                os.environ.setdefault(key, value.strip().strip('"').strip("'"))


def dsn(value: str) -> str:
    parsed = urlparse(value)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.pop("schema", None)
    return urlunparse(parsed._replace(query=urlencode(query)))


def main() -> None:
    load_env_file()
    billing_url = os.environ["DATABASE_URL"]
    kamailio_url = os.environ["KAMAILIO_DATABASE_URL"]

    with psycopg2.connect(dsn(billing_url)) as billing, psycopg2.connect(
        dsn(kamailio_url)
    ) as kamailio:
        with billing.cursor() as source, kamailio.cursor() as target:
            source.execute(
                """
                SELECT source.id, source.source_type, source.ip_address, source.port,
                       COALESCE(customer.account_code, carrier.code, source.id::text)
                FROM source_ip_auth AS source
                LEFT JOIN customers AS customer ON customer.id = source.customer_id
                LEFT JOIN carriers AS carrier ON carrier.id = source.carrier_id
                WHERE source.is_active = TRUE
                  AND ((source.source_type = 'CUSTOMER' AND customer.is_active = TRUE)
                    OR (source.source_type = 'CARRIER' AND carrier.is_active = TRUE))
                """
            )
            rows = source.fetchall()
            for source_id, source_type, ip_address, port, label in rows:
                group = 1 if source_type == "CARRIER" else 2
                tag = f"billing-switch:{source_id}:{label}"
                target.execute(
                    """
                    INSERT INTO address (grp, ip_addr, mask, port, tag)
                    SELECT %s, %s, 32, %s, %s
                    WHERE NOT EXISTS (
                      SELECT 1 FROM address
                      WHERE grp = %s AND ip_addr = %s AND port = %s AND tag = %s
                    )
                    """,
                    (group, ip_address, port, tag, group, ip_address, port, tag),
                )
        kamailio.commit()
    print(f"Synchronized {len(rows)} active source identities. Reload permissions next.")


if __name__ == "__main__":
    main()
