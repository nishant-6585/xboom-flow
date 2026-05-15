import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2, Plus, ArrowLeft } from "lucide-react";

type Account = { id: string; company_name: string };
type Product = { id: string; name: string; sku: string | null; catalog_price: number | null; unit: string | null };
type Line = { product_id: string | null; product_name_snapshot: string; description: string; quantity: number; unit_price: number };

const GST_RATE = 0.18;

export default function PortalOrderCreate() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [poNumber, setPoNumber] = useState("");
  const [eta, setEta] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("Net 30");
  const [deliveryCommitment, setDeliveryCommitment] = useState("");
  const [daasTier, setDaasTier] = useState<string>("none");
  const [daasExpiresAt, setDaasExpiresAt] = useState("");
  const [amcExpiresAt, setAmcExpiresAt] = useState("");
  const [discount, setDiscount] = useState(0);
  const [discountReason, setDiscountReason] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { product_id: null, product_name_snapshot: "", description: "", quantity: 1, unit_price: 0 },
  ]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: a }, { data: p }] = await Promise.all([
        supabase.from("portal_accounts").select("id, company_name").order("company_name"),
        supabase.from("portal_products").select("id, name, sku, catalog_price, unit").eq("active", true).order("name"),
      ]);
      setAccounts((a ?? []) as Account[]);
      setProducts((p ?? []) as Product[]);
    })();
  }, []);

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0),
    [lines],
  );
  const taxable = Math.max(0, subtotal - (Number(discount) || 0));
  const gst = +(taxable * GST_RATE).toFixed(2);
  const total = +(taxable + gst).toFixed(2);

  const updateLine = (idx: number, patch: Partial<Line>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };
  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));
  const addLine = () =>
    setLines((prev) => [...prev, { product_id: null, product_name_snapshot: "", description: "", quantity: 1, unit_price: 0 }]);
  const onSelectProduct = (idx: number, productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    updateLine(idx, {
      product_id: p.id,
      product_name_snapshot: p.name,
      unit_price: Number(p.catalog_price ?? 0),
    });
  };

  const submit = async () => {
    if (!accountId) return toast.error("Select a customer account");
    if (lines.length === 0) return toast.error("Add at least one line item");
    for (const l of lines) {
      if (!l.product_name_snapshot.trim()) return toast.error("Each line needs a product name");
      if (l.quantity <= 0 || l.unit_price < 0) return toast.error("Invalid quantity or price");
    }
    setSubmitting(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const today = new Date();
      const datePart = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
      const rand = Math.floor(1000 + Math.random() * 9000);
      const orderNumberCandidate = `POR-${datePart}-${rand}`;
      const { data: order, error } = await supabase
        .from("portal_orders")
        .insert([{
          order_number: orderNumberCandidate,
          account_id: accountId,
          assigned_rep_id: u?.user?.id ?? null,
          current_state: "draft",
          customer_facing_eta: eta || null,
          customer_po_number: poNumber || null,
          payment_terms: paymentTerms || null,
          delivery_commitment: deliveryCommitment || null,
          daas_tier: daasTier === "none" ? null : daasTier,
          daas_expires_at: daasExpiresAt || null,
          amc_expires_at: amcExpiresAt || null,
          discount_amount: Number(discount) || 0,
          discount_reason: discountReason || null,
          subtotal,
          gst_amount: gst,
          total,
          portal_visible: false,
        }])
        .select("id, order_number")
        .single();
      if (error) throw error;

      const orderId = (order as { id: string; order_number: string }).id;
      const orderNumber = (order as { id: string; order_number: string }).order_number;

      const itemsPayload = lines.map((l) => ({
        order_id: orderId,
        product_id: l.product_id,
        product_name_snapshot: l.product_name_snapshot,
        description: l.description || null,
        quantity: l.quantity,
        unit_price: l.unit_price,
        total: +(l.quantity * l.unit_price).toFixed(2),
        line_state: "draft",
      }));
      const { error: liErr } = await supabase.from("portal_order_line_items").insert(itemsPayload);
      if (liErr) throw liErr;

      await supabase.from("portal_state_transitions").insert({
        order_id: orderId,
        from_state: null,
        to_state: "draft",
        actor_id: u?.user?.id ?? null,
        customer_facing_note: customerNote || null,
        internal_note: internalNote || `Order created on behalf of customer.${poNumber ? ` PO: ${poNumber}` : ""}`,
      });

      toast.success(`Order ${orderNumber} created`);
      navigate("/admin/portal-orders");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container max-w-5xl py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/portal-orders")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <h1 className="text-2xl font-bold">Create order on behalf</h1>
      </div>

      <Card>
        <CardHeader><CardTitle>Customer & terms</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Customer account *</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.company_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Customer PO #</Label>
            <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="PO-2025-001" />
          </div>
          <div className="space-y-1.5">
            <Label>Payment terms</Label>
            <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Customer-facing ETA</Label>
            <Input type="date" value={eta} onChange={(e) => setEta(e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Delivery commitment</Label>
            <Input value={deliveryCommitment} onChange={(e) => setDeliveryCommitment(e.target.value)} placeholder="e.g. FOB Bengaluru, 4 weeks" />
          </div>
          <div className="space-y-1.5">
            <Label>DaaS tier</Label>
            <Select value={daasTier} onValueChange={setDaasTier}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="basic">Basic</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="premium">Premium</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>DaaS expires on</Label>
            <Input type="date" value={daasExpiresAt} onChange={(e) => setDaasExpiresAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>AMC expires on</Label>
            <Input type="date" value={amcExpiresAt} onChange={(e) => setAmcExpiresAt(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Line items</CardTitle>
          <Button size="sm" variant="outline" onClick={addLine}><Plus className="h-4 w-4 mr-1" /> Add line</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end border rounded-lg p-3">
              <div className="col-span-12 md:col-span-4 space-y-1">
                <Label className="text-xs">Product</Label>
                <Select value={l.product_id ?? ""} onValueChange={(v) => onSelectProduct(i, v)}>
                  <SelectTrigger><SelectValue placeholder="From catalog (optional)" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input className="mt-1" placeholder="Or custom product name *" value={l.product_name_snapshot}
                  onChange={(e) => updateLine(i, { product_name_snapshot: e.target.value })} />
              </div>
              <div className="col-span-12 md:col-span-3 space-y-1">
                <Label className="text-xs">Description</Label>
                <Input value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} />
              </div>
              <div className="col-span-4 md:col-span-1 space-y-1">
                <Label className="text-xs">Qty</Label>
                <Input type="number" min={1} value={l.quantity}
                  onChange={(e) => updateLine(i, { quantity: Number(e.target.value) || 0 })} />
              </div>
              <div className="col-span-4 md:col-span-2 space-y-1">
                <Label className="text-xs">Unit price (₹)</Label>
                <Input type="number" min={0} step="0.01" value={l.unit_price}
                  onChange={(e) => updateLine(i, { unit_price: Number(e.target.value) || 0 })} />
              </div>
              <div className="col-span-3 md:col-span-1 text-right text-sm font-medium">
                ₹{(l.quantity * l.unit_price).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </div>
              <div className="col-span-1 flex justify-end">
                <Button variant="ghost" size="icon" onClick={() => removeLine(i)} disabled={lines.length === 1}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Discount & notes</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Discount (₹)</Label>
            <Input type="number" min={0} value={discount} onChange={(e) => setDiscount(Number(e.target.value) || 0)} />
          </div>
          <div className="space-y-1.5">
            <Label>Discount reason</Label>
            <Input value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Internal note (staff only)</Label>
            <Textarea rows={2} value={internalNote} onChange={(e) => setInternalNote(e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Customer-facing note (shown in order timeline once visible)</Label>
            <Textarea rows={2} value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-end gap-1 text-sm">
            <div>Subtotal: <strong>₹{subtotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong></div>
            <div>Discount: −₹{Number(discount).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div>
            <div>GST (18%): ₹{gst.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div>
            <div className="text-lg">Total: <strong>₹{total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong></div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => navigate("/admin/portal-orders")} disabled={submitting}>Cancel</Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? "Creating..." : "Create order"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-3 text-right">
            Order will be created in <strong>draft</strong> state and hidden from the portal until you flip <em>portal_visible</em> on the order detail.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}