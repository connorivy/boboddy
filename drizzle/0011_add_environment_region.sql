ALTER TABLE "environments"
ADD COLUMN IF NOT EXISTS "region" text NOT NULL DEFAULT 'unknown';
