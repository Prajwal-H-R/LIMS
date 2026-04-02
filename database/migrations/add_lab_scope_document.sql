-- Laboratory scope: optional attached document (PDF / Word / Excel) stored in database.
-- Run against your application database (PostgreSQL BYTEA).

ALTER TABLE lab_scope
  ADD COLUMN IF NOT EXISTS document_data BYTEA NULL,
  ADD COLUMN IF NOT EXISTS document_filename VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS document_content_type VARCHAR(128) NULL;
