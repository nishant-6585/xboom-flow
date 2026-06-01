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
import { CheckCircle2, Package, MessageSquare } from "lucide-react";

const ACK_STORAGE_KEY = "enquiry_response_acks_v1";

type RespondedEnquiry = {
  id: string;
  product_name: string;
  product_category: string | null;
  customer_name: string | null;
  customer_company: string | null;
  quantity: number | null;
  status: string;
  response_pricing: string | null;
  response_availability: string | null;
  response_lead_time: string | null;
  response_notes: string | null;
  responded_by: string | null;
  responded_by_name: string | null;
  responded_at: string;
};

function loadAcks(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(ACK_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveAcks(acks: Record<string, string>) {
  try {
    localStorage.setItem(ACK_STORAGE_KEY, JSON.stringify(acks));
  } catch {
    /* noop */
  }
}

export function EnquiryResponseAlert() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [queue, setQueue] = useState<RespondedEnquiry[]>([]);
  const [current, setCurrent] = useState<RespondedEnquiry | null>(null);
  const seenRef = useRef<Set<string>>(new Set());

  const ackKey = (e: RespondedEnquiry) => `${e.id}:${e.responded_at}`;

  const enqueue = useCallback((items: RespondedEnquiry[]) => {
    if (!items.length) return;
    setQueue((q) => {
      const existing = new Set(q.map(ackKey));
      const merged = [...q];
      for (const it of items) {
        const k = ackKey(it);
        if (!existing.has(k) && !seenRef.current.has(k)) {
          merged.push(it);
          seenRef.current.add(k);
        }
      }
      return merged;
    });
  }, []);

  // Initial fetch: enquiries responded in last 7 days that user hasn't acknowledged
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("enquiries")
        .select(
          "id, product_name, product_category, customer_name, customer_company, quantity, status, response_pricing, response_availability, response_lead_time, response_notes, responded_by, responded_by_name, responded_at"
        )
        .eq("sales_person_id", user.id)
        .not("responded_at", "is", null)
        .gte("responded_at", since)
        .order("responded_at", { ascending: true });
      if (cancelled || error || !data) return;
      const acks = loadAcks();
      const unseen = (data as RespondedEnquiry[]).filter((e) => {
        if (!e.responded_at) return false;
        if (e.responded_by && e.responded_by === user.id) return false; // self-response
        return acks[e.id] !== e.responded_at;
      });
      enqueue(unseen);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, enqueue]);

  // Realtime: listen for updates on user's enquiries
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`enquiry-response-alert-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "enquiries",
          filter: `sales_person_id=eq.${user.id}`,
        },
        (payload) => {
          const newRow = payload.new as RespondedEnquiry & {
            sales_person_id: string;
          };
          const oldRow = payload.old as Partial<RespondedEnquiry>;
          if (!newRow?.responded_at) return;
          if (newRow.responded_by === user.id) return;
          // Trigger only when responded_at changed (new response)
          if (oldRow?.responded_at === newRow.responded_at) return;
          enqueue([newRow]);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, enqueue]);

  // Pop next item off queue when none is showing
  useEffect(() => {
    if (current || queue.length === 0) return;
    const [next, ...rest] = queue;
    setCurrent(next);
    setQueue(rest);
  }, [queue, current]);

  const acknowledge = () => {
    if (!current) return;
    const acks = loadAcks();
    acks[current.id] = current.responded_at;
    saveAcks(acks);
    setCurrent(null);
  };

  const goToEnquiry = () => {
    if (!current) return;
    acknowledge();
    navigate(`/sales?tab=enquiries&enquiry=${current.id}`);
  };

  // Toast for additional in-app awareness
  useEffect(() => {
    if (!current) return;
    toast({
      title: "Supply Chain responded to your enquiry",
      description: `${current.product_name} — ${current.responded_by_name ?? "Supply Chain"}`,
    });
  }, [current, toast]);

  if (!current) return null;

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
            <CheckCircle2 className="w-5 h-5" />
            Supply Chain Responded
          </DialogTitle>
          <DialogDescription>
            {current.responded_by_name ?? "Supply Chain"} has updated your enquiry.
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
            {current.response_pricing && (
              <div>
                <span className="text-muted-foreground">Pricing: </span>
                <span className="font-medium">{current.response_pricing}</span>
              </div>
            )}
            {current.response_availability && (
              <div>
                <span className="text-muted-foreground">Availability: </span>
                <span className="font-medium">{current.response_availability}</span>
              </div>
            )}
            {current.response_lead_time && (
              <div>
                <span className="text-muted-foreground">Lead Time: </span>
                <span className="font-medium">{current.response_lead_time}</span>
              </div>
            )}
            {current.response_notes && (
              <div className="flex gap-2">
                <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-xs text-foreground/80 whitespace-pre-wrap">
                  {current.response_notes}
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={acknowledge}>
              Dismiss
            </Button>
            <Button className="flex-1" onClick={goToEnquiry}>
              View Enquiry →
            </Button>
          </div>
          {queue.length > 0 && (
            <p className="text-xs text-muted-foreground text-center">
              {queue.length} more response{queue.length === 1 ? "" : "s"} pending
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}