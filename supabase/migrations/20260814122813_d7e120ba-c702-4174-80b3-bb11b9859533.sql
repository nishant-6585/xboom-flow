DROP TRIGGER IF EXISTS trg_auto_junk_call_logs ON public.call_logs;

UPDATE public.call_logs
   SET disposition = 'untouched'::public.lead_disposition,
       disposition_reason_code = NULL,
       disposition_reason_note = NULL,
       disposition_at = NULL,
       disposition_by_name = NULL
 WHERE disposition = 'junk'::public.lead_disposition
   AND disposition_reason_code = 'auto_no_enquiry';