-- Migration: Add certificate_id to htw_certificate if missing
-- Run this if you get "column htw_certificate.certificate_id does not exist"

BEGIN;

-- Add certificate_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'htw_certificate' 
    AND column_name = 'certificate_id'
  ) THEN
    -- Add the column (SERIAL = integer with auto-increment)
    ALTER TABLE public.htw_certificate 
      ADD COLUMN certificate_id SERIAL NOT NULL;
    
    -- Drop existing primary key if different
    ALTER TABLE public.htw_certificate 
      DROP CONSTRAINT IF EXISTS htw_certificate_pkey;
    
    -- Add primary key on certificate_id
    ALTER TABLE public.htw_certificate 
      ADD CONSTRAINT htw_certificate_pkey PRIMARY KEY (certificate_id);
  END IF;
END $$;

COMMIT;
