-- Adds the parts of our product (modules or areas) a competitor competes with. Safe to run on a database that already has it.
ALTER TABLE "item_competitor" ADD COLUMN IF NOT EXISTS "scopes" TEXT[];
