
-- Add retry_count column
ALTER TABLE public.email_leads ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;

-- Update claim function to also pick up retryable failed leads
CREATE OR REPLACE FUNCTION public.claim_pending_email_leads(p_batch_size integer DEFAULT 10, p_specific_lead_id uuid DEFAULT NULL)
RETURNS SETOF email_leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_specific_lead_id IS NOT NULL THEN
    RETURN QUERY
    UPDATE public.email_leads
    SET processing_status = 'processing', updated_at = now()
    WHERE id = p_specific_lead_id
      AND processing_status IN ('pending', 'failed')
      AND retry_count < 3
    RETURNING *;
  ELSE
    RETURN QUERY
    UPDATE public.email_leads
    SET processing_status = 'processing', updated_at = now()
    WHERE id IN (
      SELECT el.id FROM public.email_leads el
      WHERE el.processing_status IN ('pending')
        AND el.ai_processed = false
      ORDER BY el.created_at ASC
      LIMIT p_batch_size
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *;
  END IF;
END;
$$;
