CREATE TABLE IF NOT EXISTS customer_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  storage_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_documents_customer ON customer_documents(customer_id)