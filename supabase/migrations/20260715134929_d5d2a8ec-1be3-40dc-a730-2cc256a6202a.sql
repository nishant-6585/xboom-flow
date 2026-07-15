
-- =====================================================================
-- Soft-deleted orders flow back into the lead funnel.
-- Website orders → new lead. Manual orders → mark source lead lost.
-- Modeled on trg_website_cancelled_to_lead (mig 20260522082811).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.trg_order_deleted_to_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order_tag TEXT;
  _existing_lead_id BIGINT;
  _path TEXT := 'none';
  _target_table TEXT := NULL;
  _target_id TEXT := NULL;
  _note TEXT;
  _enq_outcome TEXT;
  _pipe_status TEXT;
BEGIN
  -- Fire only on the NULL -> NOT NULL delete transition.
  IF NOT (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  _order_tag := COALESCE(NEW.order_number, NEW.id::text);
  _note := 'Order ' || _order_tag || ' deleted: ' || COALESCE(NEW.delete_reason, '(no reason given)');

  BEGIN
    -- =============================================================
    -- (a) WEBSITE orders → new lead row
    -- =============================================================
    IF NEW.external_id IS NOT NULL THEN
      SELECT id INTO _existing_lead_id
      FROM public.leads
      WHERE form_type = 'website_order_deleted'
        AND (
          subject LIKE '%' || _order_tag || '%'
          OR message LIKE '%' || _order_tag || '%'
        )
      LIMIT 1;

      IF _existing_lead_id IS NULL THEN
        INSERT INTO public.leads (
          name, phone, email, company,
          form_type, status, subject, message, created_at
        ) VALUES (
          NEW.customer_name,
          NEW.customer_phone,
          NEW.customer_email,
          NEW.customer_company,
          'website_order_deleted',
          'new',
          'Deleted website order ' || _order_tag,
          'Website order ' || _order_tag
            || ' · product: ' || COALESCE(NEW.product_name, 'unknown')
            || ' · ₹' || COALESCE(NEW.total_sales_amount, 0)::text
            || ' · reason: ' || COALESCE(NEW.delete_reason, '(none)'),
          now()
        )
        RETURNING id INTO _existing_lead_id;
        _path := 'website_lead_created';
        _target_table := 'leads';
        _target_id := _existing_lead_id::text;
      ELSE
        _path := 'website_lead_dedup_skipped';
        _target_table := 'leads';
        _target_id := _existing_lead_id::text;
      END IF;

    -- =============================================================
    -- (b) MANUAL orders → walk linkage; first match wins
    -- =============================================================
    ELSE
      IF NEW.enquiry_id IS NOT NULL THEN
        SELECT order_outcome INTO _enq_outcome
        FROM public.enquiries WHERE id = NEW.enquiry_id;

        IF _enq_outcome = 'won' THEN
          _path := 'enquiry_skipped_won';
        ELSE
          UPDATE public.enquiries
          SET order_outcome     = 'lost',
              lost_reason       = 'other',
              lost_reason_notes = _note,
              outcome_updated_at = now()
          WHERE id = NEW.enquiry_id;
          _path := 'enquiry_marked_lost';
        END IF;
        _target_table := 'enquiries';
        _target_id := NEW.enquiry_id::text;

      ELSIF NEW.source_pipeline_id IS NOT NULL THEN
        SELECT status INTO _pipe_status
        FROM public.pipeline_orders WHERE id = NEW.source_pipeline_id;

        UPDATE public.pipeline_orders
        SET status            = 'lost',
            lost_reason       = 'other',
            lost_reason_notes = _note,
            updated_at        = now()
        WHERE id = NEW.source_pipeline_id;
        _path := 'pipeline_marked_lost';
        _target_table := 'pipeline_orders';
        _target_id := NEW.source_pipeline_id::text;

      ELSIF NEW.email_lead_id IS NOT NULL THEN
        UPDATE public.email_leads
        SET notes = COALESCE(notes || E'\n', '') || _note
        WHERE id = NEW.email_lead_id;
        _path := 'email_lead_noted';
        _target_table := 'email_leads';
        _target_id := NEW.email_lead_id::text;

      ELSE
        -- Generic fallback: no linkage → surface as a followable lead
        SELECT id INTO _existing_lead_id
        FROM public.leads
        WHERE form_type = 'order_deleted'
          AND (
            subject LIKE '%' || _order_tag || '%'
            OR message LIKE '%' || _order_tag || '%'
          )
        LIMIT 1;

        IF _existing_lead_id IS NULL THEN
          INSERT INTO public.leads (
            name, phone, email, company,
            form_type, status, subject, message, created_at
          ) VALUES (
            NEW.customer_name,
            NEW.customer_phone,
            NEW.customer_email,
            NEW.customer_company,
            'order_deleted',
            'new',
            'Deleted order ' || _order_tag
              || ' (source: ' || COALESCE(NEW.lead_source, 'manual') || ')',
            'Order ' || _order_tag
              || ' · product: ' || COALESCE(NEW.product_name, 'unknown')
              || ' · ₹' || COALESCE(NEW.total_sales_amount, 0)::text
              || ' · reason: ' || COALESCE(NEW.delete_reason, '(none)'),
            now()
          )
          RETURNING id INTO _existing_lead_id;
          _path := 'generic_lead_created';
        ELSE
          _path := 'generic_lead_dedup_skipped';
        END IF;
        _target_table := 'leads';
        _target_id := _existing_lead_id::text;
      END IF;
    END IF;

    INSERT INTO public.domain_events (event_type, entity_type, entity_id, payload)
    VALUES (
      'order.deleted_to_lead', 'order', NEW.id,
      jsonb_build_object(
        'order_number', NEW.order_number,
        'path_taken', _path,
        'target_table', _target_table,
        'target_id', _target_id,
        'delete_reason', NEW.delete_reason
      )
    );

  EXCEPTION WHEN OTHERS THEN
    -- Never block the delete itself.
    BEGIN
      INSERT INTO public.domain_events (event_type, entity_type, entity_id, payload)
      VALUES (
        'order.deleted_to_lead_failed', 'order', NEW.id,
        jsonb_build_object(
          'order_number', NEW.order_number,
          'error', SQLERRM,
          'sqlstate', SQLSTATE,
          'delete_reason', NEW.delete_reason
        )
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_deleted_to_lead ON public.orders;
CREATE TRIGGER trg_order_deleted_to_lead
  AFTER UPDATE OF deleted_at ON public.orders
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION public.trg_order_deleted_to_lead();
