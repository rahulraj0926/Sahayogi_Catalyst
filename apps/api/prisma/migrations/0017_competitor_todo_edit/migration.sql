-- A person can remove or reword the built-in to-do items on a competitor. Safe to run on a database that already has them.
ALTER TABLE "item_competitor" ADD COLUMN IF NOT EXISTS "todo_hidden" TEXT[];
ALTER TABLE "item_competitor" ADD COLUMN IF NOT EXISTS "todo_renamed" TEXT[];
