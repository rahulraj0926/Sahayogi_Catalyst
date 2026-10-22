-- Moves the "Something wrong here?" notes from a JSON file into the database. Safe to run on a database that already has the table.
CREATE TABLE IF NOT EXISTS "feedback_notes" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "categories" TEXT[],
    "route" TEXT,
    "product" TEXT,
    "product_name" TEXT,
    "actor" TEXT,
    "at" TEXT,
    "width" INTEGER,
    "words" INTEGER,
    "done" BOOLEAN NOT NULL,
    "done_at" TEXT,
    "done_by" TEXT,
    CONSTRAINT "feedback_notes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "feedback_notes_done_idx" ON "feedback_notes"("done");
