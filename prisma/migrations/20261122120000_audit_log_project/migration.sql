-- Connect audit log entries to a project, so the activity overview can show
-- which project an edit belongs to. Additive: one nullable column and an index.
ALTER TABLE "audit_logs" ADD COLUMN "project_id" TEXT;

CREATE INDEX "idx_audit_logs_project_created_at" ON "audit_logs"("project_id", "created_at");

-- Backfill existing entries. Project entries carry the project id as entity id;
-- document entries carry it in their metadata.
UPDATE "audit_logs"
SET "project_id" = "entity_id"
WHERE "entity_type" IN ('Project', 'project') AND "entity_id" IS NOT NULL;

UPDATE "audit_logs"
SET "project_id" = "metadata"->>'projectId'
WHERE "project_id" IS NULL AND "metadata"->>'projectId' IS NOT NULL;
