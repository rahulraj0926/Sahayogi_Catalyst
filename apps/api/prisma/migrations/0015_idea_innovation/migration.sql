-- The innovation step: an idea first sits in innovation while its pitcher fills in the problem, who it is for, a demo link and a list of real competitors, and only then goes to the CEO.
-- Also gives the CEO's decision (who, when, why) the columns it was always written to. Safe to run on a database that already has them.
ALTER TABLE "ideas" ADD COLUMN IF NOT EXISTS "problem" TEXT;
ALTER TABLE "ideas" ADD COLUMN IF NOT EXISTS "who_for" TEXT;
ALTER TABLE "ideas" ADD COLUMN IF NOT EXISTS "demo_url" TEXT;
ALTER TABLE "ideas" ADD COLUMN IF NOT EXISTS "decided_by" TEXT;
ALTER TABLE "ideas" ADD COLUMN IF NOT EXISTS "decided_at" TEXT;
ALTER TABLE "ideas" ADD COLUMN IF NOT EXISTS "reject_reason" TEXT;
CREATE TABLE IF NOT EXISTS "idea_competitors" (
    "idea_id" TEXT NOT NULL REFERENCES "ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT NOT NULL,
    "note" TEXT,
    "demo_url" TEXT,
    "check_status" TEXT NOT NULL,
    "http_status" INTEGER NOT NULL,
    "title" TEXT,
    "final_url" TEXT NOT NULL,
    "checked_at" TEXT NOT NULL,
    CONSTRAINT "idea_competitors_pkey" PRIMARY KEY ("idea_id", "id")
);
