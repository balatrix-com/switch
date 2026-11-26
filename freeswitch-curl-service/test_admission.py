"""Admission tests without a running PostgreSQL or Redis server."""

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import admission


class Cursor:
    def __init__(self, row):
        self.row = row
        self.query = None

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def execute(self, query, params):
        self.query = (query, params)

    def fetchone(self):
        return self.row


class Connection:
    def __init__(self, row):
        self.cursor_value = Cursor(row)

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def cursor(self):
        return self.cursor_value


class Pool:
    def __init__(self, row):
        self.connection = Connection(row)
        self.returned = False

    def getconn(self):
        return self.connection

    def putconn(self, _):
        self.returned = True


class Redis:
    def __init__(self, result=1):
        self.result = result
        self.args = None

    def eval(self, *args):
        self.args = args
        return self.result


def wallet_row(*, cash="0", credit="0", credit_used="0", did=0, ob=0,
               suspended=False, card_currency="USD", inbound_rate="0.06",
               outbound_rate="0.09", inbound_initial=60, outbound_initial=60,
               vendor_mapping=True):
    return (cash, credit, credit_used, did, ob, suspended, card_currency,
            inbound_rate, outbound_rate, inbound_initial, outbound_initial,
            "USD", vendor_mapping)


class AdmissionTests(unittest.TestCase):
    def test_subscription_minutes_allow_zero_cash_and_credit(self):
        pool = Pool(wallet_row(did=1))
        client = Redis()
        with patch.object(admission, "_redis_client", return_value=client):
            self.assertTrue(admission.admit(pool, "482692", "did-1", "carrier-1", "INBOUND", "session-123").allowed)
        self.assertEqual(client.args[3], "session-123")
        self.assertEqual(client.args[9], 60)
        self.assertEqual(client.args[11], "INBOUND")
        self.assertTrue(pool.returned)

    def test_payg_uses_cash_and_unused_credit(self):
        pool = Pool(wallet_row(cash="0.01", credit="0.10", credit_used="0.02"))
        client = Redis()
        with patch.object(admission, "_redis_client", return_value=client):
            self.assertTrue(admission.admit(pool, "482692", None, "carrier-1", "OUTBOUND", "session-123").allowed)
        self.assertEqual(client.args[8], 90000)  # cash plus unused credit, in micro-units
        self.assertEqual(client.args[10], 90000)  # $0.09 per minute, in micro-units
        self.assertEqual(client.args[11], "OUTBOUND")

    def test_over_limit_debt_reduces_cash_available_for_new_calls(self):
        pool = Pool(wallet_row(cash="1.35", credit="0", credit_used="6.31"))
        client = Redis(result=0)
        with patch.object(admission, "_redis_client", return_value=client):
            decision = admission.admit(pool, "482692", None, "carrier-1", "INBOUND", "session-123")
        self.assertFalse(decision.allowed)
        self.assertEqual(decision.reason, "INSUFFICIENT_BALANCE")
        self.assertEqual(client.args[8], 0)

    def test_partially_repaid_debt_uses_only_net_cash_and_credit(self):
        pool = Pool(wallet_row(cash="7", credit="2", credit_used="6"))
        client = Redis()
        with patch.object(admission, "_redis_client", return_value=client):
            self.assertTrue(admission.admit(pool, "482692", None, "carrier-1", "INBOUND", "session-123").allowed)
        self.assertEqual(client.args[8], 3000000)

    def test_suspended_or_unrated_customer_is_denied_without_redis(self):
        for row in (wallet_row(suspended=True), wallet_row(card_currency=None),
                    wallet_row(vendor_mapping=False), None):
            with self.subTest(row=row):
                pool = Pool(row)
                with patch.object(admission, "_redis_client") as client:
                    self.assertFalse(admission.admit(pool, "482692", None, "carrier-1", "INBOUND", "session-123").allowed)
                    client.assert_not_called()
                self.assertTrue(pool.returned)

    def test_redis_denial_is_fail_closed(self):
        pool = Pool(wallet_row(cash="10"))
        with patch.object(admission, "_redis_client", return_value=Redis(result=0)):
            decision = admission.admit(pool, "482692", None, "carrier-1", "INBOUND", "session-123")
            self.assertFalse(decision.allowed)
            self.assertEqual(decision.reason, "INSUFFICIENT_BALANCE")

    def test_configuration_denials_are_not_labeled_low_balance(self):
        cases = (
            (None, "WALLET_NOT_FOUND"),
            (wallet_row(suspended=True), "ACCOUNT_SUSPENDED"),
            (wallet_row(card_currency=None), "RATE_CARD_MISSING"),
            (wallet_row(vendor_mapping=False), "CARRIER_RATE_CARD_MISSING"),
        )
        for row, expected in cases:
            with self.subTest(reason=expected):
                decision = admission.admit(Pool(row), "482692", None, "carrier-1", "INBOUND", "session-123")
                self.assertEqual(decision.reason, expected)


if __name__ == "__main__":
    unittest.main()
