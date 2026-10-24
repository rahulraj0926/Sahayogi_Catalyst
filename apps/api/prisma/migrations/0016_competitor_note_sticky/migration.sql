-- A competitor note can carry bold, italic and tick boxes (html) and be pinned. Safe to run on a database that already has them.
ALTER TABLE "item_competitor_note" ADD COLUMN IF NOT EXISTS "html" TEXT;
ALTER TABLE "item_competitor_note" ADD COLUMN IF NOT EXISTS "pinned" BOOLEAN;
