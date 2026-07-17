-- Response Notes textarea has been removed from the enquiry UI; only the
-- Respond & Discuss thread captures free-form responder text now. The
-- previously-added length/whitespace guard on enquiries.response_notes would
-- reject legitimate submissions on legacy records with short/blank notes,
-- so drop the trigger and its function.
DROP TRIGGER IF EXISTS trg_validate_enquiry_response_notes ON public.enquiries;
DROP FUNCTION IF EXISTS public.validate_enquiry_response_notes();