-- Migration: Add admin_rework_comment for certificate rework workflow
-- Run: psql -U postgres -d your_db -f add_certificate_rework.sql

BEGIN;

ALTER TABLE public.htw_certificate 
ADD COLUMN IF NOT EXISTS admin_rework_comment TEXT;

COMMIT;
