"""Pure rating logic, adapted from the existing white-label billing engine."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from math import ceil
from typing import Any

MONEY_QUANTUM = Decimal("0.000001")


class RatingError(ValueError):
    pass


def billed_seconds(actual_seconds: int, initial_increment: int, increment: int) -> int:
    """Apply an initial block and then round the remainder to the next pulse."""
    actual = max(0, int(actual_seconds))
    initial = max(1, int(initial_increment))
    subsequent = max(1, int(increment))
    if actual == 0:
        return 0
    if actual <= initial:
        return initial
    return initial + ceil((actual - initial) / subsequent) * subsequent


def calculate_charge(rate_per_minute: str | Decimal, seconds: int) -> Decimal:
    rate = Decimal(str(rate_per_minute))
    return ((rate / Decimal(60)) * Decimal(seconds)).quantize(
        MONEY_QUANTUM, rounding=ROUND_HALF_UP
    )


def _active(item: dict[str, Any], at: datetime) -> bool:
    def parse(value: str | None) -> datetime | None:
        if not value:
            return None
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)

    start = parse(item.get("effectiveFrom"))
    end = parse(item.get("effectiveTo"))
    return (start is None or start <= at) and (end is None or end > at)


def effective_mapping(mapping: dict[str, Any] | None, at: datetime) -> bool:
    return bool(mapping and _active(mapping, at))


def resolve_minimum(
    cache: dict[str, Any],
    party: str,
    owner_id: str,
    rate_card: dict[str, Any],
    direction: str,
    default_initial: int,
    default_increment: int,
) -> dict[str, Any]:
    mapping_key = "customerMinimum" if party == "CUSTOMER" else "carrierMinimum"
    mapping = cache.get(mapping_key, {}).get(owner_id)
    setting_id = mapping.get("settingId") if mapping else None
    setting = cache.get("minimumSettings", {}).get(setting_id) if setting_id else None
    if setting and setting.get("isActive", True) and setting.get("party") == party:
        return setting
    direction_key = "inbound" if direction == "INBOUND" else "outbound"
    return {
        "id": None,
        "name": f"{rate_card.get('name', 'Rate card')} {direction.lower()} default",
        "party": party,
        "initialIncrementSeconds": int(
            rate_card.get(f"{direction_key}InitialIncrementSeconds") or default_initial
        ),
        "incrementSeconds": int(
            rate_card.get(f"{direction_key}IncrementSeconds") or default_increment
        ),
    }


def rate_call(
    cdr: dict[str, Any],
    cache: dict[str, Any],
    default_initial: int = 60,
    default_increment: int = 60,
) -> dict[str, Any]:
    """Calculate customer revenue and carrier cost independently."""
    if not cdr.get("answered") or int(cdr.get("billsec") or 0) <= 0:
        return {
            "ratedSeconds": 0,
            "carrierRatedSeconds": 0,
            "customerCharge": Decimal("0.000000"),
            "carrierCost": Decimal("0.000000"),
        }

    at = cdr.get("startedAt") or datetime.now(timezone.utc)
    if isinstance(at, str):
        at = datetime.fromisoformat(at.replace("Z", "+00:00"))
    customer_mapping = cache.get("customerRateCards", {}).get(cdr["customerId"])
    carrier_mapping = cache.get("carrierRateCards", {}).get(cdr.get("carrierId"))
    if not effective_mapping(customer_mapping, at):
        raise RatingError(f"No effective customer rate card for {cdr['customerId']}")
    if not cdr.get("carrierId"):
        raise RatingError("CDR has no carrier_id for vendor rating")
    if not effective_mapping(carrier_mapping, at):
        raise RatingError(f"No effective carrier rate card for {cdr['carrierId']}")

    customer_card = cache["rateCards"].get(customer_mapping["rateCardId"])
    carrier_card = cache["rateCards"].get(carrier_mapping["rateCardId"])
    if not customer_card or not customer_card.get("isActive", True):
        raise RatingError("Mapped customer rate card is inactive or absent from cache")
    if not carrier_card or not carrier_card.get("isActive", True):
        raise RatingError("Mapped carrier rate card is inactive or absent from cache")

    direction = cdr["direction"]
    direction_key = "inbound" if direction == "INBOUND" else "outbound"
    customer_rate = customer_card[f"{direction_key}RatePerMinute"]
    carrier_rate = carrier_card[f"{direction_key}RatePerMinute"]
    customer_minimum = resolve_minimum(
        cache, "CUSTOMER", cdr["customerId"], customer_card, direction,
        default_initial, default_increment
    )
    carrier_minimum = resolve_minimum(
        cache, "VENDOR", cdr["carrierId"], carrier_card, direction,
        default_initial, default_increment
    )
    customer_seconds = billed_seconds(
        cdr["billsec"],
        customer_minimum["initialIncrementSeconds"],
        customer_minimum["incrementSeconds"],
    )
    carrier_actual_seconds = int(cdr.get("carrierBillsec") or cdr["billsec"])
    carrier_seconds = billed_seconds(
        carrier_actual_seconds,
        carrier_minimum["initialIncrementSeconds"],
        carrier_minimum["incrementSeconds"],
    )
    return {
        "rateCardId": customer_card["id"],
        "rateCardVersion": str(customer_card["version"]),
        "carrierRateCardId": carrier_card["id"],
        "carrierRateCardVersion": str(carrier_card["version"]),
        "customerMinimumBillingId": customer_minimum.get("id"),
        "carrierMinimumBillingId": carrier_minimum.get("id"),
        "ratedSeconds": customer_seconds,
        "carrierRatedSeconds": carrier_seconds,
        "customerInitialIncrementSeconds": customer_minimum["initialIncrementSeconds"],
        "carrierInitialIncrementSeconds": carrier_minimum["initialIncrementSeconds"],
        "customerBillingIncrementSeconds": customer_minimum["incrementSeconds"],
        "carrierBillingIncrementSeconds": carrier_minimum["incrementSeconds"],
        "currency": customer_card["currency"],
        "carrierCurrency": carrier_card["currency"],
        "sellRatePerMinute": Decimal(str(customer_rate)),
        "carrierRatePerMinute": Decimal(str(carrier_rate)),
        "customerCharge": calculate_charge(customer_rate, customer_seconds),
        "carrierCost": calculate_charge(carrier_rate, carrier_seconds),
    }
