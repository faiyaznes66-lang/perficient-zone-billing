-- Complyance ISV connector, UAE sandbox onboarding, document tracking and webhook inbox.
-- Apply migration 030 first.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS einvoice_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS einvoice_contact_email TEXT,
  ADD COLUMN IF NOT EXISTS einvoice_contact_mobile TEXT,
  ADD COLUMN IF NOT EXISTS einvoice_beneficiary_id TEXT,
  ADD COLUMN IF NOT EXISTS einvoice_principal_trn TEXT;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS buyer_registration_type TEXT NOT NULL DEFAULT 'TL';

ALTER TABLE einvoice_connections
  ADD COLUMN IF NOT EXISTS company_id TEXT,
  ADD COLUMN IF NOT EXISTS source_id TEXT,
  ADD COLUMN IF NOT EXISTS branch_id TEXT,
  ADD COLUMN IF NOT EXISTS source_name TEXT,
  ADD COLUMN IF NOT EXISTS source_version TEXT,
  ADD COLUMN IF NOT EXISTS branch_name TEXT,
  ADD COLUMN IF NOT EXISTS mapping_ready BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_status TEXT;

ALTER TABLE einvoice_documents
  ADD COLUMN IF NOT EXISTS provider_environment TEXT,
  ADD COLUMN IF NOT EXISTS provider_state TEXT,
  ADD COLUMN IF NOT EXISTS provider_is_terminal BOOLEAN,
  ADD COLUMN IF NOT EXISTS provider_compliance JSONB,
  ADD COLUMN IF NOT EXISTS provider_errors JSONB,
  ADD COLUMN IF NOT EXISTS validation_response JSONB;

ALTER TABLE einvoice_inbox
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'sandbox',
  ADD COLUMN IF NOT EXISTS provider_event_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_state TEXT,
  ADD COLUMN IF NOT EXISTS provider_errors JSONB;

ALTER TABLE einvoice_events
  ADD COLUMN IF NOT EXISTS provider_event_id TEXT,
  ADD COLUMN IF NOT EXISTS environment TEXT,
  ADD COLUMN IF NOT EXISTS provider_response JSONB;

CREATE TABLE IF NOT EXISTS einvoice_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code TEXT NOT NULL,
  environment TEXT NOT NULL CHECK(environment IN ('sandbox','production')),
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  payload_json JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  processing_error TEXT,
  UNIQUE(provider_code,environment,provider_event_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_einvoice_documents_outbound_invoice
  ON einvoice_documents(invoice_id)
  WHERE direction='outbound' AND invoice_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_einvoice_documents_provider_ref
  ON einvoice_documents(provider_code,provider_document_id)
  WHERE provider_document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_einvoice_connections_company
  ON einvoice_connections(company_id);

CREATE INDEX IF NOT EXISTS idx_einvoice_inbox_environment
  ON einvoice_inbox(business_id,environment,received_at DESC);

ALTER TABLE einvoice_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE einvoice_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE einvoice_webhook_events ENABLE ROW LEVEL SECURITY;

-- These tables are accessed only by the authenticated application server through its
-- private PostgreSQL connection. No browser/Data API policies are intentionally added.
