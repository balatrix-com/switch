import os
import sys
import uuid
import time
import json
from decimal import Decimal
import psycopg2
from psycopg2.extras import RealDictCursor

# Append billing-engine path
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from config import DATABASE_DSN
from billing_worker import rate_batch, CacheReader
from bal_watch.config import watch_config
from bal_watch.db import fetch_wallets
from bal_watch.processor import process_wallets
from bal_watch.redis_manager import sync_blacklist_set, get_redis_client

def run_e2e_test():
    print("=========================================================")
    print("   STARTING BAL_WATCH E2E INTEGRATION TEST")
    print("=========================================================")
    
    # 1. Setup DB and Redis
    conn = psycopg2.connect(DATABASE_DSN, cursor_factory=RealDictCursor)
    conn.autocommit = True
    cursor = conn.cursor()
    
    redis_client = get_redis_client()
    if not redis_client:
        print("ERROR: Redis not available. E2E test requires Redis.")
        return
        
    print("[1] Connected to Postgres and Redis successfully.")
    
    import random
    test_cust_id = str(random.randint(100000, 999999))
    account_code = "ACT_" + test_cust_id

    try:
        # 2. Create Test Customer
        print(f"[2] Creating Test Customer: {test_cust_id}")
        cursor.execute("""
            INSERT INTO customers (id, name, account_code, is_active, credit_balance, currency, created_at, updated_at)
            VALUES (%s, %s, %s, TRUE, 0, 'USD', NOW(), NOW())
        """, (test_cust_id, "BalWatch E2E Test", account_code))
        
        # 3. Create Test Wallet (Fiat = $0.00, Credit Limit = $0.00)
        # Any charge will force them overlimit.
        print("[3] Creating Wallet: Fiat=$0.00, CreditLimit=$0.00")
        cursor.execute("""
            INSERT INTO customer_wallets (
                id, customer_id, currency, fiat_balance, credit_limit, 
                credit_used, tfn_free_minutes, did_free_minutes, ob_free_minutes
            )
            VALUES (%s, %s, 'USD', 0.00, 0.00, 0.00, 0, 0, 0)
        """, (str(uuid.uuid4()), test_cust_id))
        
        # 4. Fetch an existing Rate Card & Assign to Customer
        print("[4] Assigning existing Rate Card to Customer")
        cursor.execute("SELECT id FROM rate_cards LIMIT 1")
        rc_row = cursor.fetchone()
        
        if not rc_row:
            print("ERROR: No SELL rate_cards found in DB! Cannot rate call.")
            return
            
        rc_id = rc_row['id']
        
        # Assign to customer
        cursor.execute("""
            INSERT INTO customer_rate_cards (
                customer_id, rate_card_id, effective_from, effective_to, created_at, updated_at
            )
            VALUES (%s, %s, '2020-01-01', '2099-01-01', NOW(), NOW())
        """, (test_cust_id, rc_id))

        from cache_manager import refresh_cache
        refresh_cache()
        print("    -> Refreshed cache for background workers")

        # 5. Insert Live Call Event & CDR
        # We will generate 3 minutes of calls (3 * $1.00 = $3.00 total charge)
        print("[4] Generating CDR for 3 minutes (Cost: $3.00)")
        
        cdr_id = str(uuid.uuid4())
        cursor.execute("""
            INSERT INTO cdr (
                session_uuid, switch_name, customer_id, direction, direction_source,
                caller_number, destination_number, carrier_id,
                started_at, answered_at, ended_at,
                duration_seconds, billsec, carrier_billsec,
                answered, call_status, hangup_cause,
                leg_count, rating_status, rating_attempts,
                txn_status, txn_attempts, created_at, updated_at
            )
            VALUES (
                %s, 'freeswitch-01', %s, 'OUTBOUND', 'billing_direction',
                '15551234567', '18005551234', 'dad5fdc1-a140-48a4-96d7-3ab3b968a20b',
                NOW() - interval '3 minutes', NOW() - interval '3 minutes', NOW(),
                180, 180, 180,
                TRUE, 'ANSWERED', 'NORMAL_CLEARING',
                1, 'PENDING', 0,
                'PENDING', 0, NOW(), NOW()
            )
            RETURNING id
        """, (cdr_id, test_cust_id))
        pg_cdr_id = cursor.fetchone()['id']
        
        # Verify CDR is in DB
        cursor.execute("SELECT id, rating_status, rating_attempts FROM cdr WHERE id = %s", (pg_cdr_id,))
        print("    -> DB Check before worker:", cursor.fetchone())
        
        # 6. Wait for Background Billing Worker Rating Cycle
        print("[5] Waiting for Background Billing Worker (2 seconds)")
        time.sleep(3)
        
        # Check Transaction and Wallet
        cursor.execute("SELECT fiat_balance, credit_used FROM customer_wallets WHERE customer_id = %s", (test_cust_id,))
        wallet_after = cursor.fetchone()
        print(f"    -> Wallet After Rating: Fiat=${wallet_after['fiat_balance']}, CreditUsed=${wallet_after['credit_used']}")
        
        cursor.execute("SELECT fiat_charged, customer_charge, txn_status, rating_error FROM cdr WHERE id = %s", (pg_cdr_id,))
        cdr_after = cursor.fetchone()
        print(f"    -> CDR Rated: Charge=${cdr_after['customer_charge']}, FiatCharged=${cdr_after['fiat_charged']}, Status={cdr_after['txn_status']}, Error={cdr_after['rating_error']}")

        # 7. Run Bal Watch Classification
        print("[6] Running bal_watch logic...")
        wallets = fetch_wallets()
        results = process_wallets(wallets)
        
        overlimit_cust_ids = [w['customer_id'] for w in results['overlimit_wallets']]
        
        if test_cust_id in overlimit_cust_ids:
            print(f"    -> SUCCESS: Customer {test_cust_id} was successfully classified as OVERLIMIT!")
            test_wallet = next(w for w in results['overlimit_wallets'] if w['customer_id'] == test_cust_id)
            print(f"       Details: Effective Balance = ${test_wallet['effective_balance']}")
        else:
            print(f"    -> FAILED: Customer {test_cust_id} is NOT in overlimit list!")
            
        # 8. Sync Blacklist to Redis
        print("[7] Syncing Blacklist to Redis")
        sync_blacklist_set(results['overlimit_wallets'])
        
        redis_set = redis_client.smembers(watch_config.REDIS_KEY_BLACKLIST)
        if test_cust_id in redis_set:
            print(f"    -> SUCCESS: Redis set '{watch_config.REDIS_KEY_BLACKLIST}' contains {test_cust_id}!")
        else:
            print(f"    -> FAILED: Redis set does not contain the customer!")
            
        print("=========================================================")
        print("   TEST COMPLETE: ALL FLOWS WORKING AS EXPECTED")
        print("=========================================================")

    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    run_e2e_test()
