import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, FileText, Trash2, Plus, RotateCcw, Wand2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Order } from '@/hooks/useOrders';
import { useOrderItems, OrderItem } from '@/hooks/useOrderItems';
import {
  DEFAULT_GST_RATE,
  DEFAULT_HSN,
  INDIAN_STATES,
  getGstTreatment,
  guessStateCode,
} from '@/lib/invoiceGst';
import {
  inferGstRate as ruleInferGstRate,
  inferGstRateFromWooLine as ruleInferGstRateFromWooLine,
  detectBundleDuplicates,
  reconcileProforma,
} from '@/lib/proformaRules';
import { computeProformaTotals, generateProformaPdf, ProformaLineInput } from '@/lib/invoicePdfGenerator';
import { uploadProformaInvoice, OrderInvoice } from '@/hooks/useOrderInvoices';
import type { WooCommerceOrder } from '@/hooks/useWooCommerceOrders';
import { InvoiceEmailControl, defaultEmailState, validateEmailState, InvoiceEmailState } from '@/components/orders/InvoiceEmailControl';
import { sendInvoiceEmail } from '@/lib/invoiceEmail';

interface Line {
  product_name: string;
  hsn: string;
  quantity: number;
  gross_total: number;
  gst_rate: number;
  /** Per-unit, GST-exclusive price. Used to recompute gross_total when qty/GST changes. */
  unit_price_excl: number;
  /** When true, the user-entered `gross_total` is treated as already GST-inclusive
   *  (default). When false, `gross_total` is the taxable amount and GST is added on top. */
  rate_includes_gst?: boolean;
}

const inferGstRate = ruleInferGstRate;
const inferGstRateFromWooLine = (it: any) => ruleInferGstRateFromWooLine(it, DEFAULT_HSN);

interface Props {
  /** Internal order — pass this OR wooOrder. */
  order?: Order | null;
  /** Website (WooCommerce) order — pass this OR order. */
  wooOrder?: WooCommerceOrder | null;
  /** When set, regenerates (replaces) this prior proforma; keeps the original number. */
  existingProforma?: OrderInvoice | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onGenerated?: () => void;
}

export function GenerateProformaDialog({
  order,
  wooOrder,
  existingProforma,
  open,
  onOpenChange,
  onGenerated,
}: Props) {
  const { user, profile, role } = useAuth();
  const { fetchOrderItems } = useOrderItems();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const canBypassEmail = role === 'admin' || role === 'finance';

  const isRegenerate = !!existingProforma;
  const isWoo = !!wooOrder;

  const [billTo, setBillTo] = useState({
    name: '', company: '', address: '', gstin: '', email: '', phone: '',
  });
  const [stateCode, setStateCode] = useState<string>('29');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [emailState, setEmailState] = useState<InvoiceEmailState>(defaultEmailState(''));

  const subject = useMemo(() => {
    if (order) {
      const o = order as any;
      return {
        id: order.id,
        order_number: order.order_number,
        customer_name: o.customer_name || '',
        customer_company: o.customer_company || '',
        address: o.shipping_address || o.billing_address || '',
        gstin: o.customer_gst || '',
        email: o.customer_email || '',
        phone: o.customer_phone || '',
        total: Number(o.total_sales_amount || 0),
        amount_paid: Number(o.amount_paid || 0),
        product_name: o.product_name || 'Order Total',
      };
    }
    if (wooOrder) {
      return {
        id: wooOrder.id,
        order_number: wooOrder.order_number || wooOrder.woo_order_id,
        customer_name: wooOrder.customer_name || '',
        customer_company: wooOrder.customer_company || '',
        address: wooOrder.shipping_address || '',
        gstin: '',
        email: wooOrder.customer_email || '',
        phone: wooOrder.customer_phone || '',
        total: Number(wooOrder.total_sales_amount || wooOrder.selling_price || 0),
        amount_paid: Number(wooOrder.amount_paid || 0),
        product_name: wooOrder.product_name || 'Order Total',
      };
    }
    return null;
  }, [order, wooOrder]);

  useEffect(() => {
    if (!open || !subject) return;
    setBillTo({
      name: subject.customer_name,
      company: subject.customer_company,
      address: subject.address,
      gstin: subject.gstin,
      email: subject.email,
      phone: subject.phone,
    });
    setEmailState(defaultEmailState(subject.email));
    if (isRegenerate && existingProforma?.place_of_supply) {
      const m = existingProforma.place_of_supply.match(/\((\d{2})\)/);
      if (m) {
        setStateCode(m[1]);
      } else {
        setStateCode(guessStateCode(subject.address + ' ' + subject.customer_company).code);
      }
    } else {
      setStateCode(guessStateCode(subject.address + ' ' + subject.customer_company).code);
    }
    setNotes('');

    (async () => {
      setLoading(true);
      try {
        let items: OrderItem[] = [];
        if (order) {
          items = await fetchOrderItems(order.id);
        }
        if (items.length === 0) {
          if (wooOrder && Array.isArray(wooOrder.line_items) && (wooOrder.line_items as any[]).length > 0) {
            const wli = wooOrder.line_items as any[];
            setLines(wli.map((it) => {
              const qty = Number(it.quantity ?? it.qty ?? 1) || 1;
              const total = Number(it.total ?? it.subtotal ?? (Number(it.price) || 0) * qty) || 0;
              const gross = Math.round(total * 100) / 100;
              const name = it.name || it.product_name || 'Item';
              const rate = inferGstRateFromWooLine(it);
              const unitExcl = qty > 0 ? (gross / qty) / (1 + rate / 100) : 0;
              return {
                product_name: name,
                hsn: DEFAULT_HSN,
                quantity: qty,
                gross_total: gross,
                gst_rate: rate,
                unit_price_excl: Math.round(unitExcl * 10000) / 10000,
              };
            }));
          } else {
            const qty = 1;
            const gross = subject.total;
            const rate = inferGstRate(subject.product_name, DEFAULT_HSN);
            const unitExcl = (gross / qty) / (1 + rate / 100);
            setLines([{
              product_name: subject.product_name,
              hsn: DEFAULT_HSN,
              quantity: qty,
              gross_total: gross,
              gst_rate: rate,
              unit_price_excl: Math.round(unitExcl * 10000) / 10000,
            }]);
          }
        } else {
          setLines(items.map((it) => {
            const qty = Number(it.quantity) || 1;
            const unit = Number(it.unit_price) || 0;
            const rate = Number(it.sales_gst_percent) || inferGstRate(it.product_name, DEFAULT_HSN);
            const includes = it.sales_price_includes_gst !== false;
            const unitExcl = includes ? unit / (1 + rate / 100) : unit;
            const gross = unitExcl * qty * (1 + rate / 100);
            return {
              product_name: it.product_name,
              hsn: DEFAULT_HSN,
              quantity: qty,
              gross_total: Math.round(gross * 100) / 100,
              gst_rate: rate,
              unit_price_excl: Math.round(unitExcl * 10000) / 10000,
            };
          }));
        }
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subject?.id, isRegenerate, existingProforma?.id]);

  const treatment = useMemo(() => getGstTreatment(stateCode), [stateCode]);

  const previewTotals = useMemo(() => {
    if (!subject) return null;
    return computeProformaTotals({
      proforma_number: 'XPF-PREVIEW',
      invoice_date: new Date(),
      bill_to: { name: billTo.name },
      place_of_supply_code: stateCode,
      place_of_supply_name: INDIAN_STATES.find((s) => s.code === stateCode)?.name || stateCode,
      treatment,
      items: lines as ProformaLineInput[],
      amount_paid: subject.amount_paid,
    });
  }, [subject, billTo.name, stateCode, treatment, lines]);

  const updateLine = (idx: number, patch: Partial<Line>) => {
    setLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      const next = { ...l, ...patch };
      const qtyOrRateChanged = 'quantity' in patch || 'gst_rate' in patch;
      const grossEdited = 'gross_total' in patch;
      if (grossEdited) {
        // User typed a new total — back-derive per-unit ex-GST price.
        const qty = Number(next.quantity) || 0;
        const rate = Number(next.gst_rate) || 0;
        next.unit_price_excl = qty > 0
          ? Math.round((next.gross_total / qty) / (1 + rate / 100) * 10000) / 10000
          : 0;
      } else if (qtyOrRateChanged) {
        // Recompute total from the locked-in per-unit ex-GST price.
        const qty = Number(next.quantity) || 0;
        const rate = Number(next.gst_rate) || 0;
        next.gross_total = Math.round(next.unit_price_excl * qty * (1 + rate / 100) * 100) / 100;
      }
      return next;
    }));
  };
  const addLine = () => setLines((prev) => [...prev, {
    product_name: '', hsn: DEFAULT_HSN, quantity: 1, gross_total: 0, gst_rate: 18, unit_price_excl: 0,
  }]);
  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));

  const handleGenerate = async () => {
    if (!subject || !user) return;
    if (lines.length === 0) { toast.error('Add at least one line item'); return; }
    if (lines.some((l) => !l.product_name.trim() || l.gross_total <= 0)) {
      toast.error('Every line needs a name and a positive amount'); return;
    }
    // Validate email control BEFORE saving the invoice
    let emailPlan: { mode: 'auto' | 'skip'; email?: string; bypassReason?: string };
    try {
      emailPlan = validateEmailState(emailState);
    } catch (e: any) {
      toast.error(e.message);
      return;
    }
    setBusy(true);
    try {
      // If sending, persist the email back onto the source order/woo_order
      if (emailPlan.mode === 'auto' && emailPlan.email) {
        if (order) {
          await supabase.from('orders').update({ customer_email: emailPlan.email }).eq('id', order.id);
        } else if (wooOrder) {
          await (supabase.from('woocommerce_orders') as any)
            .update({ customer_email: emailPlan.email }).eq('id', wooOrder.id);
        }
      }
      let proformaNumber: string;
      if (isRegenerate && existingProforma?.invoice_number) {
        proformaNumber = existingProforma.invoice_number;
      } else {
        const { data: numData, error: numErr } = await (supabase.rpc as any)('get_next_proforma_number');
        if (numErr) throw numErr;
        proformaNumber = numData as string;
      }

      const stateName = INDIAN_STATES.find((s) => s.code === stateCode)?.name || stateCode;
      const amountPaid = subject.amount_paid;

      const { blob, totals } = await generateProformaPdf({
        proforma_number: proformaNumber,
        invoice_date: new Date(),
        order_number: subject.order_number,
        bill_to: billTo,
        place_of_supply_code: stateCode,
        place_of_supply_name: stateName,
        treatment,
        items: lines,
        amount_paid: amountPaid,
        notes,
      });

      const generatedByName = (profile as any)?.full_name || user.email || null;
      const saved = await uploadProformaInvoice(
        {
          orderId: order ? order.id : null,
          woocommerceOrderId: wooOrder ? wooOrder.id : null,
          replaceInvoiceId: existingProforma?.id || null,
          generatedByName,
          auditSnapshot: {
            kind: order ? 'order' : 'woocommerce_order',
            order_number: subject.order_number,
            place_of_supply_code: stateCode,
            place_of_supply_name: stateName,
            treatment,
            lines: lines.map((l) => ({
              product_name: l.product_name,
              hsn: l.hsn,
              quantity: l.quantity,
              gst_rate: l.gst_rate,
              gross_total: l.gross_total,
            })),
            bill_to: billTo,
            notes,
            mode: isRegenerate ? 'regenerated' : 'generated',
          },
        },
        user.id,
        blob,
        {
          invoice_number: proformaNumber,
          subtotal: totals.subtotal,
          tax_amount: totals.tax,
          total: totals.total,
          amount_paid: totals.amount_paid,
          place_of_supply: `${stateName} (${stateCode})`,
          gst_treatment: treatment,
          tax_breakup: totals.tax_breakup,
        },
      );

      if (!saved) throw new Error('Failed to save proforma');

      toast.success(`Proforma ${proformaNumber} ${isRegenerate ? 'regenerated' : 'generated'}`);

      // Fire-and-forget email send (or skip log). Never blocks save.
      if (emailPlan.mode === 'auto') {
        sendInvoiceEmail({
          invoice_id: (saved as any).id,
          to_email: emailPlan.email,
          mode: 'auto',
        }).catch(() => {});
      } else {
        sendInvoiceEmail({
          invoice_id: (saved as any).id,
          mode: 'skip',
          bypass_reason: emailPlan.bypassReason,
          silent: true,
        }).catch(() => {});
      }

      onGenerated?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to generate proforma');
    } finally {
      setBusy(false);
    }
  };

  if (!subject) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isRegenerate ? <RotateCcw className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
            {isRegenerate ? 'Regenerate Proforma Invoice' : 'Generate Proforma Invoice'}
          </DialogTitle>
          <DialogDescription>
            {isRegenerate ? 'Overwrites the prior XBoom proforma for ' : 'Self-generated Proforma for '}
            {isWoo ? 'website order ' : 'order '}
            <span className="font-mono">{subject.order_number}</span>
            {isRegenerate && existingProforma?.invoice_number ? (
              <> — keeps number <span className="font-mono">{existingProforma.invoice_number}</span>.</>
            ) : '.'} Zoho remains the official tax invoice.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-muted-foreground">
            <Loader2 className="h-5 w-5 inline animate-spin mr-2" />Loading order…
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Customer Name</Label>
                <Input value={billTo.name} onChange={(e) => setBillTo((b) => ({ ...b, name: e.target.value }))} />
              </div>
              <div>
                <Label>Company</Label>
                <Input value={billTo.company} onChange={(e) => setBillTo((b) => ({ ...b, company: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <Label>Address</Label>
                <Textarea rows={2} value={billTo.address} onChange={(e) => setBillTo((b) => ({ ...b, address: e.target.value }))} />
              </div>
              <div>
                <Label>GSTIN</Label>
                <Input value={billTo.gstin} onChange={(e) => setBillTo((b) => ({ ...b, gstin: e.target.value }))} />
              </div>
              <div>
                <Label>Place of Supply</Label>
                <Select value={stateCode} onValueChange={setStateCode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {INDIAN_STATES.map((s) => (
                      <SelectItem key={s.code} value={s.code}>{s.name} ({s.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {treatment === 'cgst_sgst' ? 'Intra-state → CGST + SGST' : 'Inter-state → IGST'}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Line Items (amounts are GST-inclusive)</Label>
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  <Plus className="h-4 w-4 mr-1" /> Add line
                </Button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-2">Item</th>
                      <th className="text-left p-2 w-28">HSN/SAC</th>
                      <th className="text-right p-2 w-16">Qty</th>
                      <th className="text-right p-2 w-24">GST %</th>
                      <th className="text-right p-2 w-32">Total (₹, incl)</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="p-1.5"><Input value={l.product_name} onChange={(e) => updateLine(idx, { product_name: e.target.value })} /></td>
                        <td className="p-1.5"><Input value={l.hsn} onChange={(e) => updateLine(idx, { hsn: e.target.value })} /></td>
                        <td className="p-1.5"><Input type="number" min={1} value={l.quantity} onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) || 0 })} className="text-right" /></td>
                        <td className="p-1.5"><Input type="number" step="0.01" value={l.gst_rate} onChange={(e) => updateLine(idx, { gst_rate: Number(e.target.value) || 0 })} className="text-right" /></td>
                        <td className="p-1.5"><Input type="number" step="0.01" value={l.gross_total} onChange={(e) => updateLine(idx, { gross_total: Number(e.target.value) || 0 })} className="text-right" /></td>
                        <td className="p-1.5 text-center">
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeLine(idx)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {lines.length === 0 && (
                      <tr><td colSpan={6} className="p-3 text-center text-muted-foreground">No lines yet — add one above.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {previewTotals && (
              <div className="border rounded-lg p-3 bg-muted/40 text-sm space-y-1">
                <div className="flex justify-between"><span>Sub Total (Taxable)</span><span>₹{previewTotals.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                {treatment === 'cgst_sgst' ? (
                  <>
                    <div className="flex justify-between"><span>CGST</span><span>₹{previewTotals.cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                    <div className="flex justify-between"><span>SGST</span><span>₹{previewTotals.sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                  </>
                ) : (
                  <div className="flex justify-between"><span>IGST</span><span>₹{previewTotals.igst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                )}
                <div className="flex justify-between font-semibold border-t pt-1"><span>Total</span><span>₹{previewTotals.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Payment Made</span><span>− ₹{previewTotals.amount_paid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between font-bold text-orange-600"><span>Balance Due</span><span>₹{previewTotals.balance_due.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              </div>
            )}

            <div>
              <Label>Notes (optional)</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <InvoiceEmailControl
              state={emailState}
              onChange={setEmailState}
              canBypass={canBypassEmail}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleGenerate} disabled={busy || loading}>
            {busy ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{isRegenerate ? 'Regenerating…' : 'Generating…'}</>
            ) : isRegenerate ? (
              <><RotateCcw className="h-4 w-4 mr-2" />Regenerate Proforma</>
            ) : (
              <><FileText className="h-4 w-4 mr-2" />Generate Proforma</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}