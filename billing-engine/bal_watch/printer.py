from bal_watch.config import watch_config

def format_row(row):
    return (f"{row['customer_id']:<15} {row['account_code']:<15} "
            f"{row['effective_balance']:>17.2f} {row['fiat_balance']:>15.2f} "
            f"{row['credit_limit']:>15.2f} {row['credit_used']:>15.2f}")

def print_results(result):
    """
    Displays the classification structured result in the terminal.
    """
    summary = result['summary']
    
    print(f"\n[{result['cycle_timestamp']}] Switch Wallet Scan Complete")
    print(f"Total wallets checked : {summary['total_wallets_checked']}")
    print(f"Overlimit wallets     : {summary['overlimit_count']}")
    print(f"Negative wallets      : {summary['negative_count']}")
    print(f"Low balance wallets   : {summary['low_balance_count']}")
    print(f"Low balance threshold : {watch_config.LOW_BALANCE_THRESHOLD:.2f}")
    print(f"Scan interval         : {watch_config.INTERVAL_SEC} sec\n")

    header = f"{'customer_id':<15} {'account_code':<15} {'effective_bal':>17} {'fiat_balance':>15} {'credit_limit':>15} {'credit_used':>15}"
    
    if result['overlimit_wallets']:
        print("================ OVERLIMIT WALLETS ================")
        print(header)
        for row in result['overlimit_wallets']:
            print(format_row(row))
        print()
    
    if result['negative_wallets']:
        print("================ NEGATIVE WALLETS ================")
        print(header)
        for row in result['negative_wallets']:
            print(format_row(row))
        print()

    if result['low_balance_wallets']:
        print("================ LOW BALANCE WALLETS ================")
        print(header)
        for row in result['low_balance_wallets']:
            print(format_row(row))
        print()
