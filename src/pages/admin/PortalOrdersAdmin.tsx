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
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, Package } from "lucide-react";
import { toast } from "sonner";
import {
  CUSTOMER_TIMELINE,
  STATE_LABELS,
  type PortalOrderState,
} from "@/portal/lib/orderStates";

const ALL_STATES: PortalOrderState[] = [
  "draft",
  "quote_sent",
  "quote_revised",
  "approved",
  "po_received",
  "confirmed",
  "in_production",
  "qc_ready",
  "dispatched",
  "delivered",
  "closed",
  "cancelled",
];

interface AccountOpt {
  id: string;
  company_name: string;
}

interface OrderRow {
  id: string;
  order_number: string;
  account_id: string;
  current_state: PortalOrderState;
  total: number | null;
  customer_facing_eta: string | null;
  customer_po_number: string | null;
  portal_visible: boolean;
  assigned_rep_id: string | null;
  courier_name: string | null;
  awb_number: string | null;
  tracking_url: string | null;
  created_at: string;
  updated_at: string;
  account?: { company_name: string } | null;
}

interface LineDraft {
  product_name: string;
  description: string;
  quantity: number;
  unit_price: number;
}

function fmtMoney(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function PortalOrdersAdmin() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [stateOrder, setStateOrder] = useState<OrderRow | null>(null);
  const [scope, setScope] = useState<"all" | "mine">("all");

  const canAccess =
    role === "admin" ||
    role === "supply_chain" ||
    role === "sales" ||
    role === "sales_manager";

  const { data: orders, isLoading } = useQuery({
    queryKey: ["admin", "portal-orders"],
    enabled: canAccess,
    queryFn: async (): Promise<OrderRow[]> => {
      const { data, error } = await supabase
        .from("portal_orders")
        .select(
          "id, order_number, account_id, current_state, total, customer_facing_eta, customer_po_number, portal_visible, assigned_rep_id, courier_name, awb_number, tracking_url, created_at, updated_at, account:portal_accounts(company_name)",
        )
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown) as OrderRow[];
    },
  });

  const filtered = useMemo(() => {
    if (scope === "mine" && user?.id)
      return (orders ?? []).filter((o) => o.assigned_rep_id === user.id);
    return orders ?? [];
  }, [orders, scope, user?.id]);

  if (!canAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Access restricted to sales / supply chain staff.
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />
      <div className="container mx-auto px-4 sm:px-6 py-6 max-w-6xl">
        <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Portal Orders</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Create orders on behalf of customers and manage delivery status.
            </p>
          </div>
          <div className="flex gap-2">
            <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All reps</SelectItem>
                <SelectItem value="mine">Mine</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> New order
            </Button>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <Card>
            <CardContent className="py-14 flex flex-col items-center text-center">
              <Package className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="font-medium">No portal orders yet</p>
              <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Create first order
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {filtered.map((o) => (
            <Card
              key={o.id}
              className="cursor-pointer hover:border-primary/40 transition"
              onClick={() => setStateOrder(o)}
            >
              <CardContent className="py-4 px-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{o.order_number}</span>
                      <Badge variant="outline" className="text-xs">
                        {STATE_LABELS[o.current_state]}
                      </Badge>
                      {!o.portal_visible && (
                        <Badge variant="secondary" className="text-xs">
                          Hidden
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm mt-1.5 text-muted-foreground">
                      {o.account?.company_name ?? "—"}
                    </p>
                    <div className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      <span>{fmtMoney(o.total)}</span>
                      {o.customer_facing_eta && (
                        <span>ETA {fmtDate(o.customer_facing_eta)}</span>
                      )}
                      {o.customer_po_number && <span>PO: {o.customer_po_number}</span>}
                      <span>Updated {fmtDate(o.updated_at)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <CreateOrderDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={() =>
            qc.invalidateQueries({ queryKey: ["admin", "portal-orders"] })
          }
        />

        <UpdateStateDialog
          order={stateOrder}
          onClose={() => setStateOrder(null)}
          onSaved={() =>
            qc.invalidateQueries({ queryKey: ["admin", "portal-orders"] })
          }
        />
      </div>
    </div>
  );
}

/* ---------------- Create Order Dialog ---------------- */

function CreateOrderDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const [accountId, setAccountId] = useState<string>("");
  const [poNumber, setPoNumber] = useState("");
  const [eta, setEta] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [deliveryCommitment, setDeliveryCommitment] = useState("");
  const [discount, setDiscount] = useState<number>(0);
  const [gstRate, setGstRate] = useState<number>(18);
  const [portalVisible, setPortalVisible] = useState(true);
  const [items, setItems] = useState<LineDraft[]>([
    { product_name: "", description: "", quantity: 1, unit_price: 0 },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const { data: accounts } = useQuery({
    queryKey: ["admin", "portal-accounts-options"],
    enabled: open,
    queryFn: async (): Promise<AccountOpt[]> => {
      const { data, error } = await supabase
        .from("portal_accounts")
        .select("id, company_name")
        .eq("status", "active")
        .order("company_name");
      if (error) throw error;
      return (data ?? []) as AccountOpt[];
    },
  });

  const subtotal = items.reduce(
    (s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
    0,
  );
  const taxable = Math.max(0, subtotal - (Number(discount) || 0));
  const gstAmount = (taxable * (Number(gstRate) || 0)) / 100;
  const total = taxable + gstAmount;

  function reset() {
    setAccountId("");
    setPoNumber("");
    setEta("");
    setPaymentTerms("");
    setDeliveryCommitment("");
    setDiscount(0);
    setGstRate(18);
    setPortalVisible(true);
    setItems([{ product_name: "", description: "", quantity: 1, unit_price: 0 }]);
  }

  async function submit() {
    if (!accountId) {
      toast.error("Pick a customer account");
      return;
    }
    const validItems = items.filter(
      (it) => it.product_name.trim() && it.quantity > 0,
    );
    if (validItems.length === 0) {
      toast.error("Add at least one line item");
      return;
    }
    setSubmitting(true);
    try {
      const { data: order, error: e1 } = await supabase
        .from("portal_orders")
        .insert({
          account_id: accountId,
          assigned_rep_id: user?.id ?? null,
          current_state: "draft",
          portal_visible: portalVisible,
          customer_po_number: poNumber || null,
          customer_facing_eta: eta || null,
          payment_terms: paymentTerms || null,
          delivery_commitment: deliveryCommitment || null,
          subtotal,
          discount_amount: discount || 0,
          gst_amount: gstAmount,
          total,
        } as never)
        .select("id, order_number")
        .single();
      if (e1) throw e1;
      const orderId = (order as { id: string; order_number: string }).id;

      const itemsPayload = validItems.map((it) => ({
        order_id: orderId,
        product_name_snapshot: it.product_name.trim(),
        description: it.description || null,
        quantity: it.quantity,
        unit_price: it.unit_price,
        total: it.quantity * it.unit_price,
      }));
      const { error: e2 } = await supabase
        .from("portal_order_line_items")
        .insert(itemsPayload as never);
      if (e2) throw e2;

      toast.success(
        `Order ${(order as { order_number: string }).order_number} created`,
      );
      onCreated();
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Couldn't create order",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create order on behalf of customer</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Customer account *</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {(accounts ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Customer PO #</Label>
              <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
            </div>
            <div>
              <Label>Customer-facing ETA</Label>
              <Input
                type="date"
                value={eta}
                onChange={(e) => setEta(e.target.value)}
              />
            </div>
            <div>
              <Label>Payment terms</Label>
              <Input
                placeholder="e.g. 30% advance, 70% on dispatch"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Delivery commitment</Label>
              <Textarea
                rows={2}
                value={deliveryCommitment}
                onChange={(e) => setDeliveryCommitment(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Line items</Label>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setItems((prev) => [
                    ...prev,
                    { product_name: "", description: "", quantity: 1, unit_price: 0 },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 items-start border rounded p-2"
                >
                  <Input
                    className="col-span-5"
                    placeholder="Product"
                    value={it.product_name}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((p, i) =>
                          i === idx ? { ...p, product_name: e.target.value } : p,
                        ),
                      )
                    }
                  />
                  <Input
                    className="col-span-2"
                    type="number"
                    min={1}
                    value={it.quantity}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((p, i) =>
                          i === idx
                            ? { ...p, quantity: Number(e.target.value) }
                            : p,
                        ),
                      )
                    }
                  />
                  <Input
                    className="col-span-3"
                    type="number"
                    min={0}
                    placeholder="Unit price"
                    value={it.unit_price}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((p, i) =>
                          i === idx
                            ? { ...p, unit_price: Number(e.target.value) }
                            : p,
                        ),
                      )
                    }
                  />
                  <div className="col-span-1 text-right text-sm pt-2">
                    {fmtMoney(it.quantity * it.unit_price || 0)}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="col-span-1"
                    onClick={() =>
                      setItems((prev) => prev.filter((_, i) => i !== idx))
                    }
                    disabled={items.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Textarea
                    className="col-span-12"
                    rows={1}
                    placeholder="Description / notes (optional)"
                    value={it.description}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((p, i) =>
                          i === idx ? { ...p, description: e.target.value } : p,
                        ),
                      )
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label>Discount (₹)</Label>
              <Input
                type="number"
                min={0}
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>GST %</Label>
              <Input
                type="number"
                min={0}
                max={28}
                value={gstRate}
                onChange={(e) => setGstRate(Number(e.target.value))}
              />
            </div>
            <div className="col-span-2 flex items-end justify-end gap-2">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Subtotal {fmtMoney(subtotal)}</p>
                <p className="text-xs text-muted-foreground">GST {fmtMoney(gstAmount)}</p>
                <p className="font-semibold">Total {fmtMoney(total)}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <div>
              <p className="text-sm font-medium">Visible to customer</p>
              <p className="text-xs text-muted-foreground">
                Off keeps it as a private internal draft.
              </p>
            </div>
            <Switch checked={portalVisible} onCheckedChange={setPortalVisible} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Create order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Update State Dialog ---------------- */

function UpdateStateDialog({
  order,
  onClose,
  onSaved,
}: {
  order: OrderRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [newState, setNewState] = useState<PortalOrderState | "">("");
  const [customerNote, setCustomerNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [eta, setEta] = useState("");
  const [courier, setCourier] = useState("");
  const [awb, setAwb] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [portalVisible, setPortalVisible] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Reset on order change
  if (order && newState === "") {
    setNewState(order.current_state);
    setEta(order.customer_facing_eta ?? "");
    setCourier(order.courier_name ?? "");
    setAwb(order.awb_number ?? "");
    setTrackingUrl(order.tracking_url ?? "");
    setPortalVisible(order.portal_visible);
  }

  function close() {
    onClose();
    setNewState("");
    setCustomerNote("");
    setInternalNote("");
  }

  async function save() {
    if (!order || !newState) return;
    setSubmitting(true);
    try {
      const updates: Record<string, unknown> = {
        current_state: newState,
        portal_visible: portalVisible,
        customer_facing_eta: eta || null,
        courier_name: courier || null,
        awb_number: awb || null,
        tracking_url: trackingUrl || null,
      };
      const { error: e1 } = await supabase
        .from("portal_orders")
        .update(updates as never)
        .eq("id", order.id);
      if (e1) throw e1;

      if (newState !== order.current_state) {
        const { error: e2 } = await supabase
          .from("portal_state_transitions")
          .insert({
            order_id: order.id,
            from_state: order.current_state,
            to_state: newState,
            actor_id: user?.id ?? null,
            customer_facing_note: customerNote || null,
            internal_note: internalNote || null,
          } as never);
        if (e2) throw e2;
      }

      toast.success("Order updated");
      onSaved();
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update");
    } finally {
      setSubmitting(false);
    }
  }

  const isShipping =
    newState === "dispatched" || newState === "delivered";

  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {order?.order_number} — Update status
          </DialogTitle>
        </DialogHeader>
        {order && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Current: <strong>{STATE_LABELS[order.current_state]}</strong> · Customer:{" "}
              {order.account?.company_name ?? "—"}
            </p>

            <div>
              <Label>New state</Label>
              <Select
                value={newState}
                onValueChange={(v) => setNewState(v as PortalOrderState)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_STATES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATE_LABELS[s]}
                      {CUSTOMER_TIMELINE.includes(s) ? "" : "  ·"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Customer-facing note</Label>
              <Textarea
                rows={2}
                placeholder="Shown in customer timeline"
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
              />
            </div>
            <div>
              <Label>Internal note (private)</Label>
              <Textarea
                rows={2}
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
              />
            </div>

            <div>
              <Label>Customer-facing ETA</Label>
              <Input
                type="date"
                value={eta}
                onChange={(e) => setEta(e.target.value)}
              />
            </div>

            {isShipping && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t pt-3">
                <div>
                  <Label>Courier</Label>
                  <Input
                    value={courier}
                    onChange={(e) => setCourier(e.target.value)}
                  />
                </div>
                <div>
                  <Label>AWB / Tracking #</Label>
                  <Input value={awb} onChange={(e) => setAwb(e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Tracking URL</Label>
                  <Input
                    value={trackingUrl}
                    onChange={(e) => setTrackingUrl(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-t pt-3">
              <div>
                <p className="text-sm font-medium">Visible to customer</p>
              </div>
              <Switch
                checked={portalVisible}
                onCheckedChange={setPortalVisible}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={save} disabled={submitting || !newState}>
            {submitting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}