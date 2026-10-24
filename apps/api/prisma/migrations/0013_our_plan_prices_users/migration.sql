-- Adds a monthly price, a yearly price and the number of users to our own pricing plans. Safe to run on a database that already has them.
ALTER TABLE "item_pricing_plan" ADD COLUMN IF NOT EXISTS "price_monthly" DOUBLE PRECISION;
ALTER TABLE "item_pricing_plan" ADD COLUMN IF NOT EXISTS "price_yearly" DOUBLE PRECISION;
ALTER TABLE "item_pricing_plan" ADD COLUMN IF NOT EXISTS "seat_model" TEXT;
ALTER TABLE "item_pricing_plan" ADD COLUMN IF NOT EXISTS "max_users" INTEGER;
