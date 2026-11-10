-- UAE eInvoicing readiness, immutable document records, inbound inbox and credit-note foundation.
-- Provider credentials are stored encrypted; never store API secrets as plaintext.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS tin_number TEXT,
  ADD COLUMN IF NOT EXISTS trade_license_number TEXT,
  ADD COLUMN IF NOT EXISTS trade_license_authority TEXT,
  ADD COLUMN IF NOT EXISTS einvoice_scope_status TEXT NOT NULL DEFAULT 'not_assessed',
  ADD COLUMN IF NOT EXISTS einvoice_revenue_band TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS einvoice_is_tax_group_member BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS einvoice_branch_trade_license_number TEXT;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS electronic_address_scheme TEXT NOT NULL DEFAULT '0235',
  ADD COLUMN IF NOT EXISTS einvoice_buyer_type TEXT NOT NULL DEFAULT 'business';

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS einvoice_document_type TEXT NOT NULL DEFAULT 'tax_invoice',
  ADD COLUMN IF NOT EXISTS einvoice_buyer_type TEXT NOT NULL DEFAULT 'business',
  ADD COLUMN IF NOT EXISTS einvoice_transaction_type_code CHAR(8) NOT NULL DEFAULT '00000000',
  ADD COLUMN IF NOT EXISTS einvoice_business_process_type TEXT,
  ADD COLUMN IF NOT EXISTS einvoice_payment_means_code TEXT,
  ADD COLUMN IF NOT EXISTS einvoice_status TEXT NOT NULL DEFAULT 'not_prepared',
  ADD COLUMN IF NOT EXISTS einvoice_last_error TEXT,
  ADD COLUMN IF NOT EXISTS einvoice_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS einvoice_provider_document_id TEXT;

ALTER TABLE einvoice_connections
  ADD COLUMN IF NOT EXISTS provider_code TEXT,
  ADD COLUMN IF NOT EXISTS accreditation_number TEXT,
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'sandbox',
  ADD COLUMN IF NOT EXISTS participant_id TEXT,
  ADD COLUMN IF NOT EXISTS credentials_ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS credentials_iv TEXT,
  ADD COLUMN IF NOT EXISTS credentials_auth_tag TEXT,
  ADD COLUMN IF NOT EXISTS credentials_key_version TEXT,
  ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE einvoice_events
  ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'outbound',
  ADD COLUMN IF NOT EXISTS event_type TEXT,
  ADD COLUMN IF NOT EXISTS status_code TEXT,
  ADD COLUMN IF NOT EXISTS external_message_ref TEXT,
  ADD COLUMN IF NOT EXISTS payload JSONB;

CREATE TABLE IF NOT EXISTS credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  original_invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  credit_note_number TEXT NOT NULL,
  credit_note_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'AED',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  taxable_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_amount_aed NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  einvoice_status TEXT NOT NULL DEFAULT 'not_prepared',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(business_id,credit_note_number)
);

CREATE TABLE IF NOT EXISTS credit_note_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id UUID NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  item_name TEXT NOT NULL,
  description TEXT,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit TEXT,
  rate NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(6,3) NOT NULL DEFAULT 0,
  tax_category TEXT NOT NULL DEFAULT 'standard',
  line_subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_tax NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS einvoice_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE RESTRICT,
  credit_note_id UUID REFERENCES credit_notes(id) ON DELETE RESTRICT,
  direction TEXT NOT NULL CHECK(direction IN ('outbound','inbound')),
  document_type TEXT NOT NULL CHECK(document_type IN ('invoice','credit_note')),
  status TEXT NOT NULL DEFAULT 'prepared',
  provider_code TEXT,
  provider_document_id TEXT,
  provider_message_id TEXT,
  document_uuid TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  xml_payload TEXT,
  payload_sha256 TEXT,
  provider_response JSONB,
  last_error TEXT,
  issued_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  exchanged_at TIMESTAMPTZ,
  reported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((direction='inbound') OR (invoice_id IS NOT NULL OR credit_note_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS einvoice_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  provider_code TEXT NOT NULL,
  provider_document_id TEXT NOT NULL,
  sender_name TEXT,
  sender_tin TEXT,
  sender_trn TEXT,
  sender_endpoint TEXT,
  document_number TEXT,
  document_type TEXT NOT NULL DEFAULT 'invoice',
  issue_date DATE,
  due_date DATE,
  currency TEXT NOT NULL DEFAULT 'AED',
  total NUMERIC(14,2),
  tax_amount NUMERIC(14,2),
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  xml_payload TEXT,
  status TEXT NOT NULL DEFAULT 'received',
  linked_expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(business_id,provider_code,provider_document_id)
);

CREATE INDEX IF NOT EXISTS idx_credit_notes_business_date ON credit_notes(business_id,credit_note_date DESC);
CREATE INDEX IF NOT EXISTS idx_credit_notes_original_invoice ON credit_notes(original_invoice_id);
CREATE INDEX IF NOT EXISTS idx_einvoice_documents_business_created ON einvoice_documents(business_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_einvoice_documents_invoice ON einvoice_documents(invoice_id);
CREATE INDEX IF NOT EXISTS idx_einvoice_inbox_business_received ON einvoice_inbox(business_id,received_at DESC);
CREATE INDEX IF NOT EXISTS idx_einvoice_events_business_created ON einvoice_events(business_id,created_at DESC);

ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_note_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE einvoice_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE einvoice_inbox ENABLE ROW LEVEL SECURITY;
