ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPPORT_MEMBER';

CREATE TABLE "support_assignments" (
  "support_member_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_assignments_pkey" PRIMARY KEY ("support_member_id", "customer_id"),
  CONSTRAINT "support_assignments_support_member_id_fkey" FOREIGN KEY ("support_member_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "support_assignments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "support_assignments_customer_id_idx" ON "support_assignments"("customer_id");
