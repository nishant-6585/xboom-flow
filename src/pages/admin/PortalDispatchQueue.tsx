import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Truck, Package, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { STATE_LABELS, type PortalOrderState } from "@/portal/lib/orderStates";

type LaneKey = "confirmed" | "in_production" | "qc_ready" | "dispatched";

const LANES: { key: LaneKey; title: string; nextState: PortalOrderState; nextLabel: string; icon: typeof Truck }[] = [
  { key: "confirmed", title: "Confirmed — start production", nextState: "in_production", nextLabel: "Mark in production", icon: Clock },
  { key: "in_production", title: "In production — finish QC", nextState: "qc_ready", nextLabel: "Mark QC ready", icon: Package },
  { key: "qc_ready", title: "QC ready — dispatch", nextState: "dispatched", nextLabel: "Dispatch", icon: Truck },
  { key: "dispatched", title: "Dispatched — mark delivered", nextState: "delivered", nextLabel: "Mark delivered", icon: CheckCircle2 },
];

interface OrderRow {
  id: string;
  order_number: string;
  account_id: string;
  current_state: PortalOrderState;
  customer_facing_eta: string | null;
  customer_po_number: string | null;
  courier_name: string | null;
  awb_number: string | null;
  tracking_url: string | null;
  total: number | null;
  updated_at: string;
  account?: { company_name: string } | null;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

function daysFrom(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  return Math.round((Date.now() - d) / 86400000);
}

export default function PortalDispatchQueue() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const [active, setActive] = useState<LaneKey>("qc_ready");
  const [advance, setAdvance] = useState<{ order: OrderRow; nextState: PortalOrderState } | null>(null);

  const canAccess = role === "admin" || role === "supply_chain";

  const { data: orders, isLoading } = useQuery({
    queryKey: ["dispatch", "orders"],
    enabled: canAccess,
    queryFn: async (): Promise<OrderRow[]> => {
      const states: PortalOrderState[] = ["confirmed", "in_production", "qc_ready", "dispatched"];
      const { data, error } = await supabase
        .from("portal_orders")
        .select(
          "id, order_number, account_id, current_state, customer_facing_eta, customer_po_number, courier_name, awb_number, tracking_url, total, updated_at, account:portal_accounts(company_name)",
        )
        .in("current_state", states)
        .order("customer_facing_eta", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return ((data ?? []) as unknown) as OrderRow[];
    },
  });

  const counts = useMemo(() => {
    const c: Record<LaneKey, number> = { confirmed: 0, in_production: 0, qc_ready: 0, dispatched: 0 };
    (orders ?? []).forEach((o) => {
      if (o.current_state in c) c[o.current_state as LaneKey]++;
    });
    return c;
  }, [orders]);

  const lane = useMemo(
    () => (orders ?? []).filter((o) => o.current_state === active),
    [orders, active],
  );

  if (!canAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Restricted to admin / supply chain.
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />
      <div className="container mx-auto px-4 sm:px-6 py-6 max-w-6xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Dispatch Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Move orders through production, QC, and dispatch.
          </p>
        </div>

        <Tabs value={active} onValueChange={(v) => setActive(v as LaneKey)}>
          <TabsList className="grid grid-cols-4 w-full sm:w-auto">
            {LANES.map((l) => {
              const Icon = l.icon;
              return (
                <TabsTrigger key={l.key} value={l.key} className="gap-2">
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{STATE_LABELS[l.key]}</span>
                  <Badge variant="secondary" className="ml-1 text-[10px]">
                    {counts[l.key]}
                  </Badge>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {LANES.map((l) => (
            <TabsContent key={l.key} value={l.key} forceMount hidden={active !== l.key} className="mt-4">
              {isLoading && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {!isLoading && lane.length === 0 && (
                <Card>
                  <CardContent className="py-14 flex flex-col items-center text-center">
                    <CheckCircle2 className="h-10 w-10 text-muted-foreground mb-3" />
                    <p className="font-medium">Nothing in this lane</p>
                  </CardContent>
                </Card>
              )}
              <div className="space-y-3">
                {active === l.key &&
                  lane.map((o) => {
                    const etaDays = o.customer_facing_eta
                      ? Math.round((new Date(o.customer_facing_eta).getTime() - Date.now()) / 86400000)
                      : null;
                    const overdue = etaDays !== null && etaDays < 0;
                    return (
                      <Card
                        key={o.id}
                        className={overdue ? "border-destructive/50" : ""}
                      >
                        <CardContent className="py-4 px-5 flex items-start justify-between gap-4 flex-wrap">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold">{o.order_number}</span>
                              <Badge variant="outline" className="text-xs">
                                {STATE_LABELS[o.current_state]}
                              </Badge>
                              {overdue && (
                                <Badge variant="destructive" className="text-xs">
                                  Overdue {Math.abs(etaDays!)}d
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm mt-1.5 text-muted-foreground">
                              {o.account?.company_name ?? "—"}
                            </p>
                            <div className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1">
                              {o.customer_facing_eta && (
                                <span>ETA {fmtDate(o.customer_facing_eta)}</span>
                              )}
                              {o.customer_po_number && <span>PO: {o.customer_po_number}</span>}
                              {o.courier_name && (
                                <span>
                                  {o.courier_name} {o.awb_number ?? ""}
                                </span>
                              )}
                              <span>Updated {daysFrom(o.updated_at)}d ago</span>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => setAdvance({ order: o, nextState: l.nextState })}
                          >
                            {l.nextLabel}
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <AdvanceDialog
          payload={advance}
          onClose={() => setAdvance(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["dispatch", "orders"] })}
        />
      </div>
    </div>
  );
}

function AdvanceDialog({
  payload,
  onClose,
  onSaved,
}: {
  payload: { order: OrderRow; nextState: PortalOrderState } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [customerNote, setCustomerNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [eta, setEta] = useState("");
  const [courier, setCourier] = useState("");
  const [awb, setAwb] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const order = payload?.order;
  const nextState = payload?.nextState;
  const isShipping = nextState === "dispatched" || nextState === "delivered";

  // Re-init when opening a new order
  if (order && eta === "" && order.customer_facing_eta) {
    // best-effort lazy seed; cleared on close
  }

  function close() {
    onClose();
    setCustomerNote("");
    setInternalNote("");
    setEta("");
    setCourier("");
    setAwb("");
    setTrackingUrl("");
  }

  async function save() {
    if (!order || !nextState) return;
    setSubmitting(true);
    try {
      const updates: Record<string, unknown> = {
        current_state: nextState,
      };
      if (eta) updates.customer_facing_eta = eta;
      if (isShipping) {
        updates.courier_name = courier || order.courier_name || null;
        updates.awb_number = awb || order.awb_number || null;
        updates.tracking_url = trackingUrl || order.tracking_url || null;
      }
      const { error: e1 } = await supabase
        .from("portal_orders")
        .update(updates as never)
        .eq("id", order.id);
      if (e1) throw e1;

      const { error: e2 } = await supabase
        .from("portal_state_transitions")
        .insert({
          order_id: order.id,
          from_state: order.current_state,
          to_state: nextState,
          actor_id: user?.id ?? null,
          customer_facing_note: customerNote || null,
          internal_note: internalNote || null,
        } as never);
      if (e2) throw e2;

      toast.success(`${order.order_number} → ${STATE_LABELS[nextState]}`);
      onSaved();
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {order?.order_number} → {nextState && STATE_LABELS[nextState]}
          </DialogTitle>
        </DialogHeader>
        {order && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Customer: {order.account?.company_name ?? "—"}
            </p>
            <div>
              <Label>Customer-facing note (shown in timeline)</Label>
              <Textarea
                rows={2}
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
              />
            </div>
            <div>
              <Label>Internal note</Label>
              <Textarea
                rows={2}
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
              />
            </div>
            <div>
              <Label>Update ETA (optional)</Label>
              <Input
                type="date"
                value={eta}
                onChange={(e) => setEta(e.target.value)}
              />
            </div>
            {isShipping && (
              <div className="grid grid-cols-2 gap-2 border-t pt-3">
                <div>
                  <Label>Courier</Label>
                  <Input
                    placeholder={order.courier_name ?? ""}
                    value={courier}
                    onChange={(e) => setCourier(e.target.value)}
                  />
                </div>
                <div>
                  <Label>AWB</Label>
                  <Input
                    placeholder={order.awb_number ?? ""}
                    value={awb}
                    onChange={(e) => setAwb(e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Tracking URL</Label>
                  <Input
                    placeholder={order.tracking_url ?? ""}
                    value={trackingUrl}
                    onChange={(e) => setTrackingUrl(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={save} disabled={submitting}>
            {submitting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}