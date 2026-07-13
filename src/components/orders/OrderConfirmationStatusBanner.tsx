import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, ShieldCheck, Send, Loader2 } from "lucide-react";
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
  const [confirmedBy, setConfirmedBy] = useState<{ name: string | null; email: string | null } | null>(null);

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
      await callEdgeFunction("send-customer-confirmation-request", { body: { order_id: order.id } });
      toast.success("Confirmation request sent to the customer.");
    } catch (e: any) {
      toast.error(e?.message || "Failed to send confirmation request");
    } finally {
      setSending(false);
    }
  };

  if (status === "not_required") {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
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
      <div className="p-3 rounded-lg border border-emerald-300 bg-emerald-50 flex items-start gap-2 text-sm">
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
    <div className="p-4 rounded-lg border border-amber-300 bg-amber-50 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
      <div className="flex items-center gap-3 text-sm">
        <AlertCircle className="h-4 w-4 text-amber-600" />
        <span className="text-amber-900 font-medium">Customer confirmation pending</span>
        <Badge variant="outline" className="border-amber-500 text-amber-700">
          Awaiting customer
        </Badge>
      </div>
      {canResend && (
        <Button size="sm" variant="outline" onClick={resend} disabled={sending}>
          {sending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
          Resend confirmation request
        </Button>
      )}
    </div>
  );
}
