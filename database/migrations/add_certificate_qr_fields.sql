ALTER TABLE htw_certificate
ADD COLUMN IF NOT EXISTS qr_token VARCHAR(128),
ADD COLUMN IF NOT EXISTS qr_image_base64 TEXT,
ADD COLUMN IF NOT EXISTS qr_generated_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_htw_certificate_qr_token
ON htw_certificate (qr_token)
WHERE qr_token IS NOT NULL;
