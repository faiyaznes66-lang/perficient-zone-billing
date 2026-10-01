CREATE TABLE IF NOT EXISTS einvoice_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  provider_name TEXT,
  status TEXT NOT NULL DEFAULT 'not_connected',
  external_account_ref TEXT,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS einvoice_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  provider_name TEXT,
  status TEXT NOT NULL,
  external_document_ref TEXT,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)