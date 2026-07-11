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