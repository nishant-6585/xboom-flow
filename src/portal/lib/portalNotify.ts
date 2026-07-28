import { supabase } from "@/integrations/supabase/client";

export type PortalNotifyEvent =
  | "order_state_changed"
  | "rfq_submitted"
  | "rfq_assigned"
  | "ticket_created"
  | "ticket_message_added"
  | "ticket_status_changed";

/**
 * Fire-and-forget portal notification dispatcher.
 * Failures are logged to console but never thrown — UX must continue
 * even if email/WhatsApp is briefly unavailable.
 */
export async function notifyPortal(
  event_type: PortalNotifyEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("portal-notify", {
      body: { event_type, payload },
    });
    if (error) console.warn("[portal-notify]", event_type, error);
  } catch (e) {
    console.warn("[portal-notify] threw", event_type, e);
  }
}