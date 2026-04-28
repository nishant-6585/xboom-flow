/**
 * Status routing for WooCommerce (Xboom website) orders.
 *
 * Only orders with one of `WOO_ORDER_STATUSES` are treated as actual website
 * orders and shown on the Orders page. Everything else (pending, on-hold,
 * failed, cancelled, refunded, etc.) is treated as a sales lead and surfaced
 * in the Sales > Leads > Xboom Website tab.
 */
export const WOO_ORDER_STATUSES = ["processing", "completed", "delivered"] as const;

export const isWooOrderStatus = (status: string | null | undefined): boolean => {
  const s = (status || "").toLowerCase();
  return (WOO_ORDER_STATUSES as readonly string[]).includes(s);
};

export const isWooLeadStatus = (status: string | null | undefined): boolean => {
  return !isWooOrderStatus(status);
};