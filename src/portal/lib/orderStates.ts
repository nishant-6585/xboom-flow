export type PortalOrderState =
  | "draft"
  | "quote_sent"
  | "quote_revised"
  | "approved"
  | "po_received"
  | "confirmed"
  | "in_production"
  | "qc_ready"
  | "dispatched"
  | "delivered"
  | "closed"
  | "cancelled";

/** Customer-facing ordered timeline of the happy-path lifecycle. */
export const CUSTOMER_TIMELINE: PortalOrderState[] = [
  "quote_sent",
  "approved",
  "confirmed",
  "in_production",
  "qc_ready",
  "dispatched",
  "delivered",
];

export const STATE_LABELS: Record<PortalOrderState, string> = {
  draft: "Draft",
  quote_sent: "Quote sent",
  quote_revised: "Quote revised",
  approved: "Quote approved",
  po_received: "PO received",
  confirmed: "Order confirmed",
  in_production: "In production",
  qc_ready: "QC ready",
  dispatched: "Dispatched",
  delivered: "Delivered",
  closed: "Closed",
  cancelled: "Cancelled",
};

export const STATE_DESCRIPTIONS: Record<PortalOrderState, string> = {
  draft: "Your order is being drafted by our team.",
  quote_sent: "Quote shared with you for review.",
  quote_revised: "Quote revised based on your feedback.",
  approved: "Quote approved — preparing order confirmation.",
  po_received: "Purchase order received from your team.",
  confirmed: "Order confirmed and queued for production.",
  in_production: "Your units are being built and configured.",
  qc_ready: "Quality checks complete — ready for dispatch.",
  dispatched: "Shipped — track your package below.",
  delivered: "Delivered. Thank you for choosing xboom.",
  closed: "Order closed.",
  cancelled: "Order cancelled.",
};

export function stateBadgeTone(state: PortalOrderState): "neutral" | "info" | "warn" | "success" | "danger" {
  switch (state) {
    case "delivered":
    case "closed":
      return "success";
    case "dispatched":
    case "qc_ready":
      return "info";
    case "in_production":
    case "confirmed":
    case "po_received":
    case "approved":
      return "warn";
    case "cancelled":
      return "danger";
    default:
      return "neutral";
  }
}

export function timelineProgress(state: PortalOrderState): number {
  if (state === "cancelled") return -1;
  const idx = CUSTOMER_TIMELINE.indexOf(state);
  if (idx >= 0) return idx;
  // Pre-quote / draft / revised states map to before quote_sent.
  if (state === "draft" || state === "quote_revised") return -1;
  if (state === "po_received") return CUSTOMER_TIMELINE.indexOf("approved");
  if (state === "closed") return CUSTOMER_TIMELINE.length - 1;
  return -1;
}