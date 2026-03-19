
UPDATE public.interakt_leads
SET interakt_created_at = 
  COALESCE(
    (interakt_traits->>'created_at_utc')::timestamptz,
    (interakt_traits->>'created_at')::timestamptz,
    (interakt_traits->>'createdAt')::timestamptz
  )
WHERE interakt_created_at IS NULL
  AND interakt_traits IS NOT NULL
  AND (
    interakt_traits->>'created_at_utc' IS NOT NULL
    OR interakt_traits->>'created_at' IS NOT NULL
    OR interakt_traits->>'createdAt' IS NOT NULL
  );
