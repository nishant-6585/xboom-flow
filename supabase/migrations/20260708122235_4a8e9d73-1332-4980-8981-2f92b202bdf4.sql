
-- Add 'driving_license' to KYC doc type enum (pan already present)
ALTER TYPE public.kyc_doc_type ADD VALUE IF NOT EXISTS 'driving_license';

-- Extend kyc_sensitive_data for DigiLocker token-response identity fields.
ALTER TABLE public.kyc_sensitive_data
  ADD COLUMN IF NOT EXISTS digilockerid       TEXT,
  ADD COLUMN IF NOT EXISTS dob                DATE,
  ADD COLUMN IF NOT EXISTS gender             TEXT,
  ADD COLUMN IF NOT EXISTS consent_valid_till TIMESTAMPTZ;
