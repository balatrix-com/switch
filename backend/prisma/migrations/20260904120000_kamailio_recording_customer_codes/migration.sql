-- New customers receive a human-friendly six-digit numeric ID. Existing UUID
-- customer IDs remain valid so this deployment does not invalidate live routes,
-- CDRs, XML files, or external integrations.
CREATE OR REPLACE FUNCTION generate_customer_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  candidate text;
BEGIN
  -- Customer creation is infrequent; serialize code allocation so two
  -- concurrent inserts cannot choose the same six-digit value.
  PERFORM pg_advisory_xact_lock(hashtext('billing_switch_customer_code'));
  LOOP
    candidate := (100000 + floor(random() * 900000))::integer::text;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM customers WHERE id = candidate);
  END LOOP;
  RETURN candidate;
END;
$$;

ALTER TABLE customers
  ALTER COLUMN id SET DEFAULT generate_customer_code();

ALTER TABLE customers
  ADD CONSTRAINT customers_new_id_six_digits_check
  CHECK (id ~ '^[0-9]{6}$') NOT VALID;

ALTER TABLE customer_settings
  ADD COLUMN recording_enabled boolean NOT NULL DEFAULT false;

DROP INDEX IF EXISTS source_ip_auth_ip_address_port_auth_username_key;
CREATE INDEX source_ip_auth_ip_address_port_auth_username_is_active_idx
  ON source_ip_auth(ip_address, port, auth_username, is_active);
