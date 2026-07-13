// Pure gating helpers extracted from woo-mirror so they're unit-testable
// without a live Supabase client. `mirrorIntoInternalOrders` calls these
// after the order_items insert to decide which downstream email/onboarding
// flow to run.

export type WooMirrorOrderGate = {
  requires_confirmation: boolean | null | undefined;
  confirmation_status: string | null | undefined;
  customer_email: string | null | undefined;
};

export type WooMirrorGateAction =
  | "send_confirmation"
  | "send_portal_welcome"
  | "skip_no_email"
  | "skip_cancelled"
  | "skip_confirmed"
  | "skip_existing";

export interface GateInput {
  order: WooMirrorOrderGate;
  wooStatus: string;
  isNew: boolean;
}

/**
 * Decides which post-items email/onboarding flow to run for a mirrored
 * WooCommerce order. Deterministic — pass the freshly-read order row
 * (after order_items insert flipped requires_confirmation).
 */
export function decideWooMirrorAction({ order, wooStatus, isNew }: GateInput): WooMirrorGateAction {
  if (wooStatus === "cancelled") return "skip_cancelled";
  if (!order.customer_email) return "skip_no_email";
  if (order.confirmation_status === "confirmed") return "skip_confirmed";
  if (order.requires_confirmation === true) return "send_confirmation";
  return isNew ? "send_portal_welcome" : "skip_existing";
}