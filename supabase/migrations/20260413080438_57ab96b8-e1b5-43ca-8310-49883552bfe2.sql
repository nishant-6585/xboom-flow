
-- Add unique constraint on session_id for upsert dedup
ALTER TABLE public.abandoned_carts
  ADD CONSTRAINT abandoned_carts_session_id_unique UNIQUE (session_id);

-- Add source column to track origin
ALTER TABLE public.abandoned_carts
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'woocommerce';
