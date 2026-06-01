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
import { Inbox, Package, AlertTriangle } from "lucide-react";

const ACK_STORAGE_KEY = "new_enquiry_acks_v1";

type NewEnquiry = {
  id: string;
  product_name: string;
  product_category: string | null;
  customer_name: string | null;
  customer_company: string | null;
  quantity: number | null;
  urgency: string | null;
  notes: string | null;
  status: string;
  sales_person_id: string | null;
  sales_person_name: string | null;
  requested_timeline: string | null;
  created_at: string;
};

function loadAcks(): Record<string, true> {
  try {
    return JSON.parse(localStorage.getItem(ACK_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveAcks(acks: Record<string, true>) {
  try {
    localStorage.setItem(ACK_STORAGE_KEY, JSON.stringify(acks));
  } catch {
    /* noop */
  }
}

export function NewEnquiryAlert() {
  const { user, roles } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [queue, setQueue] = useState<NewEnquiry[]>([]);
  const [current, setCurrent] = useState<NewEnquiry | null>(null);
  const seenRef = useRef<Set<string>>(new Set());

  const isSupplyChain = roles?.includes("supply_chain") || roles?.includes("admin");

  const enqueue = useCallback((items: NewEnquiry[]) => {
    if (!items.length) return;
    setQueue((q) => {
      const existing = new Set(q.map((x) => x.id));
      const merged = [...q];
      for (const it of items) {
        if (!existing.has(it.id) && !seenRef.current.has(it.id)) {
          merged.push(it);
          seenRef.current.add(it.id);
        }
      }
      return merged;
    });
  }, []);

  // Initial fetch: enquiries created in last 7 days, still pending response, not yet acked
  useEffect(() => {
    if (!user || !isSupplyChain) return;
    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("enquiries")
        .select(
          "id, product_name, product_category, customer_name, customer_company, quantity, urgency, notes, status, sales_person_id, sales_person_name, requested_timeline, created_at"
        )
        .is("responded_at", null)
        .gte("created_at", since)
        .order("created_at", { ascending: true });
      if (cancelled || error || !data) return;
      const acks = loadAcks();
      const unseen = (data as NewEnquiry[]).filter(
        (e) => !acks[e.id] && e.sales_person_id !== user.id
      );
      enqueue(unseen);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isSupplyChain, enqueue]);

  // Realtime: listen for new enquiry inserts
  useEffect(() => {
    if (!user || !isSupplyChain) return;
    const channel = supabase
      .channel(`new-enquiry-alert-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "enquiries" },
        (payload) => {
          const row = payload.new as NewEnquiry;
          if (!row?.id) return;
          if (row.sales_person_id === user.id) return; // ignore self
          enqueue([row]);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isSupplyChain, enqueue]);

  // Pop next item
  useEffect(() => {
    if (current || queue.length === 0) return;
    const [next, ...rest] = queue;
    setCurrent(next);
    setQueue(rest);
  }, [queue, current]);

  const acknowledge = () => {
    if (!current) return;
    const acks = loadAcks();
    acks[current.id] = true;
    saveAcks(acks);
    setCurrent(null);
  };

  const goToEnquiry = () => {
    if (!current) return;
    acknowledge();
    navigate(`/sales?tab=enquiries&enquiry=${current.id}`);
  };

  useEffect(() => {
    if (!current) return;
    toast({
      title: "New enquiry from Sales",
      description: `${current.product_name} — ${current.sales_person_name ?? "Sales"}`,
    });
  }, [current, toast]);

  if (!current || !isSupplyChain) return null;

  const urgencyHigh =
    current.urgency &&
    ["critical", "high", "urgent"].includes(current.urgency.toLowerCase());

  return (
    <Dialog
      open={!!current}
      onOpenChange={(o) => {
        if (!o) acknowledge();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <Inbox className="w-5 h-5" />
            New Enquiry Raised
          </DialogTitle>
          <DialogDescription>
            {current.sales_person_name ?? "A sales person"} has raised a new enquiry.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-muted/50 space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Package className="w-4 h-4 text-muted-foreground" />
              <span>{current.product_name}</span>
              {current.quantity ? (
                <Badge variant="secondary" className="ml-auto">
                  Qty {current.quantity}
                </Badge>
              ) : null}
            </div>
            {(current.customer_name || current.customer_company) && (
              <p className="text-xs text-muted-foreground">
                {[current.customer_name, current.customer_company]
                  .filter(Boolean)
                  .join(" • ")}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 text-sm">
            {current.urgency && (
              <div className="flex items-center gap-2">
                <AlertTriangle
                  className={`w-4 h-4 ${urgencyHigh ? "text-destructive" : "text-muted-foreground"}`}
                />
                <span className="text-muted-foreground">Urgency: </span>
                <span className="font-medium capitalize">{current.urgency}</span>
              </div>
            )}
            {current.requested_timeline && (
              <div>
                <span className="text-muted-foreground">Timeline: </span>
                <span className="font-medium">{current.requested_timeline}</span>
              </div>
            )}
            {current.notes && (
              <p className="text-xs text-foreground/80 whitespace-pre-wrap">
                {current.notes}
              </p>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={acknowledge}>
              Dismiss
            </Button>
            <Button className="flex-1" onClick={goToEnquiry}>
              Respond →
            </Button>
          </div>
          {queue.length > 0 && (
            <p className="text-xs text-muted-foreground text-center">
              {queue.length} more enquir{queue.length === 1 ? "y" : "ies"} pending
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}