-- Adds our common feature list (Capability), and who a price's licence covers. Safe to run on a database that already has them.
CREATE TABLE IF NOT EXISTS "item_capability" (
    "product_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "aliases" TEXT[],
    CONSTRAINT "item_capability_pkey" PRIMARY KEY ("product_id","id")
);

DO $$ BEGIN
  ALTER TABLE "item_capability" ADD CONSTRAINT "item_capability_product_id_id_fkey" FOREIGN KEY ("product_id","id") REFERENCES "items"("product_id","id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "item_price_point" ADD COLUMN IF NOT EXISTS "seat_model" TEXT;
ALTER TABLE "item_price_point" ADD COLUMN IF NOT EXISTS "max_users" INTEGER;
