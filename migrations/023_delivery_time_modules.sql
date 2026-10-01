ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS challan_prefix TEXT NOT NULL DEFAULT 'DC-',
ADD COLUMN IF NOT EXISTS next_challan_number INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS delivery_challans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  challan_number TEXT NOT NULL,
  challan_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  converted_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(business_id,challan_number)
);

CREATE TABLE IF NOT EXISTS delivery_challan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_id UUID NOT NULL REFERENCES delivery_challans(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  item_name TEXT NOT NULL,
  description TEXT,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit TEXT
);

CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  hourly_rate NUMERIC(14,2) NOT NULL DEFAULT 0,
  billable BOOLEAN NOT NULL DEFAULT true,
  billed_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)