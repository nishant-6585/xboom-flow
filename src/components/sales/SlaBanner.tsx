import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Timer, X } from "lucide-react";
import { computeEnquirySlaCounts, SlaEnquiryLike } from "@/lib/enquirySla";

const DISMISS_KEY = "sla_banner_dismissed_v1";
const POLL_MS = 2 * 60 * 1000; // recompute every 2 min

type Props = {
  /** Where the "View" action should navigate. Defaults to `/?tab=enquiries&sla=at_risk`. */
  viewHref?: string;
  className?: string;
};

/**
 * Passive, non-blocking banner for supply_chain users summarising unresponded
 * enquiries near / past SLA. Session-dismissible. Renders nothing when
 * counts are 0 or the current user isn't supply_chain.
 */
export function SlaBanner({ viewHref = "/?tab=enquiries&sla=at_risk", className }: Props) {
  const { user, roles } = useAuth();
  const navigate = useNavigate();
  const isSupplyChain = !!roles?.includes("supply_chain");

  const [rows, setRows] = useState<SlaEnquiryLike[]>([]);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!user || !isSupplyChain) return;
    let cancelled = false;
    const load = async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("enquiries")
        .select("id, created_at, responded_at, urgency, status")
        .is("responded_at", null)
        .neq("status", "cancelled")
        .gte("created_at", since);
      if (cancelled || error || !data) return;
      setRows(data as SlaEnquiryLike[]);
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user, isSupplyChain]);

  const counts = useMemo(() => computeEnquirySlaCounts(rows), [rows]);

  if (!isSupplyChain || dismissed) return null;
  if (counts.approaching === 0 && counts.breached === 0) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* noop */
    }
    setDismissed(true);
  };

  return (
    <div
      role="status"
      className={`flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm ${className ?? ""}`}
    >
      <Timer className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
      <span className="text-foreground">
        {counts.approaching > 0 && (
          <>
            <strong>{counts.approaching}</strong> enquir{counts.approaching === 1 ? "y" : "ies"} approaching SLA
          </>
        )}
        {counts.approaching > 0 && counts.breached > 0 && " · "}
        {counts.breached > 0 && (
          <span className="text-destructive">
            <AlertTriangle className="inline h-3.5 w-3.5 mr-0.5 -mt-0.5" />
            <strong>{counts.breached}</strong> past SLA
          </span>
        )}
      </span>
      <Button
        variant="link"
        size="sm"
        className="h-auto p-0 ml-1"
        onClick={() => navigate(viewHref)}
      >
        View →
      </Button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}