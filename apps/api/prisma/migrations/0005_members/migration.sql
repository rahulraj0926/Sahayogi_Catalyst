-- Adds the team list: who is on the platform, on one project, or on one phase. Safe to run on a database that already has the table.
CREATE TABLE IF NOT EXISTS "members" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "role" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "product_id" TEXT,
    "product_name" TEXT,
    "phase" INTEGER,
    "added_by" TEXT,
    "added_at" TEXT,
    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "members_product_idx" ON "members"("product_id");
