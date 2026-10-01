ALTER TABLE customers
ADD COLUMN IF NOT EXISTS portal_token UUID NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_portal_token ON customers(portal_token)