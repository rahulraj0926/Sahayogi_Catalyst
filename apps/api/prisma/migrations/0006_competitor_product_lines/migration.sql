-- Adds competitor product lines and the plan-level tag on prices. Safe to run on a database that already has them.
CREATE TABLE IF NOT EXISTS "item_competitor_product_line" (
    "product_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "product_name" TEXT,
    "description" TEXT,
    "url" TEXT,
    "product_type" TEXT,
    "target_segments" TEXT[],
    "is_primary" BOOLEAN,
    CONSTRAINT "item_competitor_product_line_pkey" PRIMARY KEY ("product_id","id")
);

DO $$ BEGIN
  ALTER TABLE "item_competitor_product_line" ADD CONSTRAINT "item_competitor_product_line_product_id_id_fkey" FOREIGN KEY ("product_id","id") REFERENCES "items"("product_id","id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "item_price_point" ADD COLUMN IF NOT EXISTS "tier_tag" TEXT;
