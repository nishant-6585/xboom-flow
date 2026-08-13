CREATE OR REPLACE FUNCTION public.get_prospect_followup_tracker()
RETURNS TABLE(
  prospect_id uuid,
  customer_name text,
  customer_company text,
  product_name text,
  quantity integer,
  quoted_price numeric,
  prospect_status text,
  owner_id uuid,
  owner_name text,
  lead_source text,
  phone text,
  email text,
  city text,
  is_a_category boolean,
  created_at timestamp with time zone,
  followup_count integer,
  last_followup_at timestamp with time zone,
  last_followup_mode text,
  last_followup_outcome text,
  last_followup_remark text,
  last_followup_by text,
  last_sequence_no integer,
  next_followup_at timestamp with time zone,
  next_followup_id uuid
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT
    p.id,
    p.customer_name,
    COALESCE(p.customer_company, p.company),
    p.product_name,
    p.quantity,
    p.quoted_price,
    p.status,
    p.created_by,
    p.created_by_name,
    p.lead_source,
    p.phone_number,
    p.email,
    p.city,
    COALESCE(p.is_a_category, false),
    p.created_at,
    COALESCE(done.cnt, 0)::int,
    done.last_at,
    done.last_mode,
    done.last_outcome,
    done.last_remark,
    done.last_by,
    COALESCE(done.last_seq, 0)::int,
    nxt.followup_at,
    nxt.id
  FROM public.prospects p
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt,
           max(f.followup_at) AS last_at,
           (array_agg(f.mode ORDER BY f.followup_at DESC))[1] AS last_mode,
           (array_agg(f.outcome ORDER BY f.followup_at DESC))[1] AS last_outcome,
           (array_agg(f.remark ORDER BY f.followup_at DESC))[1] AS last_remark,
           (array_agg(COALESCE(f.completed_by_name, f.created_by_name) ORDER BY f.followup_at DESC))[1] AS last_by,
           max(f.sequence_no) AS last_seq
    FROM public.followups f
    WHERE f.source_type = 'prospect' AND f.source_id = p.id AND f.status = 'completed'
  ) done ON true
  LEFT JOIN LATERAL (
    SELECT f.id, f.followup_at
    FROM public.followups f
    WHERE f.source_type = 'prospect' AND f.source_id = p.id AND f.status = 'pending'
    ORDER BY f.followup_at ASC
    LIMIT 1
  ) nxt ON true;
$function$;

REVOKE ALL ON FUNCTION public.get_prospect_followup_tracker() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_prospect_followup_tracker() TO authenticated;