-- Whether a product is one product or a suite of modules whose competitors differ. Safe to run on a database that already has it.
ALTER TABLE "item_product" ADD COLUMN IF NOT EXISTS "structure" TEXT;
