-- 1) Columns
ALTER TABLE public.kyc_documents
  ADD COLUMN IF NOT EXISTS superseded_by uuid
    REFERENCES public.kyc_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

-- 2) Shared supersede function
CREATE OR REPLACE FUNCTION public.supersede_stale_kyc_documents(
  _account_id uuid,
  _approved_doc_id uuid
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  v_id uuid;
BEGIN
  IF _account_id IS NULL OR _approved_doc_id IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_id IN
    SELECT id FROM public.kyc_documents
    WHERE account_id = _account_id
      AND id <> _approved_doc_id
      AND is_current = true
      AND status IN ('rejected','resubmission_required')
  LOOP
    UPDATE public.kyc_documents
      SET is_current = false,
          superseded_by = _approved_doc_id,
          superseded_at = now()
      WHERE id = v_id;

    INSERT INTO public.kyc_audit_log (account_id, document_id, action, actor_role, metadata)
    VALUES (
      _account_id, v_id, 'superseded', 'system',
      jsonb_build_object(
        'superseded_by_document_id', _approved_doc_id,
        'reason', 'newer_approved_document'
      )
    );
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.portal_accounts
     SET kyc_rejection_reason = NULL
   WHERE id = _account_id;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.supersede_stale_kyc_documents(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supersede_stale_kyc_documents(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supersede_stale_kyc_documents(uuid, uuid) TO service_role;

-- 3) Backfill: for each account, if there is a "newer approved" current doc and any
--    older rejected/resubmission-required current doc, supersede the stale ones.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (d.id)
      d.id  AS stale_id,
      d.account_id,
      approved.id AS approved_id
    FROM public.kyc_documents d
    JOIN public.kyc_documents approved
      ON approved.account_id = d.account_id
     AND approved.status = 'approved'
     AND approved.id <> d.id
     AND COALESCE(approved.reviewed_at, approved.uploaded_at)
         > COALESCE(d.reviewed_at, d.uploaded_at)
    WHERE d.is_current = true
      AND d.status IN ('rejected','resubmission_required')
    ORDER BY d.id, COALESCE(approved.reviewed_at, approved.uploaded_at) DESC
  LOOP
    UPDATE public.kyc_documents
       SET is_current = false,
           superseded_by = r.approved_id,
           superseded_at = now()
     WHERE id = r.stale_id;

    INSERT INTO public.kyc_audit_log (account_id, document_id, action, actor_role, metadata)
    VALUES (
      r.account_id, r.stale_id, 'superseded', 'system',
      jsonb_build_object(
        'superseded_by_document_id', r.approved_id,
        'reason', 'newer_approved_document',
        'backfill', true
      )
    );
  END LOOP;

  -- Clear stale rejection reason on any account that is approved.
  UPDATE public.portal_accounts
     SET kyc_rejection_reason = NULL
   WHERE kyc_status = 'approved'
     AND kyc_rejection_reason IS NOT NULL;
END $$;