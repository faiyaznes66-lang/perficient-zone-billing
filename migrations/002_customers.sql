CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  company TEXT,
  email TEXT,
  phone TEXT,
  billing_address TEXT,
  trn TEXT,
  currency TEXT NOT NULL DEFAULT 'AED',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)