from datetime import datetime
from decimal import Decimal
from bal_watch.config import watch_config

def _to_decimal(val):
    if val is None:
        return Decimal('0.0')
    if isinstance(val, bytes):
        return Decimal(val.decode('utf-8'))
    return Decimal(str(val))

def process_wallets(wallets):
    """
    Classifies wallets into overlimit, negative, and low_balance categories
    based on Switch's multi-bucket balance model.
    """
    summary = {
        "total_wallets_checked": len(wallets),
        "overlimit_count": 0,
        "negative_count": 0,
        "low_balance_count": 0
    }
    
    overlimit_wallets = []
    negative_wallets = []
    low_balance_wallets = []

    for row in wallets:
        fiat_balance = _to_decimal(row.get('fiat_balance', 0))
        credit_limit = _to_decimal(row.get('credit_limit', 0))
        credit_used = _to_decimal(row.get('credit_used', 0))
        
        # Effective Available Balance = fiat_balance + (credit_limit - credit_used)
        effective_balance = fiat_balance + (credit_limit - credit_used)
        
        customer_id = str(row.get('customer_id'))
        account_code = str(row.get('account_code', ''))
        currency = str(row.get('currency', 'USD'))
        
        wallet_data = {
            "customer_id": customer_id,
            "account_code": account_code,
            "fiat_balance": fiat_balance,
            "credit_limit": credit_limit,
            "credit_used": credit_used,
            "effective_balance": effective_balance,
            "currency": currency,
            "tfn_free_minutes": row.get('tfn_free_minutes', 0),
            "did_free_minutes": row.get('did_free_minutes', 0),
            "ob_free_minutes": row.get('ob_free_minutes', 0),
            "is_suspended": row.get('is_suspended', False)
        }
        
        # Classification logic for Switch
        if effective_balance <= Decimal('0'):
            # The customer has depleted their cash and maxed their credit.
            summary["overlimit_count"] += 1
            overlimit_wallets.append(wallet_data)
        elif fiat_balance <= Decimal('0') and effective_balance > Decimal('0'):
            # Fiat is negative or zero, but credit line is active and not maxed.
            summary["negative_count"] += 1
            negative_wallets.append(wallet_data)
        elif effective_balance > Decimal('0') and effective_balance <= Decimal(str(watch_config.LOW_BALANCE_THRESHOLD)):
            # Positive balance but below the low balance threshold.
            summary["low_balance_count"] += 1
            low_balance_wallets.append(wallet_data)

    # Sorting
    overlimit_wallets.sort(key=lambda x: x['effective_balance'])
    negative_wallets.sort(key=lambda x: x['effective_balance'])
    low_balance_wallets.sort(key=lambda x: x['effective_balance'])

    return {
        "cycle_timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "summary": summary,
        "overlimit_wallets": overlimit_wallets,
        "negative_wallets": negative_wallets,
        "low_balance_wallets": low_balance_wallets
    }
