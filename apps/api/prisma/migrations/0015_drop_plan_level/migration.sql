-- A plan no longer carries a hand-picked level (free, entry, mid, top, enterprise). Where a plan sits is worked out from the prices when it is needed.
ALTER TABLE "item_price_point" DROP COLUMN IF EXISTS "tier_tag";
ALTER TABLE "item_pricing_plan" DROP COLUMN IF EXISTS "tier_tag";
