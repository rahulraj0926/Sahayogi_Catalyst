-- The to-do items a person added by hand on a competitor (the ticked ones stay in todo_done). Safe to run on a database that already has it.
ALTER TABLE "item_competitor" ADD COLUMN IF NOT EXISTS "todo_items" TEXT[];
