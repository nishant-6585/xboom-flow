-- Backfill lead_created_at for existing interakt outbound call logs
UPDATE outbound_call_logs o
SET lead_created_at = i.interakt_created_at
FROM interakt_leads i
WHERE o.lead_id = i.id::text
  AND o.lead_source = 'interakt'
  AND o.lead_created_at IS NULL
  AND i.interakt_created_at IS NOT NULL;

-- Also backfill for myoperator leads
UPDATE outbound_call_logs o
SET lead_created_at = c.created_at
FROM call_logs c
WHERE o.lead_id = c.id::text
  AND o.lead_source = 'myoperator'
  AND o.lead_created_at IS NULL;