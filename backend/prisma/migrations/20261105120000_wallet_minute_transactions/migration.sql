ALTER TABLE "transactions" ADD COLUMN "tfn_minute_delta" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "transactions" ADD COLUMN "did_minute_delta" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "transactions" ADD COLUMN "ob_minute_delta" INTEGER NOT NULL DEFAULT 0;
