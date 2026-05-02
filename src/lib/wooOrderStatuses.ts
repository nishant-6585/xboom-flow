/**
 * Status routing for WooCommerce (Xboom website) orders.
 *
 * Only orders with one of `WOO_ORDER_STATUSES` are treated as actual website
 * orders and shown on the Orders page. Everything else (pending, failed,
 * cancelled, refunded, etc.) is treated as a sales lead and surfaced in
 * the Sales > Leads > Xboom Website tab.
 *
 * `on-hold` is included as an order status so that orders transitioned to
 * On Hold from inside Xboom (e.g. for manual review) remain visible in the
 * Orders tab and are not silently moved to Leads.
 */
export const WOO_ORDER_STATUSES = ["processing", "on-hold", "completed", "delivered"] as const;

export const isWooOrderStatus = (status: string | null | undefined): boolean => {
  const s = (status || "").toLowerCase();
  return (WOO_ORDER_STATUSES as readonly string[]).includes(s);
};

export const isWooLeadStatus = (status: string | null | undefined): boolean => {
  return !isWooOrderStatus(status);
};