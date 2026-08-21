ALTER TABLE public.imports VALIDATE CONSTRAINT imports_currency_check;
ALTER TABLE public.imports VALIDATE CONSTRAINT imports_fx_rate_positive;
ALTER TABLE public.imports VALIDATE CONSTRAINT imports_fx_rate_identity;