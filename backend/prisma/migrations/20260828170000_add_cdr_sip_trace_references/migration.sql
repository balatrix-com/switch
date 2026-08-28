-- Homer owns SIP payload storage. PostgreSQL keeps only the identifiers needed
-- to open the matching A-leg and B-leg traces from a billing CDR.
ALTER TABLE IF EXISTS "live_call_event"
  ADD COLUMN IF NOT EXISTS "a_leg_sip_call_id" TEXT,
  ADD COLUMN IF NOT EXISTS "b_leg_sip_call_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE IF EXISTS "cdr"
  ADD COLUMN IF NOT EXISTS "a_leg_sip_call_id" TEXT,
  ADD COLUMN IF NOT EXISTS "b_leg_sip_call_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "homer_capture_id" INTEGER NOT NULL DEFAULT 61;

-- Backfill existing raw events from their retained FreeSWITCH JSON. The guards
-- keep a clean Prisma-only database deployable before cdr-service creates its
-- runtime-owned tables.
DO $$
BEGIN
  IF to_regclass('live_call_event') IS NOT NULL THEN
    UPDATE "live_call_event"
    SET "a_leg_sip_call_id" = COALESCE(
          "a_leg_sip_call_id",
          "a_leg_json"->'variables'->>'sip_call_id'
        ),
        "b_leg_sip_call_ids" = CASE
          WHEN cardinality("b_leg_sip_call_ids") > 0 THEN "b_leg_sip_call_ids"
          ELSE COALESCE((
            SELECT ARRAY_AGG(DISTINCT leg->'variables'->>'sip_call_id')
            FROM jsonb_array_elements(COALESCE("b_legs_json", '[]'::jsonb)) AS leg
            WHERE NULLIF(leg->'variables'->>'sip_call_id', '') IS NOT NULL
          ), ARRAY[]::TEXT[])
        END;
  END IF;

  IF to_regclass('cdr') IS NOT NULL AND to_regclass('live_call_event') IS NOT NULL THEN
    UPDATE "cdr" AS final
    SET "a_leg_sip_call_id" = COALESCE(final."a_leg_sip_call_id", raw."a_leg_sip_call_id"),
        "b_leg_sip_call_ids" = CASE
          WHEN cardinality(final."b_leg_sip_call_ids") > 0 THEN final."b_leg_sip_call_ids"
          ELSE raw."b_leg_sip_call_ids"
        END
    FROM "live_call_event" AS raw
    WHERE final."live_call_event_id" = raw."id";

    CREATE INDEX IF NOT EXISTS "cdr_a_leg_sip_call_id_idx"
      ON "cdr" ("a_leg_sip_call_id");
    CREATE INDEX IF NOT EXISTS "cdr_b_leg_sip_call_ids_idx"
      ON "cdr" USING GIN ("b_leg_sip_call_ids");
  END IF;
END $$;
