-- Adds the audit table for events that belong to no single product. Safe to run on a database that already has it.
CREATE TABLE IF NOT EXISTS "system_audit_log" (
    "seq" BIGSERIAL NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "action" TEXT NOT NULL,
    "subject" TEXT,
    "actor" TEXT,
    "summary" TEXT NOT NULL,
    CONSTRAINT "system_audit_log_pkey" PRIMARY KEY ("seq")
);
CREATE INDEX IF NOT EXISTS "system_audit_log_at_idx" ON "system_audit_log"("at");
CREATE INDEX IF NOT EXISTS "system_audit_log_action_idx" ON "system_audit_log"("action");
