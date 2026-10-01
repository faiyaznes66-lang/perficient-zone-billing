CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  project_name TEXT NOT NULL,
  project_code TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  start_date DATE,
  end_date DATE,
  budget NUMERIC(14,2) NOT NULL DEFAULT 0,
  billing_method TEXT NOT NULL DEFAULT 'time_and_materials',
  hourly_rate NUMERIC(14,2) NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE time_entries
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS billable BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS billed_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS bad_debt_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  refund_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(14,2) NOT NULL,
  method TEXT,
  reference TEXT,
  reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bank_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  charge_date DATE NOT NULL DEFAULT CURRENT_DATE,
  bank_name TEXT,
  reference TEXT,
  amount NUMERIC(14,2) NOT NULL,
  vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bad_debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  writeoff_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(14,2) NOT NULL,
  reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  review_date DATE NOT NULL DEFAULT CURRENT_DATE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT,
  review_text TEXT,
  source TEXT,
  public_permission BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_business ON projects(business_id);
CREATE INDEX IF NOT EXISTS idx_refunds_business ON refunds(business_id);
CREATE INDEX IF NOT EXISTS idx_bank_charges_business ON bank_charges(business_id);
CREATE INDEX IF NOT EXISTS idx_bad_debts_business ON bad_debts(business_id);
CREATE INDEX IF NOT EXISTS idx_reviews_business ON customer_reviews(business_id)