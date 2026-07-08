
-- 1. Extend KYC document type enum
ALTER TYPE public.kyc_doc_type ADD VALUE IF NOT EXISTS 'voter_id';
ALTER TYPE public.kyc_doc_type ADD VALUE IF NOT EXISTS 'passport';
ALTER TYPE public.kyc_doc_type ADD VALUE IF NOT EXISTS 'rental_agreement';
ALTER TYPE public.kyc_doc_type ADD VALUE IF NOT EXISTS 'other_gov_id';

-- 2. Relax kyc_sensitive_data so non-Aadhaar submissions can be stored.
--    aadhaar_full becomes optional; when present it must still be 12 digits.
ALTER TABLE public.kyc_sensitive_data
  ALTER COLUMN aadhaar_full DROP NOT NULL;

DO $$
DECLARE c_name text;
BEGIN
  SELECT conname INTO c_name
  FROM pg_constraint
  WHERE conrelid = 'public.kyc_sensitive_data'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%aadhaar_full%';
  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.kyc_sensitive_data DROP CONSTRAINT %I', c_name);
  END IF;
END $$;

ALTER TABLE public.kyc_sensitive_data
  ADD CONSTRAINT kyc_sensitive_data_aadhaar_full_check
  CHECK (aadhaar_full IS NULL OR aadhaar_full ~ '^\d{12}$');

-- New column for non-Aadhaar reference numbers (PAN, DL, passport, voter, rental ref, etc.)
ALTER TABLE public.kyc_sensitive_data
  ADD COLUMN IF NOT EXISTS document_reference text;

-- 3. Enable global rollout flag
UPDATE public.feature_flags
  SET enabled = true, updated_at = now()
  WHERE key = 'digilocker_kyc_enabled';
