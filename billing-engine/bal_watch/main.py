import sys
import time
import traceback
from bal_watch.config import watch_config, setup_logger
from bal_watch.db import fetch_wallets
from bal_watch.processor import process_wallets
from bal_watch.printer import print_results
from bal_watch.publisher import publish_overlimit
from bal_watch.redis_manager import sync_blacklist_set

logger = setup_logger(__name__)

def main():
    print(f"Starting Switch bal_watch... Scan interval: {watch_config.INTERVAL_SEC} seconds\n")
    try:
        while True:
            try:
                # 1. Fetch wallets from DB
                wallets = fetch_wallets()
                
                if wallets:
                    # 2. Process wallets
                    results = process_wallets(wallets)
                    
                    # 3. Print results to terminal
                    print_results(results)
                    
                    # 4. Push overlimit data to Redis event log
                    for wallet in results['overlimit_wallets']:
                        publish_overlimit(wallet)
                    
                    # 5. Maintain live blacklist set in Redis for route_server.py
                    sync_blacklist_set(results['overlimit_wallets'])
                else:
                    logger.warning("No wallets fetched from database. Skipping cycle.")
                    
            except Exception as e:
                logger.error(f"Error during scan cycle: {e}")
                traceback.print_exc()
                
            # sleep for configured interval
            time.sleep(watch_config.INTERVAL_SEC)
            
    except KeyboardInterrupt:
        print("\nStopping bal_watch...")
        sys.exit(0)

if __name__ == "__main__":
    main()
