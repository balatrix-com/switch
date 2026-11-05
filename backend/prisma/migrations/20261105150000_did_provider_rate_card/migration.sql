ALTER TABLE "number_settings" ADD COLUMN "provider_rate_card_id" TEXT;
CREATE INDEX "number_settings_provider_rate_card_id_idx" ON "number_settings"("provider_rate_card_id");
ALTER TABLE "number_settings" ADD CONSTRAINT "number_settings_provider_rate_card_id_fkey"
  FOREIGN KEY ("provider_rate_card_id") REFERENCES "rate_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
