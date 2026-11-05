from datetime import datetime, timezone
from decimal import Decimal

from billing_service import billed_seconds, rate_call


def test_minimum_billing_pulses() -> None:
    assert billed_seconds(0, 60, 60) == 0
    assert billed_seconds(1, 60, 60) == 60
    assert billed_seconds(60, 60, 60) == 60
    assert billed_seconds(61, 60, 60) == 120
    assert billed_seconds(37, 30, 6) == 42


def test_flat_direction_rates_do_not_depend_on_destination() -> None:
    card = {
        "inboundRatePerMinute": "0.010000",
        "outboundRatePerMinute": "0.060000",
    }
    assert card["outboundRatePerMinute"] == "0.060000"
    assert card["inboundRatePerMinute"] == "0.010000"


def test_customer_and_vendor_are_rated_independently() -> None:
    now = datetime.now(timezone.utc)
    cache = {
        "rateCards": {
            "sell": {
                "id": "sell", "name": "Sell", "type": "CUSTOMER", "currency": "USD",
                "version": 2, "isActive": True,
                "inboundRatePerMinute": "0.010000", "inboundInitialIncrementSeconds": 60,
                "inboundIncrementSeconds": 60, "outboundRatePerMinute": "0.060000",
                "outboundInitialIncrementSeconds": 30, "outboundIncrementSeconds": 6,
            },
            "cost": {
                "id": "cost", "name": "Cost", "type": "VENDOR", "currency": "USD",
                "version": 4, "isActive": True,
                "inboundRatePerMinute": "0.005000", "inboundInitialIncrementSeconds": 60,
                "inboundIncrementSeconds": 60, "outboundRatePerMinute": "0.030000",
                "outboundInitialIncrementSeconds": 60, "outboundIncrementSeconds": 60,
            },
        },
        "customerRateCards": {"customer": {"rateCardId": "sell"}},
        "carrierRateCards": {"carrier": {"rateCardId": "cost"}},
        "minimumSettings": {},
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


def test_did_card_overrides_customer_default_only_for_that_number() -> None:
    now = datetime.now(timezone.utc)
    sell = {"id": "default", "name": "Default", "version": 1, "currency": "USD", "isActive": True,
            "inboundRatePerMinute": "0.010000", "inboundInitialIncrementSeconds": 60, "inboundIncrementSeconds": 60}
    did = {**sell, "id": "did", "name": "Special DID", "inboundRatePerMinute": "0.050000"}
    cost = {**sell, "id": "cost", "name": "Cost", "inboundRatePerMinute": "0.005000"}
    cache = {"rateCards": {"default": sell, "did": did, "cost": cost},
             "customerRateCards": {"customer": {"rateCardId": "default"}},
             "numberRateCards": {"number-1": {"customerId": "customer", "providerRateCardId": "did"}},
             "carrierRateCards": {"carrier": {"rateCardId": "cost"}}}
    cdr = {"customerId": "customer", "carrierId": "carrier", "direction": "INBOUND",
           "startedAt": now, "answered": True, "billsec": 30}
    special = rate_call({**cdr, "customerNumberId": "number-1"}, cache)
    ordinary = rate_call({**cdr, "customerNumberId": "number-2"}, cache)
    assert special["rateCardId"] == "did"
    assert special["customerCharge"] == Decimal("0.050000")
    assert ordinary["rateCardId"] == "default"
    assert ordinary["customerCharge"] == Decimal("0.010000")
    assert special["carrierCost"] == ordinary["carrierCost"]
