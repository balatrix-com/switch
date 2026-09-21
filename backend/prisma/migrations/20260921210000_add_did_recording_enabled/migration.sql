ALTER TABLE "number_settings"
ADD COLUMN IF NOT EXISTS "recording_enabled" BOOLEAN DEFAULT true;
