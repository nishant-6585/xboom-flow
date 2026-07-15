-- One-off backfill: populate BLANK portal account/contact names from each
-- account's latest order.
--
-- WHY: both onboarding paths set primary_contact_name / full_name only when
-- they first CREATE the account; reused accounts were never refreshed, so some
-- carry a blank name that fails KYC name-matching even though the order name
-- is correct (the SATYAM KUMAR / order 144816 case). The code fix
-- (_shared/backfill-name.ts) stops NEW drift on the next onboarding trigger;
-- this migration corrects the accounts that are ALREADY blank.
--
-- Semantics mirror backfillBlankAccountName(): fill blanks ONLY — never
-- overwrite an intentionally-set name (e.g. a business "Purchasing Dept"
-- contact). Name source = customer_name of the account's contact's most
-- recent order, matched by email (case-insensitive), skipping orders whose
-- customer_name is itself blank.

-- 1. Blank portal_contacts.full_name ← latest order's customer_name.
WITH latest_order_name AS (
  SELECT DISTINCT ON (c.id)
         c.id AS contact_id,
         o.customer_name
  FROM portal_contacts c
  JOIN orders o
    ON lower(o.customer_email) = lower(c.email)
  WHERE coalesce(trim(c.full_name), '') = ''
    AND coalesce(trim(o.customer_name), '') <> ''
  ORDER BY c.id, o.created_at DESC
)
UPDATE portal_contacts c
SET full_name = trim(l.customer_name)
FROM latest_order_name l
WHERE c.id = l.contact_id;

-- 2. Blank portal_accounts.primary_contact_name ← the account's earliest
--    active contact's full_name (which step 1 may have just filled), falling
--    back through inactive contacts if no active one has a name.
WITH best_contact_name AS (
  SELECT DISTINCT ON (c.account_id)
         c.account_id,
         c.full_name
  FROM portal_contacts c
  WHERE coalesce(trim(c.full_name), '') <> ''
  ORDER BY c.account_id,
           c.is_active DESC,      -- prefer active contacts
           c.created_at ASC       -- then the earliest (primary) one
)
UPDATE portal_accounts a
SET primary_contact_name = trim(b.full_name)
FROM best_contact_name b
WHERE a.id = b.account_id
  AND coalesce(trim(a.primary_contact_name), '') = '';

-- 3. Belt-and-braces: accounts still blank (their contact had no usable name
--    either) ← latest order's customer_name via the contact email directly.
WITH acct_order_name AS (
  SELECT DISTINCT ON (c.account_id)
         c.account_id,
         o.customer_name
  FROM portal_contacts c
  JOIN orders o
    ON lower(o.customer_email) = lower(c.email)
  WHERE coalesce(trim(o.customer_name), '') <> ''
  ORDER BY c.account_id, o.created_at DESC
)
UPDATE portal_accounts a
SET primary_contact_name = trim(n.customer_name)
FROM acct_order_name n
WHERE a.id = n.account_id
  AND coalesce(trim(a.primary_contact_name), '') = '';
