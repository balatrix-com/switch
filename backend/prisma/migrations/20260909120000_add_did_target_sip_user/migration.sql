-- AlterEnum
ALTER TYPE "DestinationType" ADD VALUE IF NOT EXISTS 'SIP_USER';

-- AlterTable
ALTER TABLE "customer_settings" ADD COLUMN IF NOT EXISTS "default_target_sip_user_id" UUID;

-- AlterTable
ALTER TABLE "number_settings" ADD COLUMN IF NOT EXISTS "target_sip_user_id" UUID;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customer_settings_default_target_sip_user_id_fkey'
  ) THEN
    ALTER TABLE "customer_settings" ADD CONSTRAINT "customer_settings_default_target_sip_user_id_fkey" FOREIGN KEY ("default_target_sip_user_id") REFERENCES "sip_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'number_settings_target_sip_user_id_fkey'
  ) THEN
    ALTER TABLE "number_settings" ADD CONSTRAINT "number_settings_target_sip_user_id_fkey" FOREIGN KEY ("target_sip_user_id") REFERENCES "sip_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
