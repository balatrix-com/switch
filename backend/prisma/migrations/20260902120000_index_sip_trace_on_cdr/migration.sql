-- Keep the lightweight, tenant-owned SIP trace index in sync when the Python
-- livecall-to-cdr worker inserts or updates a finalized CDR. Homer remains the
-- packet store; this table is the searchable logical-call index.

CREATE INDEX IF NOT EXISTS "customer_sip_traces_started_at_idx"
    ON "customer_sip_traces"("started_at" DESC);

CREATE OR REPLACE FUNCTION sync_customer_sip_trace_from_cdr()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    resolved_customer_number_id TEXT;
    resolved_customer_number TEXT;
    resolved_destination_ip TEXT;
    resolved_call_ids TEXT[];
BEGIN
    IF NEW.customer_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM customers WHERE id = NEW.customer_id)
       OR (
           NEW.a_leg_sip_call_id IS NULL
           AND cardinality(COALESCE(NEW.b_leg_sip_call_ids, ARRAY[]::TEXT[])) = 0
       ) THEN
        DELETE FROM customer_sip_traces WHERE cdr_id = NEW.id;
        RETURN NEW;
    END IF;

    SELECT assigned.id, inventory.canonical_number
      INTO resolved_customer_number_id, resolved_customer_number
      FROM customer_numbers AS assigned
      JOIN global_number_inventory AS inventory
        ON inventory.id = assigned.inventory_id
     WHERE assigned.customer_id = NEW.customer_id
       AND assigned.status = 'ACTIVE'
       AND (
           assigned.id = NEW.customer_number_id
           OR regexp_replace(inventory.canonical_number, '[^0-9]', '', 'g') IN (
               regexp_replace(COALESCE(NEW.caller_number, ''), '[^0-9]', '', 'g'),
               regexp_replace(COALESCE(NEW.destination_number, ''), '[^0-9]', '', 'g')
           )
       )
     ORDER BY
       CASE WHEN assigned.id = NEW.customer_number_id THEN 0 ELSE 1 END,
       CASE WHEN regexp_replace(inventory.canonical_number, '[^0-9]', '', 'g') =
                 regexp_replace(COALESCE(NEW.destination_number, ''), '[^0-9]', '', 'g')
            THEN 0 ELSE 1 END,
       assigned.assigned_at DESC
     LIMIT 1;

    IF resolved_customer_number_id IS NULL THEN
        DELETE FROM customer_sip_traces WHERE cdr_id = NEW.id;
        RETURN NEW;
    END IF;

    SELECT CASE
             WHEN NEW.direction = 'INBOUND' THEN customer_destination.host
             ELSE carrier_destination.host
           END
      INTO resolved_destination_ip
      FROM (SELECT 1) AS anchor
      LEFT JOIN customer_endpoints AS customer_destination
        ON customer_destination.id = NEW.customer_endpoint_id
      LEFT JOIN carrier_endpoints AS carrier_destination
        ON carrier_destination.id = NEW.carrier_endpoint_id;

    SELECT ARRAY(
        SELECT DISTINCT call_id
          FROM unnest(
              ARRAY[NEW.a_leg_sip_call_id] ||
              COALESCE(NEW.b_leg_sip_call_ids, ARRAY[]::TEXT[])
          ) AS call_id
         WHERE call_id IS NOT NULL AND call_id <> ''
    ) INTO resolved_call_ids;

    INSERT INTO customer_sip_traces (
        customer_id, customer_number_id, cdr_id, session_uuid, call_ids,
        correlation_id, direction, caller_number, called_number,
        customer_number, status, duration_seconds, source_ip, destination_ip,
        capture_id, started_at, ended_at, created_at, updated_at
    ) VALUES (
        NEW.customer_id,
        resolved_customer_number_id,
        NEW.id,
        NEW.session_uuid,
        resolved_call_ids,
        NEW.session_uuid,
        NEW.direction,
        NEW.caller_number,
        NEW.destination_number,
        resolved_customer_number,
        NEW.call_status,
        COALESCE(NEW.duration_seconds, 0),
        NEW.source_ip,
        resolved_destination_ip,
        COALESCE(NEW.homer_capture_id, 61),
        COALESCE(NEW.started_at, NEW.created_at, NOW()),
        NEW.ended_at,
        NOW(),
        NOW()
    )
    ON CONFLICT (cdr_id) DO UPDATE SET
        customer_id = EXCLUDED.customer_id,
        customer_number_id = EXCLUDED.customer_number_id,
        session_uuid = EXCLUDED.session_uuid,
        call_ids = EXCLUDED.call_ids,
        correlation_id = EXCLUDED.correlation_id,
        direction = EXCLUDED.direction,
        caller_number = EXCLUDED.caller_number,
        called_number = EXCLUDED.called_number,
        customer_number = EXCLUDED.customer_number,
        status = EXCLUDED.status,
        duration_seconds = EXCLUDED.duration_seconds,
        source_ip = EXCLUDED.source_ip,
        destination_ip = EXCLUDED.destination_ip,
        capture_id = EXCLUDED.capture_id,
        started_at = EXCLUDED.started_at,
        ended_at = EXCLUDED.ended_at,
        participants = CASE
            WHEN customer_sip_traces.call_ids IS DISTINCT FROM EXCLUDED.call_ids
              OR customer_sip_traces.started_at IS DISTINCT FROM EXCLUDED.started_at
              OR customer_sip_traces.ended_at IS DISTINCT FROM EXCLUDED.ended_at
            THEN NULL ELSE customer_sip_traces.participants END,
        messages_snapshot = CASE
            WHEN customer_sip_traces.call_ids IS DISTINCT FROM EXCLUDED.call_ids
              OR customer_sip_traces.started_at IS DISTINCT FROM EXCLUDED.started_at
              OR customer_sip_traces.ended_at IS DISTINCT FROM EXCLUDED.ended_at
            THEN NULL ELSE customer_sip_traces.messages_snapshot END,
        synced_at = CASE
            WHEN customer_sip_traces.call_ids IS DISTINCT FROM EXCLUDED.call_ids
              OR customer_sip_traces.started_at IS DISTINCT FROM EXCLUDED.started_at
              OR customer_sip_traces.ended_at IS DISTINCT FROM EXCLUDED.ended_at
            THEN NULL ELSE customer_sip_traces.synced_at END,
        updated_at = NOW();

    -- Hard per-tenant cap. The newest 100 remain; insertion of call 101 removes
    -- the oldest index row immediately. The daily job still repairs stale data.
    DELETE FROM customer_sip_traces
     WHERE id IN (
         SELECT id
           FROM (
               SELECT id,
                      ROW_NUMBER() OVER (
                          ORDER BY started_at DESC, id DESC
                      ) AS position
                 FROM customer_sip_traces
                WHERE customer_id = NEW.customer_id
           ) AS ranked
          WHERE ranked.position > 100
     );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "cdr_sync_customer_sip_trace" ON "cdr";
CREATE TRIGGER "cdr_sync_customer_sip_trace"
AFTER INSERT OR UPDATE OF
    customer_id,
    customer_number_id,
    customer_endpoint_id,
    carrier_endpoint_id,
    direction,
    caller_number,
    destination_number,
    started_at,
    ended_at,
    duration_seconds,
    call_status,
    a_leg_sip_call_id,
    b_leg_sip_call_ids,
    homer_capture_id
ON "cdr"
FOR EACH ROW
EXECUTE FUNCTION sync_customer_sip_trace_from_cdr();
