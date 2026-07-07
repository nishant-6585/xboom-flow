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
  /** Current order status. When 'cancelled', invite actions are disabled. */
  orderStatus?: string | null;
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

// Invite-delivery states. These describe the EMAIL delivery only — never the
// customer's KYC submission progress. The submission chip (KYC_META) is a
// separate fact and must not share labels with delivery.
const STATUS_META: Record<
  string,
  { label: string; short: string; variant: any; Icon: any; cls: string }
> = {
  // Row exists in kyc_email_log but no successful delivery event yet — the
  // email is sitting in the pgmq queue waiting for the worker to dispatch.
  pending: {
    label: "Invite Queued",
    short: "Invite Queued",
    variant: "secondary",
    Icon: Clock,
    cls: "bg-slate-200 text-slate-800 hover:bg-slate-200 border-transparent dark:bg-slate-700 dark:text-slate-100",
  },
  sent: {
    label: "Invite Sent",
    short: "Invite Sent",
    variant: "default",
    Icon: CheckCircle2,
    cls: "bg-emerald-600 hover:bg-emerald-600 text-white border-transparent",
  },
  failed: {
    label: "Invite Failed",
    short: "Invite Failed",
    variant: "destructive",
    Icon: XCircle,
    cls: "",
  },
  dlq: {
    label: "Invite Failed",
    short: "Invite Failed",
    variant: "destructive",
    Icon: XCircle,
    cls: "",
  },
  bounced: {
    label: "Invite Failed",
    short: "Invite Failed",
    variant: "destructive",
    Icon: XCircle,
    cls: "",
  },
  complained: {
    label: "Invite Failed",
    short: "Invite Failed",
    variant: "destructive",
    Icon: XCircle,
    cls: "",
  },
  suppressed: {
    label: "Invite Failed",
    short: "Invite Failed",
    variant: "destructive",
    Icon: XCircle,
    cls: "",
  },
  skipped: {
    label: "Invite Skipped",
    short: "Invite Skipped",
    variant: "secondary",
    Icon: MinusCircle,
    cls: "",
  },
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

export function KycInviteBadge({ orderId, customerEmail, compact = false, orderStatus }: Props) {
  const { roles } = useAuth();
  const canResend =
    Array.isArray(roles) &&
    roles.some((r) => ["admin", "sales", "sales_manager"].includes(r));
  const isCancelled = orderStatus === "cancelled";
  const cancelledTooltip = "Order is cancelled — KYC not applicable";
  const [row, setRow] = useState<LogRow | null>(null);
  const [info, setInfo] = useState<KycInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const hasLoadedRef = useRef(false);

  const rowsEqual = (a: LogRow | null, b: LogRow | null) => {
    if (a === b) return true;
    if (!a || !b) return false;
    return (
      a.id === b.id &&
      a.status === b.status &&
      a.error === b.error &&
      a.attempt_count === b.attempt_count &&
      a.recipient_email === b.recipient_email &&
      a.created_at === b.created_at
    );
  };

  const infosEqual = (a: KycInfo | null, b: KycInfo | null) => {
    if (a === b) return true;
    if (!a || !b) return false;
    return (
      a.kyc_status === b.kyc_status &&
      a.has_portal_account === b.has_portal_account &&
      a.customer_email === b.customer_email &&
      (a.last_invite?.status ?? null) === (b.last_invite?.status ?? null) &&
      (a.last_invite?.created_at ?? null) === (b.last_invite?.created_at ?? null) &&
      (a.last_invite?.attempt_count ?? null) === (b.last_invite?.attempt_count ?? null) &&
      (a.last_delivery?.status ?? null) === (b.last_delivery?.status ?? null) &&
      (a.last_delivery?.created_at ?? null) === (b.last_delivery?.created_at ?? null)
    );
  };

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setLoading(true);
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
    const nextRow = ((logRes as any)?.data as LogRow | null) ?? null;
    setRow((prev) => (rowsEqual(prev, nextRow) ? prev : nextRow));
    if (!(statusRes as any).error) {
      const nextInfo = ((statusRes as any).data as KycInfo) ?? null;
      setInfo((prev) => (infosEqual(prev, nextInfo) ? prev : nextInfo));
    }
    hasLoadedRef.current = true;
    if (!silent) setLoading(false);
  }, [orderId]);

  useEffect(() => {
    if (orderId) load({ silent: false });
  }, [orderId, load]);

  // Refresh when the tab regains focus so "Queued" naturally flips to "Sent"
  // after the queue worker dispatches, without requiring a hard refresh.
  // Uses a silent refetch so the current badge stays rendered — no loader
  // flicker on tab switch — and state only updates if the fetched status
  // actually differs from what's displayed.
  useEffect(() => {
    if (!orderId) return;
    const silentReload = () => {
      if (!hasLoadedRef.current) return;
      load({ silent: true });
    };
    const onFocus = () => silentReload();
    const onVisibility = () => {
      if (document.visibilityState === "visible") silentReload();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [orderId, load]);

  const resend = async (e?: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    if (isCancelled) {
      toast.error(cancelledTooltip);
      return;
    }
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    const { data, error } = await supabase.functions.invoke("kyc-handler", {
      body: {
        action: "resend_invite",
        order_id: orderId,
        override_email: customerEmail || undefined,
        force: true,
        interactive: true,
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
      } else if (reason === "order_cancelled") {
        toast.error(cancelledTooltip);
      } else {
        toast.message(`KYC invite skipped: ${reason}`);
      }
    } else if ((data as any)?.email_sent === false) {
      toast.error(`KYC invite failed: ${(data as any).email_error || "unknown"}`);
    } else {
      toast.success("KYC invite sent");
    }
    load({ silent: true });
  };

  if (loading && !hasLoadedRef.current) {
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
  //
  // If there is NO kyc_email_log row at all, the invite was never even
  // attempted (e.g. Woo-imported orders where the auto-invite hook did
  // not fire). Show "Not invited" via the KYC chip instead of falsely
  // claiming the invite is queued.
  const enqueueStatus = row?.status ?? null;
  const deliveryStatus = info?.last_delivery?.status;
  const status = enqueueStatus
    ? (enqueueStatus === "skipped" || enqueueStatus === "failed"
        ? enqueueStatus
        : (deliveryStatus || enqueueStatus))
    : null;
  const meta = status ? (STATUS_META[status] ?? STATUS_META.pending) : null;
  const Icon = meta?.Icon;

  const deliveryLine =
    info?.last_delivery
      ? `\nDelivery: ${info.last_delivery.status} • ${new Date(info.last_delivery.created_at).toLocaleString()}`
      : "";
  const sentAt =
    status === "sent" && info?.last_delivery?.created_at
      ? new Date(info.last_delivery.created_at).toLocaleString()
      : null;
  const baseTooltip = row && meta
    ? `${meta.label}${sentAt ? ` • sent ${sentAt}` : ""} • enqueued ${new Date(row.created_at).toLocaleString()} • attempts: ${row.attempt_count}${
        row.error ? `\nReason: ${row.error}` : ""
      }${deliveryLine}`
    : "No KYC invite sent yet";
  const tooltipText = isCancelled ? cancelledTooltip : baseTooltip;

  if (compact) {
    const shortLabel = meta?.short ?? "Not invited";
    return (
      <TooltipProvider delayDuration={150}>
        <span className="inline-flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant={meta?.variant ?? "outline"}
                className={`text-[10px] h-5 px-1.5 gap-1 cursor-default ${meta?.cls ?? ""}`}
              >
                {Icon ? <Icon className="h-3 w-3" /> : <ShieldQuestion className="h-3 w-3" />}
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
                    if (isCancelled) return;
                    resend(e);
                  }}
                  disabled={sending || isCancelled}
                  aria-label={isCancelled ? cancelledTooltip : "Resend KYC invite"}
                  className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Send className="h-3 w-3" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">
                {isCancelled ? cancelledTooltip : "Resend KYC invite"}
              </TooltipContent>
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
        {meta && Icon && (
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
        )}
        {canResend && (
          isApproved ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={() => resend()}
              disabled={sending || isCancelled}
              title={isCancelled ? cancelledTooltip : "Customer is already KYC-approved"}
            >
              {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Send className="h-3 w-3 mr-1" />Resend anyway</>}
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 px-2 text-xs"
                    onClick={() => resend()}
                    disabled={sending || isCancelled}
                  >
                    {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Send className="h-3 w-3 mr-1" />Send KYC invite</>}
                  </Button>
                </span>
              </TooltipTrigger>
              {isCancelled && (
                <TooltipContent className="text-xs">{cancelledTooltip}</TooltipContent>
              )}
            </Tooltip>
          )
        )}
      </div>
    </TooltipProvider>
  );
}

export default KycInviteBadge;