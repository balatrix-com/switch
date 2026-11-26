-- One-time, customer-scoped reconciliation for cash and previously billed credit.
-- Run explicitly with: psql ... -v customer_id=482692 -f reconcile-wallet-credit.sql
-- A second run changes nothing unless new cash and credit debt coexist.
\set ON_ERROR_STOP on
BEGIN;
WITH locked AS (
  SELECT customer_id, currency,
         LEAST(GREATEST(fiat_balance, 0), credit_used) AS repayment
  FROM customer_wallets
  WHERE customer_id = :'customer_id'
  FOR UPDATE
), moved AS (
  UPDATE customer_wallets AS wallet
  SET fiat_balance = wallet.fiat_balance - locked.repayment,
      credit_used = wallet.credit_used - locked.repayment,
      version = wallet.version + 1,
      updated_at = NOW()
  FROM locked
  WHERE wallet.customer_id = locked.customer_id AND locked.repayment > 0
  RETURNING wallet.customer_id, wallet.currency, wallet.fiat_balance
)
INSERT INTO transactions (
  customer_id, source_type, fiat_debit_amount, credit_debit_amount,
  balance_after, currency, status, notes
)
SELECT moved.customer_id, 'credit_repayment', locked.repayment, -locked.repayment,
       moved.fiat_balance, moved.currency, 'posted',
       'One-time repayment of previously billed call or recording charges'
FROM moved JOIN locked ON locked.customer_id = moved.customer_id;
COMMIT;
SELECT customer_id, fiat_balance, credit_limit, credit_used,
       fiat_balance + credit_limit - credit_used AS net_balance
FROM customer_wallets WHERE customer_id = :'customer_id';
