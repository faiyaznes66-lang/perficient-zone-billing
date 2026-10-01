CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  item_name TEXT NOT NULL,
  description TEXT,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit TEXT,
  rate NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_percent NUMERIC(6,3) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(6,3) NOT NULL DEFAULT 5,
  tax_category TEXT NOT NULL DEFAULT 'standard',
  line_subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_tax NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0
)