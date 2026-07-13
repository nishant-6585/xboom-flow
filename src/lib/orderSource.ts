/**
 * Order source helpers.
 *
 * Invariant (see plan): a row in public.orders is "Woo-linked" when
 * `external_id` is present — this is permanent and drives WooCommerce
 * sync + UI affordances. `source === 'website'` means the row is still
 * an unattributed website-feed row; attribution flips it to 'manual'
 * while keeping `external_id` + `lead_source='website'` as provenance.
 */
export const isWooLinked = (o?: { external_id?: string | null } | null): boolean =>
  !!o?.external_id;

export const isUnattributedWebsiteFeed = (
  o?: { source?: string | null } | null,
): boolean => (o?.source ?? null) === 'website';

/** True for Woo-origin orders that have been attributed to a rep. */
export const isTransferredFromWebsite = (
  o?: { external_id?: string | null; source?: string | null } | null,
): boolean => isWooLinked(o) && !isUnattributedWebsiteFeed(o);

/**
 * WooCommerce system ingestion user. Every website order is initially
 * owned by this profile; attribution flips `sales_person_id` to the real
 * rep, which is what removes the row from the "WooCommerce (Vishal)"
 * pool. Keep this constant in one place — do not re-hardcode.
 */
export const SYSTEM_USER_ID = 'a8050cc3-7d17-44ac-a083-d8023d505331';

export const isSystemOwned = (
  o?: { sales_person_id?: string | null } | null,
): boolean => (o?.sales_person_id ?? null) === SYSTEM_USER_ID;

/**
 * Analytics predicate: treat a row as "website / unattributed" for analytics
 * purposes when it is either an unattributed website-feed row OR still owned
 * by the system ingestion user (`SYSTEM_USER_ID`). The latter covers legacy
 * backfilled orders whose `source` was flipped to 'manual' but which were
 * never actually attributed to a rep.
 *
 * Use this everywhere analytics historically tested `source === 'website'`.
 * The moment an order is attributed, `sales_person_id` changes and it
 * automatically leaves this bucket, joining the rep's numbers.
 */
export const isAnalyticsWebsite = (
  o?: { source?: string | null; sales_person_id?: string | null } | null,
): boolean => isUnattributedWebsiteFeed(o) || isSystemOwned(o);