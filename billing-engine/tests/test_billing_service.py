from datetime import datetime, timezone
from decimal import Decimal

import pytest

from billing_service import RatingError, billed_seconds, match_rate, rate_call


def test_minimum_billing_pulses() -> None:
    assert billed_seconds(0, 60, 60) == 0
    assert billed_seconds(1, 60, 60) == 60
    assert billed_seconds(60, 60, 60) == 60
    assert billed_seconds(61, 60, 60) == 120
    assert billed_seconds(37, 30, 6) == 42


def test_longest_prefix_wins() -> None:
    card = {
        "name": "Sell",
        "items": [
            {"prefix": "*", "direction": "OUTBOUND", "ratePerMinute": "0.10", "priority": 100},
            {"prefix": "1", "direction": "OUTBOUND", "ratePerMinute": "0.05", "priority": 100},
            {"prefix": "1580", "direction": "OUTBOUND", "ratePerMinute": "0.02", "priority": 100},
        ],
    }
    assert match_rate(card, "+1 (580) 205-1753", "OUTBOUND")["ratePerMinute"] == "0.02"
    with pytest.raises(RatingError):
        match_rate(card, "15802051753", "INBOUND")


def test_customer_and_vendor_are_rated_independently() -> None:
    now = datetime.now(timezone.utc)
    cache = {
        "rateCards": {
            "sell": {
                "id": "sell", "name": "Sell", "type": "CUSTOMER", "currency": "USD",
                "version": 2, "isActive": True, "defaultMinimumBillingSettingId": "customer-30-6",
                "items": [{"prefix": "1", "direction": "OUTBOUND", "ratePerMinute": "0.060000", "priority": 100}],
            },
            "cost": {
                "id": "cost", "name": "Cost", "type": "VENDOR", "currency": "USD",
                "version": 4, "isActive": True, "defaultMinimumBillingSettingId": "vendor-60-60",
                "items": [{"prefix": "1", "direction": "OUTBOUND", "ratePerMinute": "0.030000", "priority": 100}],
            },
        },
        "customerRateCards": {"customer": {"rateCardId": "sell"}},
        "carrierRateCards": {"carrier": {"rateCardId": "cost"}},
        "minimumSettings": {
            "customer-30-6": {"id": "customer-30-6", "party": "CUSTOMER", "initialIncrementSeconds": 30, "incrementSeconds": 6, "isActive": True},
            "vendor-60-60": {"id": "vendor-60-60", "party": "VENDOR", "initialIncrementSeconds": 60, "incrementSeconds": 60, "isActive": True},
        },
        "customerMinimum": {}, "carrierMinimum": {},
    }
    result = rate_call({
        "customerId": "customer", "carrierId": "carrier", "direction": "OUTBOUND",
        "destinationNumber": "+15802051753", "startedAt": now, "answered": True,
        "billsec": 37, "carrierBillsec": 37,
    }, cache)
    assert result["ratedSeconds"] == 42
    assert result["carrierRatedSeconds"] == 60
    assert result["customerCharge"] == Decimal("0.042000")
    assert result["carrierCost"] == Decimal("0.030000")

