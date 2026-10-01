CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT,
  supplier TEXT,
  reference TEXT,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)