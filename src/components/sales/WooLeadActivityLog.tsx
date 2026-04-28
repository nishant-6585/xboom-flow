import { useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  Activity, Phone, MessageCircle, Mail, StickyNote, RefreshCw,
  Eye, Calendar, Trash2, Loader2, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type WooOrder = {
  id: string;
  woo_order_id: string | null;
  order_status: string | null;
  woo_created_at: string | null;
  woo_updated_at: string | null;
  payment_status: string | null;
  customer_note?: string | null;
  internal_notes?: string | null;
  sales_notes?: string | null;
};

type ActivityType =
  | "call" | "whatsapp" | "email" | "note"
  | "status_change" | "view" | "followup";

type ManualEntry = {
  id: string;
  woo_order_id: string;
  activity_type: ActivityType;
  description: string;
  performed_by: string;
  performed_by_name: string;
  activity_date: string;
};

type TimelineItem = {
  id: string;
  type: ActivityType | "created" | "updated" | "woo_note" | "woo_customer_note";
  label: string;
  description?: string;
  actor?: string;
  at: string;
  source: "derived" | "manual" | "woo";
  ownedByMe?: boolean;
};

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  call: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  note: StickyNote,
  status_change: RefreshCw,
  view: Eye,
  followup: Calendar,
  created: Activity,
  updated: RefreshCw,
  woo_note: StickyNote,
  woo_customer_note: MessageCircle,
};

const ICON_TONE: Record<string, string> = {
  call: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
  whatsapp: "bg-green-500/15 text-green-600 dark:text-green-300",
  email: "bg-purple-500/15 text-purple-600 dark:text-purple-300",
  note: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  status_change: "bg-orange-500/15 text-orange-600 dark:text-orange-300",
  view: "bg-muted text-muted-foreground",
  followup: "bg-teal-500/15 text-teal-600 dark:text-teal-300",
  created: "bg-primary/15 text-primary",
  updated: "bg-muted text-muted-foreground",
  woo_note: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  woo_customer_note: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-300",
};

type WooNote = {
  id: number;
  author: string;
  date: string;
  note: string;
  customer_note: boolean;
};

export function WooLeadActivityLog({ order }: { order: WooOrder }) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<ManualEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newType, setNewType] = useState<ActivityType>("note");
  const [newText, setNewText] = useState("");
  const [wooNotes, setWooNotes] = useState<WooNote[]>([]);
  const [wooNotesLoading, setWooNotesLoading] = useState(false);
  const [storedNotes, setStoredNotes] = useState<{
    customer_note: string | null;
    internal_notes: string | null;
    sales_notes: string | null;
  }>({ customer_note: null, internal_notes: null, sales_notes: null });

  const wooId = order.woo_order_id;

  useEffect(() => {
    if (!wooId) { setEntries([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("woo_lead_activities")
        .select("*")
        .eq("woo_order_id", wooId)
        .order("activity_date", { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error("[WooLeadActivityLog] load failed", error);
        toast.error("Could not load activity log");
        setEntries([]);
      } else {
        setEntries((data ?? []) as ManualEntry[]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [wooId]);

  // Fetch the heavier note fields lazily for the open lead only.
  useEffect(() => {
    if (!order.id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("woocommerce_orders")
        .select("internal_notes,sales_notes,raw_data")
        .eq("id", order.id)
        .maybeSingle();
      if (cancelled || error || !data) return;
      const raw = data.raw_data as { customer_note?: string } | null;
      setStoredNotes({
        customer_note: raw?.customer_note?.trim() || null,
        internal_notes: data.internal_notes,
        sales_notes: data.sales_notes,
      });
    })();
    return () => { cancelled = true; };
  }, [order.id]);

  // Fetch WooCommerce order notes (customer-facing + private) for this lead.
  useEffect(() => {
    if (!wooId) { setWooNotes([]); return; }
    let cancelled = false;
    setWooNotesLoading(true);
    (async () => {
      const { data, error } = await supabase.functions.invoke("get-woo-order-notes", {
        body: { woo_order_id: wooId },
      });
      if (cancelled) return;
      if (error) {
        console.warn("[WooLeadActivityLog] woo notes fetch failed", error);
        setWooNotes([]);
      } else {
        setWooNotes(((data as { notes?: WooNote[] })?.notes) ?? []);
      }
      setWooNotesLoading(false);
    })();
    return () => { cancelled = true; };
  }, [wooId]);

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];

    if (order.woo_created_at) {
      items.push({
        id: `derived-created-${order.id}`,
        type: "created",
        label: "Lead received from website",
        description: order.order_status
          ? `Status: ${order.order_status.replace(/-/g, " ")}`
          : undefined,
        at: order.woo_created_at,
        source: "derived",
      });
    }

    if (
      order.woo_updated_at &&
      order.woo_created_at &&
      new Date(order.woo_updated_at).getTime() -
        new Date(order.woo_created_at).getTime() >
        60_000
    ) {
      items.push({
        id: `derived-updated-${order.id}`,
        type: "updated",
        label: "Order updated on WooCommerce",
        description: order.payment_status
          ? `Payment: ${order.payment_status}`
          : undefined,
        at: order.woo_updated_at,
        source: "derived",
      });
    }

    for (const e of entries) {
      items.push({
        id: e.id,
        type: e.activity_type,
        label: labelFor(e.activity_type),
        description: e.description,
        actor: e.performed_by_name || "Team member",
        at: e.activity_date,
        source: "manual",
        ownedByMe: !!user && e.performed_by === user.id,
      });
    }

    // Stored Woo single-field notes (loaded on demand)
    if (storedNotes.customer_note) {
      items.push({
        id: `woo-customer-note-${order.id}`,
        type: "woo_customer_note",
        label: "Customer note (checkout)",
        description: storedNotes.customer_note,
        actor: "Customer",
        at: order.woo_created_at ?? new Date().toISOString(),
        source: "woo",
      });
    }
    if (storedNotes.internal_notes?.trim()) {
      items.push({
        id: `woo-internal-note-${order.id}`,
        type: "woo_note",
        label: "Internal note",
        description: storedNotes.internal_notes,
        actor: "WooCommerce",
        at: order.woo_created_at ?? new Date().toISOString(),
        source: "woo",
      });
    }
    if (storedNotes.sales_notes?.trim()) {
      items.push({
        id: `woo-sales-note-${order.id}`,
        type: "woo_note",
        label: "Sales note",
        description: storedNotes.sales_notes,
        actor: "WooCommerce",
        at: order.woo_created_at ?? new Date().toISOString(),
        source: "woo",
      });
    }

    // Live-fetched Woo order notes (customer + private)
    for (const n of wooNotes) {
      items.push({
        id: `woo-note-${n.id}`,
        type: n.customer_note ? "woo_customer_note" : "woo_note",
        label: n.customer_note ? "Customer-facing note" : "Order note",
        description: n.note,
        actor: n.author || "WooCommerce",
        at: n.date,
        source: "woo",
      });
    }

    return items.sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
  }, [entries, order, user, wooNotes, storedNotes]);

  const addEntry = async () => {
    const text = newText.trim();
    if (!text || !wooId || !user) return;
    setSubmitting(true);
    const performerName =
      (user.user_metadata as Record<string, unknown> | null)?.full_name as string ||
      user.email ||
      "Team member";

    const { data, error } = await supabase
      .from("woo_lead_activities")
      .insert({
        woo_order_id: wooId,
        activity_type: newType,
        description: text,
        performed_by: user.id,
        performed_by_name: performerName,
      })
      .select()
      .single();

    setSubmitting(false);
    if (error) {
      console.error("[WooLeadActivityLog] insert failed", error);
      toast.error("Failed to add activity");
      return;
    }
    setEntries((prev) => [data as ManualEntry, ...prev]);
    setNewText("");
    toast.success("Activity logged");
  };

  const removeEntry = async (id: string) => {
    const prev = entries;
    setEntries((p) => p.filter((e) => e.id !== id));
    const { error } = await supabase
      .from("woo_lead_activities")
      .delete()
      .eq("id", id);
    if (error) {
      console.error("[WooLeadActivityLog] delete failed", error);
      toast.error("Could not delete entry");
      setEntries(prev);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-sm font-semibold">Activity</h4>
        <span className="text-xs text-muted-foreground">
          {timeline.length} {timeline.length === 1 ? "event" : "events"}
        </span>
      </div>

      {/* Composer */}
      <div className="rounded-lg border bg-card p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Select value={newType} onValueChange={(v) => setNewType(v as ActivityType)}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="note">Note</SelectItem>
              <SelectItem value="call">Call</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="followup">Follow-up</SelectItem>
              <SelectItem value="status_change">Status change</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-auto">
            Logged as {user?.email ?? "you"}
          </span>
        </div>
        <Textarea
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="What happened? e.g. Called customer, no answer."
          className="min-h-[60px] text-sm"
          disabled={submitting || !user}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={addEntry}
            disabled={submitting || !newText.trim() || !user || !wooId}
            className="gap-2"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Log activity
          </Button>
        </div>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : timeline.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          No activity yet — log the first one above.
        </p>
      ) : (
        <ol className="relative border-l border-border ml-2 space-y-3 pl-4">
          {timeline.map((item) => {
            const Icon = ICONS[item.type] ?? Activity;
            const tone = ICON_TONE[item.type] ?? "bg-muted text-muted-foreground";
            return (
              <li key={item.id} className="relative">
                <span
                  className={`absolute -left-[26px] top-0 grid h-5 w-5 place-items-center rounded-full ring-2 ring-background ${tone}`}
                >
                  <Icon className="h-3 w-3" />
                </span>
                <div className="rounded-md border bg-card/50 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-tight">
                        {item.label}
                      </p>
                      {item.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap break-words">
                          {item.description}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {item.actor && <span>{item.actor} · </span>}
                        <span title={format(new Date(item.at), "PPpp")}>
                          {formatDistanceToNow(new Date(item.at), { addSuffix: true })}
                        </span>
                      </p>
                    </div>
                    {item.source === "manual" && item.ownedByMe && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0"
                        onClick={() => removeEntry(item.id)}
                        title="Delete entry"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function labelFor(t: ActivityType): string {
  switch (t) {
    case "call": return "Call logged";
    case "whatsapp": return "WhatsApp message";
    case "email": return "Email sent";
    case "note": return "Note added";
    case "status_change": return "Status changed";
    case "view": return "Lead viewed";
    case "followup": return "Follow-up scheduled";
  }
}
