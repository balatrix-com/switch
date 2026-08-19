ALTER TABLE "route_xml"
ALTER COLUMN "route_id" DROP NOT NULL,
ADD COLUMN "customer_number_id" TEXT,
ADD COLUMN "match_number" TEXT,
ADD COLUMN "file_name" TEXT;

CREATE UNIQUE INDEX "route_xml_customer_number_id_key"
ON "route_xml"("customer_number_id");

CREATE INDEX "route_xml_match_number_idx"
ON "route_xml"("match_number");

ALTER TABLE "route_xml"
ADD CONSTRAINT "route_xml_customer_number_id_fkey"
FOREIGN KEY ("customer_number_id") REFERENCES "customer_numbers"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
