import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, FileText, Trash2, Plus } from 'lucide-react';
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
import { computeProformaTotals, generateProformaPdf, ProformaLineInput } from '@/lib/invoicePdfGenerator';
import { uploadProformaInvoice } from '@/hooks/useOrderInvoices';

interface Line {
  product_name: string;
  hsn: string;
  quantity: number;
  gross_total: number;
  gst_rate: number;
}

interface Props {
  order: Order | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onGenerated?: () => void;
}

export function GenerateProformaDialog({ order, open, onOpenChange, onGenerated }: Props) {
  const { user } = useAuth();
  const { fetchOrderItems } = useOrderItems();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [billTo, setBillTo] = useState({
    name: '', company: '', address: '', gstin: '', email: '', phone: '',
  });
  const [stateCode, setStateCode] = useState<string>('29');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([]);

  // Load order data when opened
  useEffect(() => {
    if (!open || !order) return;
    const o = order as any;
    setBillTo({
      name: o.customer_name || '',
      company: o.customer_company || '',
      address: o.shipping_address || o.billing_address || '',
      gstin: o.customer_gst || '',
      email: o.customer_email || '',
      phone: o.customer_phone || '',
    });
    const guess = guessStateCode((o.shipping_address || o.billing_address || '') + ' ' + (o.customer_company || ''));
    setStateCode(guess.code);
    setNotes('');

    (async () => {
      setLoading(true);
      try {
        const items: OrderItem[] = await fetchOrderItems(order.id);
        if (items.length === 0) {
          // Fallback to a single line representing the order total
          setLines([{
            product_name: o.product_name || 'Order Total',
            hsn: DEFAULT_HSN,
            quantity: 1,
            gross_total: Number(o.total_sales_amount || 0),
            gst_rate: DEFAULT_GST_RATE,
          }]);
        } else {
          setLines(items.map(it => {
            const qty = Number(it.quantity) || 1;
            const unit = Number(it.unit_price) || 0;
            const rate = Number(it.sales_gst_percent ?? DEFAULT_GST_RATE);
            const includes = it.sales_price_includes_gst !== false; // default treat as inclusive
            const lineTotalExcl = unit * qty;
            const gross = includes ? lineTotalExcl : lineTotalExcl * (1 + rate / 100);
            return {
              product_name: it.product_name,
              hsn: it.product_code || DEFAULT_HSN,
              quantity: qty,
              gross_total: Math.round(gross * 100) / 100,
              gst_rate: rate,
            };
          }));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [open, order, fetchOrderItems]);

  const treatment = useMemo(() => getGstTreatment(stateCode), [stateCode]);

  const previewTotals = useMemo(() => {
    if (!order) return null;
    return computeProformaTotals({
      proforma_number: 'XPF-PREVIEW',
      invoice_date: new Date(),
      bill_to: { name: billTo.name },
      place_of_supply_code: stateCode,
      place_of_supply_name: INDIAN_STATES.find(s => s.code === stateCode)?.name || stateCode,
      treatment,
      items: lines as ProformaLineInput[],
      amount_paid: Number((order as any).amount_paid || 0),
    });
  }, [order, billTo.name, stateCode, treatment, lines]);

  const updateLine = (idx: number, patch: Partial<Line>) => {
    setLines(prev => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };
  const addLine = () => setLines(prev => [...prev, {
    product_name: '', hsn: DEFAULT_HSN, quantity: 1, gross_total: 0, gst_rate: DEFAULT_GST_RATE,
  }]);
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));

  const handleGenerate = async () => {
    if (!order || !user) return;
    if (lines.length === 0) { toast.error('Add at least one line item'); return; }
    if (lines.some(l => !l.product_name.trim() || l.gross_total <= 0)) {
      toast.error('Every line needs a name and a positive amount'); return;
    }
    setBusy(true);
    try {
      // Get proforma number
      const { data: numData, error: numErr } = await supabase.rpc('get_next_proforma_number');
      if (numErr) throw numErr;
      const proformaNumber = numData as string;

      const stateName = INDIAN_STATES.find(s => s.code === stateCode)?.name || stateCode;
      const amountPaid = Number((order as any).amount_paid || 0);

      const { blob, totals } = await generateProformaPdf({
        proforma_number: proformaNumber,
        invoice_date: new Date(),
        order_number: order.order_number,
        bill_to: billTo,
        place_of_supply_code: stateCode,
        place_of_supply_name: stateName,
        treatment,
        items: lines,
        amount_paid: amountPaid,
        notes,
      });

      const saved = await uploadProformaInvoice(order.id, user.id, blob, {
        invoice_number: proformaNumber,
        subtotal: totals.subtotal,
        tax_amount: totals.tax,
        total: totals.total,
        amount_paid: totals.amount_paid,
        place_of_supply: `${stateName} (${stateCode})`,
        gst_treatment: treatment,
        tax_breakup: totals.tax_breakup,
      });

      if (!saved) throw new Error('Failed to save proforma');

      toast.success(`Proforma ${proformaNumber} generated`);
      onGenerated?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to generate proforma');
    } finally {
      setBusy(false);
    }
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Generate Proforma Invoice
          </DialogTitle>
          <DialogDescription>
            Self-generated Proforma for order <span className="font-mono">{order.order_number}</span>.
            Zoho remains the official tax invoice.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-muted-foreground"><Loader2 className="h-5 w-5 inline animate-spin mr-2" />Loading order…</div>
        ) : (
          <div className="space-y-5">
            {/* Bill To */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Customer Name</Label>
                <Input value={billTo.name} onChange={e => setBillTo(b => ({ ...b, name: e.target.value }))} />
              </div>
              <div>
                <Label>Company</Label>
                <Input value={billTo.company} onChange={e => setBillTo(b => ({ ...b, company: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <Label>Address</Label>
                <Textarea rows={2} value={billTo.address} onChange={e => setBillTo(b => ({ ...b, address: e.target.value }))} />
              </div>
              <div>
                <Label>GSTIN</Label>
                <Input value={billTo.gstin} onChange={e => setBillTo(b => ({ ...b, gstin: e.target.value }))} />
              </div>
              <div>
                <Label>Place of Supply</Label>
                <Select value={stateCode} onValueChange={setStateCode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {INDIAN_STATES.map(s => (
                      <SelectItem key={s.code} value={s.code}>{s.name} ({s.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {treatment === 'cgst_sgst' ? 'Intra-state → CGST + SGST' : 'Inter-state → IGST'}
                </p>
              </div>
            </div>

            {/* Lines */}
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
                        <td className="p-1.5"><Input value={l.product_name} onChange={e => updateLine(idx, { product_name: e.target.value })} /></td>
                        <td className="p-1.5"><Input value={l.hsn} onChange={e => updateLine(idx, { hsn: e.target.value })} /></td>
                        <td className="p-1.5"><Input type="number" min={1} value={l.quantity} onChange={e => updateLine(idx, { quantity: Number(e.target.value) || 0 })} className="text-right" /></td>
                        <td className="p-1.5"><Input type="number" step="0.01" value={l.gst_rate} onChange={e => updateLine(idx, { gst_rate: Number(e.target.value) || 0 })} className="text-right" /></td>
                        <td className="p-1.5"><Input type="number" step="0.01" value={l.gross_total} onChange={e => updateLine(idx, { gross_total: Number(e.target.value) || 0 })} className="text-right" /></td>
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

            {/* Totals preview */}
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
              <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleGenerate} disabled={busy || loading}>
            {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating…</> : <><FileText className="h-4 w-4 mr-2" />Generate Proforma</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}