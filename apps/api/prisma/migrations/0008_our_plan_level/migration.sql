-- Adds the plan level (free, entry, mid, top, enterprise) to our own pricing plans. Safe to run on a database that already has it.
ALTER TABLE "item_pricing_plan" ADD COLUMN IF NOT EXISTS "tier_tag" TEXT;
