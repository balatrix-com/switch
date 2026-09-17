import unittest
from decimal import Decimal
from bal_watch.processor import process_wallets

class TestBalWatchProcessor(unittest.TestCase):
    
    def test_switch_customer_creation(self):
        """Simulates a brand new customer created via Switch API (fiat=0, credit=0)"""
        wallets = [{
            "customer_id": "new_cust_001",
            "account_code": "NEW001",
            "fiat_balance": "0.00",
            "credit_limit": "0.00",
            "credit_used": "0.00"
        }]
        result = process_wallets(wallets)
        # In Switch, a brand new customer with 0 balance and 0 credit is technically "overlimit" or "depleted" 
        # because they have 0 spending power.
        self.assertEqual(result["summary"]["overlimit_count"], 1)
        self.assertEqual(result["overlimit_wallets"][0]["effective_balance"], Decimal('0.00'))

    def test_switch_topup_healthy(self):
        """Simulates a customer who topped up $50 via Stripe in Switch Admin"""
        wallets = [{
            "customer_id": "cust_002",
            "account_code": "TOPUP002",
            "fiat_balance": "50.00",
            "credit_limit": "0.00",
            "credit_used": "0.00"
        }]
        result = process_wallets(wallets)
        self.assertEqual(result["summary"]["overlimit_count"], 0)
        self.assertEqual(result["summary"]["negative_count"], 0)
        self.assertEqual(result["summary"]["low_balance_count"], 0)

    def test_switch_low_balance_warning(self):
        """Simulates a customer whose balance dropped below $10 after a call"""
        wallets = [{
            "customer_id": "cust_003",
            "account_code": "LOW003",
            "fiat_balance": "5.00",
            "credit_limit": "0.00",
            "credit_used": "0.00"
        }]
        result = process_wallets(wallets)
        # Should flag as low balance
        self.assertEqual(result["summary"]["low_balance_count"], 1)
        self.assertEqual(result["low_balance_wallets"][0]["effective_balance"], Decimal('5.00'))

    def test_switch_credit_active_negative_fiat(self):
        """Simulates a post-paid carrier with $1000 credit limit who used $300"""
        wallets = [{
            "customer_id": "cust_004",
            "account_code": "POSTPAID004",
            "fiat_balance": "-50.00", # Manual debit or overdraw pushed fiat negative
            "credit_limit": "1000.00",
            "credit_used": "300.00"
        }]
        result = process_wallets(wallets)
        # Effective balance = -50 + (1000 - 300) = 650.00
        # They have active spending power, so they are not overlimit, but their fiat is negative.
        self.assertEqual(result["summary"]["negative_count"], 1)
        self.assertEqual(result["summary"]["overlimit_count"], 0)
        self.assertEqual(result["negative_wallets"][0]["effective_balance"], Decimal('650.00'))

    def test_switch_maxed_out_credit(self):
        """Simulates a post-paid carrier who exhausted their $1000 credit limit"""
        wallets = [{
            "customer_id": "cust_005",
            "account_code": "MAXED005",
            "fiat_balance": "0.00",
            "credit_limit": "1000.00",
            "credit_used": "1050.00"
        }]
        result = process_wallets(wallets)
        # Effective balance = 0 + (1000 - 1050) = -50.00
        # They have exhausted credit, so they are OVERLIMIT.
        self.assertEqual(result["summary"]["overlimit_count"], 1)
        self.assertEqual(result["overlimit_wallets"][0]["effective_balance"], Decimal('-50.00'))

if __name__ == '__main__':
    unittest.main()
