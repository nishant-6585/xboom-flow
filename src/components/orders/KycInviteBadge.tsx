import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Send, CheckCircle2, XCircle, MinusCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  orderId: string;
  customerEmail?: string | null;
}

interface LogRow {
  id: string;
  status: "sent" | "failed" | "skipped" | "pending";
  error: string | null;
  attempt_count: number;
  recipient_email: string | null;
  created_at: string;
}

const STATUS_META: Record<string, { label: string; variant: any; Icon: any; cls: string }> = {
  sent: { label: "KYC Invite: Sent", variant: "default", Icon: CheckCircle2, cls: "bg-emerald-600 hover:bg-emerald-600" },
  failed: { label: "KYC Invite: Failed", variant: "destructive", Icon: XCircle, cls: "" },
  skipped: { label: "KYC Invite: Skipped", variant: "secondary", Icon: MinusCircle, cls: "" },
  pending: { label: "KYC Invite: Pending", variant: "outline", Icon: Clock, cls: "" },
};

export function KycInviteBadge({ orderId, customerEmail }: Props) {
  const { roles } = useAuth();
  const canResend =
    Array.isArray(roles) &&
    roles.some((r) => ["admin", "sales", "sales_manager"].includes(r));
  const [row, setRow] = useState<LogRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase.from("kyc_email_log") as any)
      .select("id, status, error, attempt_count, recipient_email, created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setRow((data as LogRow | null) ?? null);
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    if (orderId) load();
  }, [orderId, load]);

  const resend = async () => {
    setSending(true);
    const { data, error } = await supabase.functions.invoke("kyc-handler", {
      body: {
        action: "resend_invite",
        order_id: orderId,
        override_email: customerEmail || undefined,
        force: true,
      },
    });
    setSending(false);
    if (error) {
      toast.error(`KYC resend failed: ${error.message || error}`);
    } else if ((data as any)?.skipped) {
      toast.message(`KYC invite skipped: ${(data as any).reason}`);
    } else if ((data as any)?.email_sent === false) {
      toast.error(`KYC resend failed: ${(data as any).email_error || "unknown"}`);
    } else {
      toast.success("KYC invite resent");
    }
    load();
  };

  if (loading) {
    return (
      <Badge variant="outline" className="text-xs">
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        KYC Invite
      </Badge>
    );
  }

  const status = row?.status ?? "pending";
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  const Icon = meta.Icon;

  return (
    <div className="inline-flex items-center gap-1.5">
      <Badge
        variant={meta.variant}
        className={`text-xs ${meta.cls}`}
        title={
          row
            ? `${meta.label} • ${new Date(row.created_at).toLocaleString()}${
                row.error ? ` • ${row.error}` : ""
              } • attempts: ${row.attempt_count}`
            : "No KYC invite yet"
        }
      >
        <Icon className="h-3 w-3 mr-1" />
        {meta.label}
      </Badge>
      {canResend && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={resend}
          disabled={sending}
        >
          {sending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <>
              <Send className="h-3 w-3 mr-1" />
              Resend
            </>
          )}
        </Button>
      )}
    </div>
  );
}

export default KycInviteBadge;