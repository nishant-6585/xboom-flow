import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Send,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Clock,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  orderId: string;
  customerEmail?: string | null;
  compact?: boolean;
}

interface LogRow {
  id: string;
  status: "sent" | "failed" | "skipped" | "pending";
  error: string | null;
  attempt_count: number;
  recipient_email: string | null;
  created_at: string;
}

interface KycInfo {
  kyc_status:
    | "not_submitted"
    | "pending_verification"
    | "approved"
    | "rejected"
    | "resubmission_required"
    | null;
  has_portal_account: boolean;
  customer_email: string | null;
  last_invite: { status: string; created_at: string; attempt_count: number } | null;
  last_delivery?: { status: string; created_at: string } | null;
}

const STATUS_META: Record<string, { label: string; variant: any; Icon: any; cls: string }> = {
  sent: { label: "KYC Invite: Sent", variant: "default", Icon: CheckCircle2, cls: "bg-emerald-600 hover:bg-emerald-600" },
  failed: { label: "KYC Invite: Failed", variant: "destructive", Icon: XCircle, cls: "" },
  skipped: { label: "KYC Invite: Skipped", variant: "secondary", Icon: MinusCircle, cls: "" },
  pending: { label: "KYC Invite: Pending", variant: "outline", Icon: Clock, cls: "" },
  dlq: { label: "KYC Invite: Dead-lettered", variant: "destructive", Icon: XCircle, cls: "" },
  bounced: { label: "KYC Invite: Bounced", variant: "destructive", Icon: XCircle, cls: "" },
  complained: { label: "KYC Invite: Complained", variant: "destructive", Icon: XCircle, cls: "" },
  suppressed: { label: "KYC Invite: Suppressed", variant: "secondary", Icon: MinusCircle, cls: "" },
};

const KYC_META: Record<string, { label: string; short: string; Icon: any; cls: string }> = {
  approved: {
    label: "KYC: Approved",
    short: "KYC Approved",
    Icon: ShieldCheck,
    cls: "bg-emerald-600 hover:bg-emerald-600 text-white border-transparent",
  },
  pending_verification: {
    label: "KYC: Pending Verification",
    short: "KYC Pending",
    Icon: Clock,
    cls: "bg-amber-500 hover:bg-amber-500 text-white border-transparent",
  },
  resubmission_required: {
    label: "KYC: Resubmission Required",
    short: "KYC Resubmit",
    Icon: ShieldAlert,
    cls: "bg-amber-500 hover:bg-amber-500 text-white border-transparent",
  },
  rejected: {
    label: "KYC: Rejected",
    short: "KYC Rejected",
    Icon: XCircle,
    cls: "bg-red-600 hover:bg-red-600 text-white border-transparent",
  },
  not_submitted: {
    label: "KYC: Not Submitted",
    short: "KYC: Not Submitted",
    Icon: ShieldQuestion,
    cls: "",
  },
  not_invited: {
    label: "KYC: Not invited",
    short: "KYC: Not invited",
    Icon: ShieldQuestion,
    cls: "",
  },
};

export function KycInviteBadge({ orderId, customerEmail, compact = false }: Props) {
  const { roles } = useAuth();
  const canResend =
    Array.isArray(roles) &&
    roles.some((r) => ["admin", "sales", "sales_manager"].includes(r));
  const [row, setRow] = useState<LogRow | null>(null);
  const [info, setInfo] = useState<KycInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [logRes, statusRes] = await Promise.all([
      (supabase.from("kyc_email_log") as any)
        .select("id, status, error, attempt_count, recipient_email, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.functions.invoke("kyc-handler", {
        body: { action: "order_kyc_status", order_id: orderId },
      }),
    ]);
    setRow(((logRes as any)?.data as LogRow | null) ?? null);
    if (!(statusRes as any).error) {
      setInfo(((statusRes as any).data as KycInfo) ?? null);
    }
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    if (orderId) load();
  }, [orderId, load]);

  const resend = async (e?: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    if (sendingRef.current) return;
    sendingRef.current = true;
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
    sendingRef.current = false;
    if (error) {
      toast.error(`KYC invite failed: ${error.message || error}`);
    } else if ((data as any)?.skipped) {
      const reason = (data as any).reason;
      if (reason === "feature_disabled") {
        toast.error("KYC emails are off (Admin → Feature Flags)");
      } else {
        toast.message(`KYC invite skipped: ${reason}`);
      }
    } else if ((data as any)?.email_sent === false) {
      toast.error(`KYC invite failed: ${(data as any).email_error || "unknown"}`);
    } else {
      toast.success("KYC invite sent");
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

  // Prefer ACTUAL delivery status from email_send_log (pending/sent/dlq/
  // bounced/complained/suppressed). Fall back to the enqueue-time status
  // in kyc_email_log for rows that predate delivery correlation, and for
  // 'skipped' outcomes which never enqueue an email at all.
  const enqueueStatus = row?.status ?? "pending";
  const deliveryStatus = info?.last_delivery?.status;
  const status =
    enqueueStatus === "skipped" || enqueueStatus === "failed"
      ? enqueueStatus
      : (deliveryStatus || enqueueStatus);
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  const Icon = meta.Icon;

  const deliveryLine =
    info?.last_delivery
      ? `\nDelivery: ${info.last_delivery.status} • ${new Date(info.last_delivery.created_at).toLocaleString()}`
      : "";
  const tooltipText = row
    ? `${meta.label} • enqueued ${new Date(row.created_at).toLocaleString()} • attempts: ${row.attempt_count}${
        row.error ? `\nError: ${row.error}` : ""
      }${deliveryLine}`
    : "No KYC invite sent yet";

  if (compact) {
    const shortLabel =
      status === "sent"
        ? "KYC Sent"
        : status === "failed"
        ? "KYC Failed"
        : status === "skipped"
        ? "KYC Skipped"
        : "KYC Pending";
    return (
      <TooltipProvider delayDuration={150}>
        <span className="inline-flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant={meta.variant}
                className={`text-[10px] h-5 px-1.5 gap-1 cursor-default ${meta.cls}`}
              >
                <Icon className="h-3 w-3" />
                {shortLabel}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs whitespace-pre-line text-xs">
              {tooltipText}
            </TooltipContent>
          </Tooltip>
          {canResend && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    resend(e);
                  }}
                  disabled={sending}
                  aria-label="Resend KYC invite"
                  className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-accent disabled:opacity-50"
                >
                  {sending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Send className="h-3 w-3" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Resend KYC invite</TooltipContent>
            </Tooltip>
          )}
        </span>
      </TooltipProvider>
    );
  }

  // Full mode: KYC status badge + invite email status + context-aware button
  const kycKey = info?.has_portal_account === false ? "not_invited" : (info?.kyc_status ?? "not_invited");
  const kMeta = KYC_META[kycKey] ?? KYC_META.not_invited;
  const KIcon = kMeta.Icon;
  const isApproved = info?.kyc_status === "approved";

  return (
    <TooltipProvider delayDuration={150}>
      <div className="inline-flex items-center gap-1.5 flex-wrap">
        <Badge className={`text-xs ${kMeta.cls}`} variant={kMeta.cls ? "default" : "outline"}>
          <KIcon className="h-3 w-3 mr-1" />
          {kMeta.label}
        </Badge>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant={meta.variant} className={`text-xs cursor-default ${meta.cls}`}>
              <Icon className="h-3 w-3 mr-1" />
              {meta.label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs whitespace-pre-line text-xs">
            {tooltipText}
          </TooltipContent>
        </Tooltip>
        {canResend && (
          isApproved ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={() => resend()}
              disabled={sending}
              title="Customer is already KYC-approved"
            >
              {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Send className="h-3 w-3 mr-1" />Resend anyway</>}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="default"
              className="h-7 px-2 text-xs"
              onClick={() => resend()}
              disabled={sending}
            >
              {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Send className="h-3 w-3 mr-1" />Send KYC invite</>}
            </Button>
          )
        )}
      </div>
    </TooltipProvider>
  );
}

export default KycInviteBadge;