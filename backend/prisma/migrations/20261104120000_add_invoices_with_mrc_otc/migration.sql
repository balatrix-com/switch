CREATE TYPE "MrcType" AS ENUM ('AUTO', 'MANUAL');

ALTER TABLE "customer_settings" ADD COLUMN "monthly_minimum_spend" DECIMAL(14,2) NOT NULL DEFAULT 0;

CREATE TABLE "invoices" (
  "id" TEXT NOT NULL,
  "invoice_number" VARCHAR(50) NOT NULL,
  "customer_id" TEXT NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
  "mrc_type" "MrcType" NOT NULL DEFAULT 'AUTO',
  "mrc_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "otc_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "usage_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "services_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "amount_paid" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "payment_method" VARCHAR(30) NOT NULL DEFAULT 'WALLET',
  "notes" TEXT,
  "wallet_snapshot" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");
CREATE INDEX "invoices_customer_id_start_date_end_date_idx" ON "invoices"("customer_id", "start_date", "end_date");

CREATE TABLE "invoice_items" (
  "id" BIGSERIAL NOT NULL,
  "invoice_id" TEXT NOT NULL,
  "category" VARCHAR(30) NOT NULL,
  "description" VARCHAR(255) NOT NULL,
  "quantity" DECIMAL(12,2) NOT NULL DEFAULT 1,
  "unit_price" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "metadata" JSONB,
  CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items"("invoice_id");

CREATE SEQUENCE "invoice_number_sequence";
