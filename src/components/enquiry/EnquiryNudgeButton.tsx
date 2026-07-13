import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { recordAuditLog } from "@/lib/auditLog";

interface Props {
  enquiryId: string;
  enquiryCreatedAt: string;
  enquiryStatus: string;
  visible: boolean;
}

// Small helper: extract the ISO timestamp from a "nudge_cooldown: next allowed at ..." error.
function parseCooldown(msg: string): Date | null {
  const m = msg.match(/next allowed at (\S+)/);
  if (!m) return null;
  const d = new Date(m[1]);
  return isNaN(d.getTime()) ? null : d;
}

// Friendly duration like "1h 23m", "23m", or "less than a minute".
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "now";
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return "less than a minute";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function EnquiryNudgeButton({ enquiryId, enquiryCreatedAt, enquiryStatus, visible }: Props) {
  const { user, profile } = useAuth();
  const [lastNudgeAt, setLastNudgeAt] = useState<string | null>(null);
  const [lastMessageAt, setLastMessageAt] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // Server-reported next-allowed cooldown time (from nudge_cooldown errors).
  const [serverCooldownEndsAt, setServerCooldownEndsAt] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("enquiry_messages")
      .select("created_at,is_nudge")
      .eq("enquiry_id", enquiryId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (!data) return;
    const nudge = data.find((r) => r.is_nudge);
    const normal = data.find((r) => !r.is_nudge);
    setLastNudgeAt(nudge?.created_at ?? null);
    setLastMessageAt(normal?.created_at ?? null);
  }, [enquiryId]);

  useEffect(() => {
    if (!visible) return;
    refresh();
    const ch = supabase
      .channel(`nudge-btn-${enquiryId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "enquiry_messages", filter: `enquiry_id=eq.${enquiryId}` },
        () => refresh()
      )
      .subscribe();
    // Tick every 30s so the friendly countdown updates as time passes.
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(t);
    };
  }, [enquiryId, visible, refresh]);

  if (!visible) return null;

  const referenceMs = new Date(lastMessageAt ?? enquiryCreatedAt).getTime();
  const stale = now - referenceMs > 2 * 60 * 60 * 1000;
  const localCooldownEndsAt = lastNudgeAt ? new Date(lastNudgeAt).getTime() + 4 * 60 * 60 * 1000 : 0;
  // Prefer the server-reported cooldown when it's later than the local estimate.
  const cooldownEndsAt = Math.max(localCooldownEndsAt, serverCooldownEndsAt ?? 0);
  const inCooldown = cooldownEndsAt > now;

  const preThreshold = !stale && !inCooldown;
  const disabled = sending || inCooldown || preThreshold;

  const handleClick = async () => {
    if (disabled || preThreshold) return;
    setSending(true);
    const { error } = await supabase.rpc("nudge_enquiry", { p_enquiry_id: enquiryId });
    setSending(false);
    if (error) {
      if (error.message?.includes("nudge_cooldown")) {
        const next = parseCooldown(error.message);
        if (next) setServerCooldownEndsAt(next.getTime());
        toast.error(
          next
            ? `You can nudge again in ${formatRemaining(next.getTime() - Date.now())}`
            : "Nudge on cooldown — try again later"
        );
      } else if (error.message?.includes("not_waiting_on_supply")) {
        toast.error("This enquiry is not waiting on supply chain.");
      } else if (error.message?.includes("not_enquiry_owner")) {
        toast.error("Only the assigned salesperson can nudge this enquiry.");
      } else {
        toast.error(error.message || "Could not send nudge");
      }
      refresh();
      return;
    }
    toast.success("Supply chain nudged");
    // Fire-and-forget audit log for the successful nudge.
    if (user?.id) {
      void recordAuditLog(user.id, profile?.full_name ?? user.email ?? "unknown", {
        action: "enquiry_nudge_sent",
        details: { enquiry_id: enquiryId },
      });
    }
    refresh();
  };

  const btn = (
    <Button
      type="button"
      variant={preThreshold ? "ghost" : "outline"}
      size="sm"
      className="h-7 text-xs gap-1"
      onClick={handleClick}
      disabled={disabled}
      data-testid="enquiry-nudge-button"
      data-state={preThreshold ? "pre-threshold" : inCooldown ? "cooldown" : "ready"}
    >
      <span>👋</span>
      <span>Nudge supply chain</span>
    </Button>
  );

  if (preThreshold) {
    const nudgeAvailableAt = referenceMs + 2 * 60 * 60 * 1000;
    const remaining = formatRemaining(nudgeAvailableAt - now);
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild><span>{btn}</span></TooltipTrigger>
          <TooltipContent>
            Nudge available in {remaining} — supply chain gets 2h to respond before nudging
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (inCooldown) {
    const remaining = formatRemaining(cooldownEndsAt - now);
    const nextAllowed = new Date(cooldownEndsAt);
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild><span>{btn}</span></TooltipTrigger>
          <TooltipContent>
            You can nudge again in {remaining} (at {nextAllowed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return btn;
}