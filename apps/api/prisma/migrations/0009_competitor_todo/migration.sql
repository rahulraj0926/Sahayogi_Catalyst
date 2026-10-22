-- Adds the to-do items a person ticked off by hand on a competitor. Safe to run on a database that already has it.
ALTER TABLE "item_competitor" ADD COLUMN IF NOT EXISTS "todo_done" TEXT[];
