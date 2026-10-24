-- How big their customers are, and the markets they aim at. Safe to run on a database that already has them.
ALTER TABLE "item_competitor" ADD COLUMN IF NOT EXISTS "customer_size" TEXT[];
ALTER TABLE "item_competitor" ADD COLUMN IF NOT EXISTS "target_market" TEXT[];
