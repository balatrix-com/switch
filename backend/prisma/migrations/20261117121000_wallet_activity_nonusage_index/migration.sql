-- The summary API must not scan thousands of call rows just to find/count
-- the few top-ups, adjustments, MRC and OTC transactions.
CREATE INDEX CONCURRENTLY transactions_nonusage_customer_created_idx
    ON transactions (customer_id, created_at DESC, id DESC)
    WHERE source_type NOT IN ('cdr', 'recording');
