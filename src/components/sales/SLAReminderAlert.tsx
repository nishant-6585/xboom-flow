import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, AlertTriangle, Timer } from "lucide-react";

const ACK_STORAGE_KEY = "sla_reminder_acks_v1";
const RENUDGE_MS = 30 * 60 * 1000; // 30 min
const POLL_MS = 60 * 1000; // 1 min

// SLA windows (in milliseconds) keyed by urgency
const SLA_MS: Record<string, number> = {
  critical: 60 * 60 * 1000,        // 1h
  urgent: 2 * 60 * 60 * 1000,      // 2h
  high: 4 * 60 * 60 * 1000,        // 4h
  medium: 24 * 60 * 60 * 1000,     // 24h
  low: 72 * 60 * 60 * 1000,        // 72h
};
const WARN_THRESHOLD = 0.8; // 80% elapsed

type SLAEnquiry = {
  id: string;
  product_name: string;
  customer_name: string | null;
  customer_company: string | null;
  quantity: number | null;
  urgency: string;
  sales_person_name: string | null;
  requested_timeline: string | null;
  created_at: string;
};

type AckRecord = Record<string, number>; // enquiryId -> last ack timestamp

function loadAcks(): AckRecord {
  try {
    return JSON.parse(localStorage.getItem(ACK_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveAcks(acks: AckRecord) {
   try {
    localStorage.setItem(ACK_STORAGE_KEY, JSON.stringify(acks));
  } catch {
    /* noop */
  }
}

function slaInfo(e: SLAEnquiry) {
  const u = (e.urgency || "medium").toLowerCase();
  const window = SLA_MS[u] ?? SLA_MS.medium;
  const elapsed = Date.now() - new Date(e.created_at).getTime();
  const ratio = elapsed / window;
  const remainingMs = window - elapsed;
  return { window, elapsed, ratio, remainingMs, breached: ratio >= 1 };
}

function formatDuration(ms: number) {
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function SLAReminderAlert() {
  const { user, roles } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [queue, setQueue] = useState<SLAEnquiry[]>([]);
  const [current, setCurrent] = useState<SLAEnquiry | null>(null);
  const lastCheckRef = useRef<number>(0);

  const isSupplyChain = roles?.includes("supply_chain");

  const evaluateAndEnqueue = useCallback(async () => {
    if (!user || !isSupplyChain) return;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("enquiries")
      .select(
        "id, product_name, customer_name, customer_company, quantity, urgency, sales_person_name, requested_timeline, created_at, responded_at, status"
      )
      .is("responded_at", null)
      .neq("status", "cancelled")
      .gte("created_at", since)
      .order("created_at", { ascending: true });
    if (error || !data) return;

    const acks = loadAcks();
    const now = Date.now();
    const due: SLAEnquiry[] = [];
    for (const row of data as SLAEnquiry[]) {
      const info = slaInfo(row);
      if (info.ratio < WARN_THRESHOLD) continue;
      const lastAck = acks[row.id];
      if (lastAck && now - lastAck < RENUDGE_MS) continue;
      due.push(row);
    }
    if (!due.length) return;
    setQueue((q) => {
      const existing = new Set(q.map((x) => x.id));
      const merged = [...q];
      for (const it of due) if (!existing.has(it.id)) merged.push(it);
      return merged;
    });
  }, [user, isSupplyChain]);

  // Poll every minute + initial run
  useEffect(() => {
    if (!user || !isSupplyChain) return;
    evaluateAndEnqueue();
    const id = setInterval(evaluateAndEnqueue, POLL_MS);
    return () => clearInterval(id);
  }, [user, isSupplyChain, evaluateAndEnqueue]);

  // Drain queue
  useEffect(() => {
    if (current || queue.length === 0) return;
    const [next, ...rest] = queue;
    setCurrent(next);
    setQueue(rest);
    const info = slaInfo(next);
    if (now() - lastCheckRef.current > 1000) {
      lastCheckRef.current = now();
    }
    toast({
      title: info.breached ? "SLA breached" : "SLA nearing deadline",
      description: `${next.product_name} — ${next.urgency} (${
        info.breached
          ? `overdue by ${formatDuration(info.remainingMs)}`
          : `${formatDuration(info.remainingMs)} left`
      })`,
      variant: info.breached ? "destructive" : "default",
    });
  }, [queue, current, toast]);

  const ack = (snooze: boolean) => {
    if (!current) return;
    const acks = loadAcks();
    acks[current.id] = Date.now();
    saveAcks(acks);
    setCurrent(null);
  };

  const respond = () => {
    if (!current) return;
    const id = current.id;
    ack(true);
    navigate(`/sales?tab=enquiries&enquiry=${id}`);
  };

  if (!isSupplyChain || !current) return null;

  const info = slaInfo(current);
  const pct = Math.min(100, Math.round(info.ratio * 100));

  return (
    <Dialog open={!!current} onOpenChange={(open) => !open && ack(true)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {info.breached ? (
              <AlertTriangle className="w-5 h-5 text-destructive" />
            ) : (
              <Timer className="w-5 h-5 text-amber-500" />
            )}
            {info.breached ? "SLA Breached" : "SLA Reminder"}
          </DialogTitle>
          <DialogDescription>
            An enquiry is{" "}
            {info.breached
              ? "overdue and needs immediate response."
              : "approaching its response deadline."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold">{current.product_name}</span>
            <Badge
              variant={info.breached ? "destructive" : "secondary"}
              className="capitalize"
            >
              {current.urgency}
            </Badge>
          </div>

          <div className="text-sm text-muted-foreground space-y-1">
            <div>
              <span className="font-medium text-foreground">Customer:</span>{" "}
              {current.customer_name}
              {current.customer_company ? ` (${current.customer_company})` : ""}
            </div>
            {current.quantity ? (
              <div>
                <span className="font-medium text-foreground">Qty:</span>{" "}
                {current.quantity}
              </div>
            ) : null}
            {current.sales_person_name && (
              <div>
                <span className="font-medium text-foreground">Raised by:</span>{" "}
                {current.sales_person_name}
              </div>
            )}
            {current.requested_timeline && (
              <div>
                <span className="font-medium text-foreground">Timeline:</span>{" "}
                {current.requested_timeline}
              </div>
            )}
          </div>

          <div className="rounded-md border p-3 bg-muted/40">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="flex items-center gap-1.5 font-medium">
                <Clock className="w-4 h-4" />
                {info.breached ? "Overdue by" : "Time remaining"}
              </span>
              <span
                className={
                  info.breached
                    ? "text-destructive font-semibold"
                    : "text-amber-600 font-semibold"
                }
              >
                {formatDuration(info.remainingMs)}
              </span>
            </div>
            <div className="h-2 w-full bg-secondary rounded overflow-hidden">
              <div
                className={`h-full ${
                  info.breached ? "bg-destructive" : "bg-amber-500"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {pct}% of SLA window elapsed
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => ack(true)}>
            Snooze 30m
          </Button>
          <Button onClick={respond}>Respond now →</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function now() {
  return Date.now();
}
