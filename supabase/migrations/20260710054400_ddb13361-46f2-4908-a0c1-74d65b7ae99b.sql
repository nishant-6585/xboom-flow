
CREATE TABLE public.ai_kyc_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.portal_accounts(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.kyc_documents(id) ON DELETE CASCADE,
  extracted_doc_type TEXT,
  extracted_holder_name TEXT,
  extracted_number_masked TEXT,
  declared_doc_type TEXT,
  declared_number_masked TEXT,
  expected_name TEXT,
  name_match_score NUMERIC(5,3),
  number_match BOOLEAN,
  type_match BOOLEAN,
  legibility TEXT,
  ai_confidence NUMERIC(5,3),
  recommendation TEXT NOT NULL DEFAULT 'unclear',
  decision TEXT NOT NULL DEFAULT 'pending',
  flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  model TEXT,
  raw_response JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ai_kyc_reviews_document_id_idx ON public.ai_kyc_reviews(document_id);
CREATE INDEX ai_kyc_reviews_account_id_idx ON public.ai_kyc_reviews(account_id);

GRANT SELECT ON public.ai_kyc_reviews TO authenticated;
GRANT ALL ON public.ai_kyc_reviews TO service_role;

ALTER TABLE public.ai_kyc_reviews ENABLE ROW LEVEL SECURITY;

-- Only admin / finance / sales / sales_manager can read AI review rows.
CREATE POLICY "Staff can view AI KYC reviews"
  ON public.ai_kyc_reviews
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'finance'::app_role) OR
    public.has_role(auth.uid(), 'sales'::app_role) OR
    public.has_role(auth.uid(), 'sales_manager'::app_role)
  );

-- Writes only via service role (edge functions). No INSERT/UPDATE/DELETE policies for authenticated.

CREATE OR REPLACE FUNCTION public.tg_ai_kyc_reviews_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ai_kyc_reviews_updated_at
  BEFORE UPDATE ON public.ai_kyc_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_ai_kyc_reviews_updated_at();
