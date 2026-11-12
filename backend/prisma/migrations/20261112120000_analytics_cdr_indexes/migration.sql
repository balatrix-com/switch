-- cdr is owned by cdr-service and may not exist when Prisma deploy runs.
DO $$
BEGIN
  IF to_regclass('public.cdr') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS cdr_analytics_started_idx ON cdr (started_at DESC);
    CREATE INDEX IF NOT EXISTS cdr_analytics_carrier_started_idx ON cdr (carrier_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS cdr_analytics_number_started_idx ON cdr (customer_number_id, started_at DESC) WHERE direction = 'INBOUND';
  END IF;
END $$;
