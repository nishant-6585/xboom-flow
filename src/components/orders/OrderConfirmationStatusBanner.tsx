import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, ShieldCheck, Send, Loader2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { callEdgeFunction } from "@/lib/callEdgeFunction";

interface Props {
  order: any;
  canResend: boolean;
}

/**
 * Compact banner showing the customer-confirmation state for a weight-gated
 * order (any item over 249 g). Renders:
 *  - "Not required" (grey) — nothing to do
 *  - "Pending" (amber) — admins / sales can resend the confirmation request
 *  - "Confirmed on <date>" (green)
 */
export function OrderConfirmationStatusBanner({ order, canResend }: Props) {
  const status: string = order?.confirmation_status || "not_required";
  const [sending, setSending] = useState(false);
  const [inviting, setInviting] = useState(false);
  /** null = loading, true = customer has an activated portal user,
   *  false = no portal account or invite unused. Drives which action
   *  the admin sees ("Invite customer" vs "Resend confirmation"). */
  const [hasPortalUser, setHasPortalUser] = useState<boolean | null>(null);
  const [confirmedBy, setConfirmedBy] = useState<{ name: string | null; email: string | null } | null>(null);

  const refreshPortalState = async () => {
    if (!order?.customer_email) { setHasPortalUser(false); return; }
    const { data } = await supabase
      .from("portal_contacts")
      .select("auth_user_id")
      .ilike("email", order.customer_email)
      .not("auth_user_id", "is", null)
      .maybeSingle();
    setHasPortalUser(!!data?.auth_user_id);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!order?.customer_email || status === "not_required") { if (alive) setHasPortalUser(null); return; }
      const { data } = await supabase
        .from("portal_contacts")
        .select("auth_user_id")
        .ilike("email", order.customer_email)
        .not("auth_user_id", "is", null)
        .maybeSingle();
      if (alive) setHasPortalUser(!!data?.auth_user_id);
    })();
    return () => { alive = false; };
  }, [order?.customer_email, status]);

  useEffect(() => {
    let alive = true;
    if (status !== "confirmed" || !order?.id) {
      setConfirmedBy(null);
      return;
    }
    (async () => {
      const { data, error } = await (supabase as any).rpc("get_order_confirmation_details", {
        p_order_id: order.id,
      });
      if (!alive || error) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) setConfirmedBy({ name: row.contact_name ?? null, email: row.contact_email ?? null });
    })();
    return () => {
      alive = false;
    };
  }, [status, order?.id]);

  const resend = async () => {
    setSending(true);
    try {
      const res: any = await callEdgeFunction("send-customer-confirmation-request", { body: { order_id: order.id } });
      // Server returns { ok, email?: 'sent'|'failed:<status>'|'no_email'|'error', sms?, skipped? }
      if (res?.skipped === "not_required") {
        toast.info("This order does not require customer confirmation — nothing sent.");
      } else if (res?.skipped === "already_confirmed") {
        toast.info("Customer has already confirmed this order.");
      } else if (res?.email === "sent") {
        const bits = ["Email delivered"];
        if (res?.sms === "queued") bits.push("SMS queued");
        toast.success(`Confirmation request sent — ${bits.join(", ")}.`);
      } else if (typeof res?.email === "string" && res.email.startsWith("failed")) {
        toast.error(`Email failed (${res.email}). SMS ${res?.sms ?? "n/a"}.`);
      } else if (res?.email === "no_email") {
        toast.warning("No customer email on this order — nothing sent.");
      } else {
        toast.success("Confirmation request dispatched.");
      }
      await refreshPortalState();
    } catch (e: any) {
      toast.error(e?.message || "Failed to send confirmation request");
    } finally {
      setSending(false);
    }
  };

  const invite = async () => {
    setInviting(true);
    try {
      // Same endpoint — it mints portal_account + auth user + invite when
      // missing, and sends the confirmation email with a "Set your password"
      // fallback link. Logs to order_notifications (status_trigger=confirmation_request).
      const res: any = await callEdgeFunction("send-customer-confirmation-request", { body: { order_id: order.id } });
      if (res?.skipped === "not_required") {
        toast.info("This order does not require customer confirmation — no invite sent.");
      } else if (res?.email && String(res.email).startsWith("failed")) {
        toast.error(`Invite failed: ${res.email}`);
      } else {
        toast.success("Portal invite sent — customer will receive an activation email.");
      }
      await refreshPortalState();
    } catch (e: any) {
      toast.error(e?.message || "Failed to send portal invite");
    } finally {
      setInviting(false);
    }
  };

  if (status === "not_required") {
    return (
      <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        <span>Customer confirmation:</span>
        <Badge variant="outline">Not required</Badge>
      </div>
    );
  }

  if (status === "confirmed") {
    const who = confirmedBy?.name || confirmedBy?.email || "Customer";
    const when = order.confirmed_at
      ? format(new Date(order.confirmed_at), "dd MMM yyyy, HH:mm")
      : null;
    return (
      <div className="mt-6 p-3 rounded-lg border border-emerald-300 bg-emerald-50 flex items-start gap-2 text-sm">
        <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
        <div className="text-emerald-900">
          <div className="font-medium">
            Confirmed by {who}
            {when ? ` on ${when}` : ""}
          </div>
          {confirmedBy?.email && confirmedBy?.name && (
            <div className="text-xs text-emerald-800/80">{confirmedBy.email}</div>
          )}
        </div>
      </div>
    );
  }

  // pending
  return (
    <div className="mt-6 p-4 rounded-lg border border-amber-300 bg-amber-50 flex flex-col lg:flex-row lg:items-center gap-3 lg:justify-between min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm min-w-0">
        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
        <span className="text-amber-900 font-medium">Customer confirmation pending</span>
        <Badge variant="outline" className="border-amber-500 text-amber-700 whitespace-nowrap">
          Awaiting customer
        </Badge>
        {hasPortalUser === false && (
          <Badge variant="outline" className="border-orange-500 text-orange-700 whitespace-nowrap">
            No portal account
          </Badge>
        )}
      </div>
      {canResend && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {hasPortalUser === false && (
            <Button size="sm" variant="default" onClick={invite} disabled={inviting} className="whitespace-nowrap">
              {inviting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <UserPlus className="h-3.5 w-3.5 mr-1" />}
              Invite customer
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={resend} disabled={sending} className="whitespace-nowrap">
            {sending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
            Resend confirmation request
          </Button>
        </div>
      )}
    </div>
  );
}
