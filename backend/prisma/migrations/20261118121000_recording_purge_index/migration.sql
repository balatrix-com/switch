-- Build without blocking recording-billing inserts on a busy switch.
CREATE INDEX CONCURRENTLY rec_expired_purge_pending_idx
    ON rec (expiry, id)
    WHERE expiry IS NOT NULL
      AND rec_file_info IS NOT NULL
      AND purge_status IN ('PENDING', 'ERROR');
