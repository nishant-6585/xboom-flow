import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow, formatDistance } from "date-fns";

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

export function EnquiryNudgeButton({ enquiryId, enquiryCreatedAt, enquiryStatus, visible }: Props) {
  const [lastNudgeAt, setLastNudgeAt] = useState<string | null>(null);
  const [lastMessageAt, setLastMessageAt] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(() => Date.now());

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
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(t);
    };
  }, [enquiryId, visible, refresh]);

  if (!visible) return null;

  const referenceMs = new Date(lastMessageAt ?? enquiryCreatedAt).getTime();
  const stale = now - referenceMs > 2 * 60 * 60 * 1000;
  const cooldownEndsAt = lastNudgeAt ? new Date(lastNudgeAt).getTime() + 4 * 60 * 60 * 1000 : 0;
  const inCooldown = cooldownEndsAt > now;

  if (!stale && !inCooldown) return null; // hide until enquiry is ripe for a nudge

  const disabled = sending || inCooldown;

  const handleClick = async () => {
    setSending(true);
    const { error } = await supabase.rpc("nudge_enquiry", { p_enquiry_id: enquiryId });
    setSending(false);
    if (error) {
      if (error.message?.includes("nudge_cooldown")) {
        const next = parseCooldown(error.message);
        toast.error(
          next
            ? `You can nudge again ${formatDistanceToNow(next, { addSuffix: true })}`
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
    refresh();
  };

  const btn = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 text-xs gap-1"
      onClick={handleClick}
      disabled={disabled}
    >
      <span>👋</span>
      <span>Nudge supply chain</span>
    </Button>
  );

  if (inCooldown) {
    const cooldownEnd = new Date(cooldownEndsAt);
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild><span>{btn}</span></TooltipTrigger>
          <TooltipContent>
            You can nudge again {formatDistanceToNow(cooldownEnd, { addSuffix: true })}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return btn;
}