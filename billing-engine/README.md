# Billing engine

This service is deliberately separate from the routing API. It caches rate-card configuration and rates each finalized `cdr` once for both sides of the call:

- customer sell rate and customer minimum-billing pulse;
- carrier/vendor cost rate and carrier minimum-billing pulse.

The initial pulse and subsequent pulse are applied independently. For a 37-second call, customer 30/6 bills 42 seconds while vendor 60/60 bills 60 seconds.

## Processes

Copy `.env.example` to `.env`, export it before launch, and install `requirements.txt` in a virtual environment. Run two independent PM2 processes from this directory:

```bash
pm2 start api_server.py --name billing-cache-api --interpreter /opt/switch/billing-engine/.venv/bin/python
pm2 start billing_worker.py --name billing-rating-worker --interpreter /opt/switch/billing-engine/.venv/bin/python
pm2 save
```

The Nest backend calls `http://127.0.0.1:9100/api/v1/cache/refresh` after rate-card or mapping mutations. The worker reloads the atomic cache file when its modification time changes and claims CDRs with `FOR UPDATE SKIP LOCKED`, so multiple workers do not rate the same row concurrently.

