
-- Add new columns to outbound_contacts
ALTER TABLE public.outbound_contacts
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'hospitality',
  ADD COLUMN IF NOT EXISTS source_sheet TEXT,
  ADD COLUMN IF NOT EXISTS is_prospect BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_attention BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS attention_reason TEXT,
  ADD COLUMN IF NOT EXISTS attention_marked_by TEXT,
  ADD COLUMN IF NOT EXISTS attention_marked_at TIMESTAMPTZ;

-- Add index for source_type filtering
CREATE INDEX IF NOT EXISTS idx_outbound_contacts_source_type ON public.outbound_contacts(source_type);
CREATE INDEX IF NOT EXISTS idx_outbound_contacts_is_prospect ON public.outbound_contacts(is_prospect);
CREATE INDEX IF NOT EXISTS idx_outbound_contacts_needs_attention ON public.outbound_contacts(needs_attention);
