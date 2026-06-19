import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, FileText, Trash2, Plus, RotateCcw, Wand2, AlertTriangle, CheckCircle2, FileDown, FileSpreadsheet, ChevronDown, ChevronUp, Info, ShieldCheck, FlaskConical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Order } from '@/hooks/useOrders';
import { useOrderItems, OrderItem } from '@/hooks/useOrderItems';
import {
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
  explainGstRate,
  PROFORMA_RULES_VERSION,
} from '@/lib/proformaRules';
import { computeProformaTotals, generateProformaPdf, ProformaLineInput } from '@/lib/invoicePdfGenerator';
import { uploadProformaInvoice, OrderInvoice } from '@/hooks/useOrderInvoices';
import type { WooCommerceOrder } from '@/hooks/useWooCommerceOrders';
import { InvoiceEmailControl, defaultEmailState, validateEmailState, InvoiceEmailState } from '@/components/orders/InvoiceEmailControl';
import { sendInvoiceEmail } from '@/lib/invoiceEmail';
import { exportReconciliationCsv, exportReconciliationPdf, exportReconciliationAuditCsv } from '@/lib/proformaReconciliationExport';

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
  const canRegenerate = role === 'admin' || role === 'supply_chain' || role === 'finance';

  const isRegenerate = !!existingProforma;
  const isWoo = !!wooOrder;

  const [billTo, setBillTo] = useState({
    name: '', company: '', address: '', gstin: '', email: '', phone: '',
  });
  const [stateCode, setStateCode] = useState<string>('29');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [emailState, setEmailState] = useState<InvoiceEmailState>(defaultEmailState(''));
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideBusy, setOverrideBusy] = useState(false);
  const [dryRun, setDryRun] = useState<null | {
    delta: number;
    proformaTotal: number;
    expectedTotal: number;
    changedLines: Array<{ index: number; product_name: string; field: string; before: any; after: any }>;
  }>(null);

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
            // Trust the SAC/HSN rule engine as the single source of truth for
            // the GST rate — `sales_gst_percent` in DB is frequently wrong
            // (e.g. drone combos saved at 18% when they should be 5%) and the
            // proforma must match what Zoho billed.  The stored `unit_price`
            // is treated as the GST-INCLUSIVE amount the customer was billed
            // (order_items totals roll up to orders.total_sales_amount, which
            // is the inclusive total).  gross_total therefore stays equal to
            // unit × qty — only the taxable/GST split changes.
            const rate = inferGstRate(it.product_name, DEFAULT_HSN);
            const gross = Math.round(unit * qty * 100) / 100;
            const unitExcl = unit / (1 + rate / 100);
            return {
              product_name: it.product_name,
              hsn: DEFAULT_HSN,
              quantity: qty,
              gross_total: gross,
              gst_rate: rate,
              unit_price_excl: Math.round(unitExcl * 10000) / 10000,
              rate_includes_gst: true,
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
      const inclusiveToggled = 'rate_includes_gst' in patch;
      const includes = next.rate_includes_gst !== false;
      const qty = Number(next.quantity) || 0;
      const rate = Number(next.gst_rate) || 0;
      if (grossEdited) {
        // User typed a new total — back-derive per-unit ex-GST price.
        next.unit_price_excl = qty > 0
          ? Math.round((next.gross_total / qty) / (includes ? 1 + rate / 100 : 1) * 10000) / 10000
          : 0;
      } else if (qtyOrRateChanged || inclusiveToggled) {
        // Recompute total from the locked-in per-unit ex-GST price.
        next.gross_total = Math.round(next.unit_price_excl * qty * (1 + rate / 100) * 100) / 100;
      }
      return next;
    }));
  };
  const addLine = () => setLines((prev) => [...prev, {
    product_name: '', hsn: DEFAULT_HSN, quantity: 1, gross_total: 0, gst_rate: 18, unit_price_excl: 0, rate_includes_gst: true,
  }]);
  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));

  /** Re-apply GST inference per line (does not touch unit_price_excl). */
  const autoFixRates = () => {
    if (!canRegenerate) {
      toast.error('Only Supply Chain, Finance, or Admin can apply auto-fix');
      return;
    }
    const before = lines.map((l) => ({ ...l }));
    const changes: Array<{ index: number; field: string; before: any; after: any; product_name: string }> = [];
    const next = lines.map((l, idx) => {
      const newRate = inferGstRate(l.product_name, l.hsn);
      if (newRate === l.gst_rate) return l;
      changes.push({ index: idx, field: 'gst_rate', before: l.gst_rate, after: newRate, product_name: l.product_name });
      const qty = Number(l.quantity) || 0;
      return {
        ...l,
        gst_rate: newRate,
        gross_total: Math.round(l.unit_price_excl * qty * (1 + newRate / 100) * 100) / 100,
      };
    });
    setLines(next);
    if (changes.length === 0) {
      toast.info('All lines already match SAC/HSN rules');
      return;
    }
    toast.success(`Re-applied GST rules to ${changes.length} line(s)`);
    // Fire-and-forget audit entry.
    if (user && subject) {
      (supabase.from('proforma_rule_audit') as any).insert({
        order_number: subject.order_number,
        order_id: order?.id || null,
        woocommerce_order_id: wooOrder?.id || null,
        action: 'AUTO_FIX_GST',
        triggered_by: user.id,
        triggered_by_name: (profile as any)?.full_name || user.email || null,
        line_changes: changes,
        before_snapshot: { lines: before },
        after_snapshot: { lines: next },
      }).then(({ error }: any) => { if (error) console.error('Audit log failed', error); });
    }
  };

  const duplicateFlags = useMemo(() => detectBundleDuplicates(lines), [lines]);

  /** Recalculate proformas using current rules WITHOUT saving. */
  const runDryRun = () => {
    if (!subject) return;
    const changedLines: Array<{ index: number; product_name: string; field: string; before: any; after: any }> = [];
    let dryProformaTotal = 0;
    lines.forEach((l, idx) => {
      const inferred = inferGstRate(l.product_name, l.hsn);
      const qty = Number(l.quantity) || 0;
      const correctedGross = Math.round(l.unit_price_excl * qty * (1 + inferred / 100) * 100) / 100;
      dryProformaTotal += correctedGross;
      if (inferred !== Number(l.gst_rate)) {
        changedLines.push({ index: idx, product_name: l.product_name, field: 'gst_rate', before: l.gst_rate, after: inferred });
      }
      if (Math.abs(correctedGross - Number(l.gross_total)) > 0.01) {
        changedLines.push({ index: idx, product_name: l.product_name, field: 'gross_total', before: l.gross_total, after: correctedGross });
      }
    });
    const expected = Number(subject.total) || 0;
    setDryRun({
      delta: Math.round((dryProformaTotal - expected) * 100) / 100,
      proformaTotal: Math.round(dryProformaTotal * 100) / 100,
      expectedTotal: expected,
      changedLines,
    });
    toast.success(`Dry-run complete — ${changedLines.length} field change(s) would be applied`);
  };

  /** Manual override: approve current proforma as-is even though it's flagged stale. */
  const handleManualOverride = async () => {
    if (!existingProforma || !user) return;
    if (!canRegenerate) { toast.error('Only Supply Chain, Finance, or Admin can override'); return; }
    if (!overrideReason.trim() || overrideReason.trim().length < 8) {
      toast.error('Please provide a clear reason (min 8 chars) for the override');
      return;
    }
    setOverrideBusy(true);
    try {
      const actorName = (profile as any)?.full_name || user.email || null;
      const { error } = await (supabase.from('order_invoices') as any)
        .update({
          needs_regenerate: false,
          regenerate_reason: null,
          regenerate_flagged_at: null,
          override_reason: overrideReason.trim(),
          override_by: user.id,
          override_by_name: actorName,
          override_at: new Date().toISOString(),
        })
        .eq('id', (existingProforma as any).id);
      if (error) throw error;
      await (supabase.from('proforma_rule_audit') as any).insert({
        order_number: subject?.order_number,
        order_id: order?.id || null,
        woocommerce_order_id: wooOrder?.id || null,
        action: 'MANUAL_OVERRIDE',
        triggered_by: user.id,
        triggered_by_name: actorName,
        line_changes: { rules_version: PROFORMA_RULES_VERSION, role, reason: overrideReason.trim() },
        before_snapshot: { needs_regenerate: true },
        after_snapshot: { needs_regenerate: false, override_reason: overrideReason.trim() },
      });
      toast.success('Proforma re-approved with override');
      setOverrideReason('');
      onGenerated?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Override failed');
    } finally {
      setOverrideBusy(false);
    }
  };

  const [rulesExpanded, setRulesExpanded] = useState(false);
  const lineRuleBreakdown = useMemo(
    () => lines.map((l) => ({ line: l, explain: explainGstRate(l.product_name, l.hsn) })),
    [lines],
  );

  const removeDuplicate = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
    toast.success('Removed duplicate bundled line');
  };

  const reconciliation = useMemo(() => {
    if (!subject || !previewTotals) return null;
    // Use the order's recorded total (from Zoho/order header) as the expected.
    const expected = Number(subject.total) || 0;
    if (expected <= 0) return null;
    return reconcileProforma({
      lines: lines.map((l) => ({
        product_name: l.product_name, hsn: l.hsn, quantity: l.quantity,
        gross_total: l.gross_total, gst_rate: l.gst_rate,
      })),
      proformaTotal: previewTotals.total,
      expectedTotal: expected,
    });
  }, [subject, previewTotals, lines]);

  const handleGenerate = async () => {
    if (!subject || !user) return;
    if (!canRegenerate) { toast.error('Only Supply Chain, Finance, or Admin can generate proformas'); return; }
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
            rules_version: PROFORMA_RULES_VERSION,
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

      // Clear the auto-flagged stale marker on the new proforma row.
      try {
        await (supabase.from('order_invoices') as any)
          .update({
            needs_regenerate: false,
            regenerate_reason: null,
            regenerate_flagged_at: null,
            override_reason: null,
            override_by: null,
            override_by_name: null,
            override_at: null,
          })
          .eq('id', (saved as any).id);
      } catch { /* non-fatal */ }

      // Audit log entry for every (re)generation — captures rules_version,
      // changed line items vs prior snapshot, and the initiating user/role.
      try {
        const beforeLines = ((existingProforma as any)?.audit_snapshot?.lines) || [];
        const afterLines = lines.map((l) => ({
          product_name: l.product_name, hsn: l.hsn, quantity: l.quantity,
          gst_rate: l.gst_rate, gross_total: l.gross_total,
        }));
        const changes: any[] = [];
        afterLines.forEach((a, i) => {
          const b = beforeLines[i];
          if (!b) { changes.push({ index: i, field: '__added__', before: null, after: a, product_name: a.product_name }); return; }
          ['gst_rate', 'gross_total', 'quantity', 'product_name', 'hsn'].forEach((f) => {
            if (String(b[f] ?? '') !== String((a as any)[f] ?? '')) {
              changes.push({ index: i, field: f, before: b[f], after: (a as any)[f], product_name: a.product_name });
            }
          });
        });
        beforeLines.slice(afterLines.length).forEach((b: any, j: number) => {
          changes.push({ index: afterLines.length + j, field: '__removed__', before: b, after: null, product_name: b.product_name });
        });
        await (supabase.from('proforma_rule_audit') as any).insert({
          order_number: subject.order_number,
          order_id: order?.id || null,
          woocommerce_order_id: wooOrder?.id || null,
          action: isRegenerate ? 'REGENERATE' : 'GENERATE',
          triggered_by: user.id,
          triggered_by_name: generatedByName,
          line_changes: { rules_version: PROFORMA_RULES_VERSION, role, changes },
          before_snapshot: { lines: beforeLines, rules_version: (existingProforma as any)?.audit_snapshot?.rules_version || null },
          after_snapshot: { lines: afterLines, rules_version: PROFORMA_RULES_VERSION },
        });
      } catch (e) { console.warn('audit log write failed', e); }

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
              </div>
              {((existingProforma as any)?.needs_regenerate ||
                ((existingProforma as any)?.audit_snapshot?.rules_version &&
                 (existingProforma as any).audit_snapshot.rules_version !== PROFORMA_RULES_VERSION)) && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2 text-xs space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-medium">This proforma is out of date.</div>
                      <div className="text-muted-foreground">
                        {(existingProforma as any)?.regenerate_reason && <>Reason: {(existingProforma as any).regenerate_reason}. </>}
                        Saved with rules v{(existingProforma as any)?.audit_snapshot?.rules_version || '—'}, current is v{PROFORMA_RULES_VERSION}.
                        Click <em>Regenerate Proforma</em> to refresh, or override below with a reason.
                      </div>
                    </div>
                  </div>
                  {canRegenerate && (
                    <div className="rounded border border-amber-200 bg-white/60 dark:bg-black/20 p-2 space-y-1.5">
                      <Label className="text-[11px] flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3" /> Manual override — approve as-is
                      </Label>
                      <Textarea rows={2} placeholder="Why is regeneration unnecessary? (min 8 chars — kept in audit log)"
                        value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} className="text-xs" />
                      <div className="flex justify-end">
                        <Button type="button" size="sm" variant="outline" className="h-7"
                          disabled={overrideBusy || overrideReason.trim().length < 8}
                          onClick={handleManualOverride}>
                          {overrideBusy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5 mr-1" />}
                          Confirm override
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center justify-end">
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={runDryRun}
                    title="Recalculate using current rules without saving">
                    <FlaskConical className="h-4 w-4 mr-1" /> Dry-run
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={autoFixRates}
                    disabled={!canRegenerate}
                    title={canRegenerate ? 'Re-apply SAC/HSN GST rules to all lines' : 'Requires Supply Chain / Finance / Admin role'}>
                    <Wand2 className="h-4 w-4 mr-1" /> Auto-fix GST
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={addLine} disabled={!canRegenerate}>
                    <Plus className="h-4 w-4 mr-1" /> Add line
                  </Button>
                </div>
              </div>
              {duplicateFlags.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2 text-xs space-y-1">
                  {duplicateFlags.map((f, i) => (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        Line {f.duplicateIndex + 1}: {f.message}.
                      </span>
                      <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-amber-700 hover:text-amber-900"
                        onClick={() => removeDuplicate(f.duplicateIndex)}>
                        Remove duplicate
                      </Button>
                    </div>
                  ))}
                </div>
              )}
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
              {lines.length > 0 && (
                <div className="border rounded-lg">
                  <button type="button" onClick={() => setRulesExpanded((v) => !v)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/50">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Info className="h-3.5 w-3.5" />
                      Per-line GST rule breakdown ({lines.length}) — rules v{PROFORMA_RULES_VERSION}
                    </span>
                    {rulesExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                  {rulesExpanded && (
                    <div className="px-3 pb-3 space-y-1.5 text-[11px]">
                      {lineRuleBreakdown.map(({ line, explain }, idx) => {
                        const mismatch = explain.rate !== Number(line.gst_rate);
                        return (
                          <div key={idx} className={`grid grid-cols-[1fr_auto] gap-2 rounded border p-2 ${mismatch ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30' : 'border-border'}`}>
                            <div>
                              <div className="font-medium">Line {idx + 1}: {line.product_name || '—'}</div>
                              <div className="text-muted-foreground">{explain.detail}</div>
                              <div className="text-muted-foreground">
                                Source: <span className="font-mono">{explain.source}</span> ·
                                Inferred: <span className="font-medium">{explain.rate}%</span> ·
                                Applied: <span className={`font-medium ${mismatch ? 'text-amber-700' : ''}`}>{line.gst_rate}%</span> ·
                                Total is GST-{line.rate_includes_gst !== false ? 'inclusive' : 'exclusive'}
                              </div>
                            </div>
                            {mismatch && (
                              <Badge variant="outline" className="self-start text-[10px]">Override active</Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
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

            {reconciliation && (
              <div className={`border rounded-lg p-3 text-xs space-y-2 ${
                Math.abs(reconciliation.delta) <= 1
                  ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30'
                  : 'border-rose-300 bg-rose-50 dark:bg-rose-950/30'
              }`}>
                <div className="flex items-center justify-between font-semibold">
                  <span className="flex items-center gap-1.5">
                    {Math.abs(reconciliation.delta) <= 1 ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-rose-600" />
                    )}
                    Reconciliation vs order total
                  </span>
                  <div className="flex items-center gap-2">
                    <span>
                      Δ {reconciliation.delta > 0 ? '+' : ''}₹{reconciliation.delta.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                    <Button type="button" variant="ghost" size="sm" className="h-6 px-2"
                      onClick={() => exportReconciliationCsv({
                        orderNumber: subject.order_number,
                        proformaTotal: reconciliation.proformaTotal,
                        expectedTotal: reconciliation.expectedTotal,
                        delta: reconciliation.delta,
                        amountPaid: subject.amount_paid,
                        rules: reconciliation.rules,
                        lines: lines.map((l) => ({ product_name: l.product_name, hsn: l.hsn, quantity: l.quantity, gst_rate: l.gst_rate, gross_total: l.gross_total })),
                      })}>
                      <FileSpreadsheet className="h-3 w-3 mr-1" />CSV
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-6 px-2"
                      onClick={() => exportReconciliationPdf({
                        orderNumber: subject.order_number,
                        proformaTotal: reconciliation.proformaTotal,
                        expectedTotal: reconciliation.expectedTotal,
                        delta: reconciliation.delta,
                        amountPaid: subject.amount_paid,
                        rules: reconciliation.rules,
                        lines: lines.map((l) => ({ product_name: l.product_name, hsn: l.hsn, quantity: l.quantity, gst_rate: l.gst_rate, gross_total: l.gross_total })),
                      })}>
                      <FileDown className="h-3 w-3 mr-1" />PDF
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-6 px-2"
                      onClick={async () => {
                        const { data } = await (supabase
                          .from('proforma_rule_audit') as any)
                          .select('*')
                          .eq('order_number', subject.order_number)
                          .order('created_at', { ascending: false });
                        exportReconciliationAuditCsv({
                          orderNumber: subject.order_number,
                          audit: (data || []) as any[],
                          currentLines: lines.map((l) => ({
                            product_name: l.product_name, hsn: l.hsn,
                            quantity: l.quantity, gst_rate: l.gst_rate, gross_total: l.gross_total,
                          })),
                        });
                      }}
                      title="Export full rule-audit history (CSV)">
                      <FileSpreadsheet className="h-3 w-3 mr-1" />Audit
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-muted-foreground">
                  <div>Proforma: <span className="text-foreground font-medium">₹{reconciliation.proformaTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                  <div>Expected: <span className="text-foreground font-medium">₹{reconciliation.expectedTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                  <div>Paid: <span className="text-foreground font-medium">₹{(subject?.amount_paid || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                </div>
                <ul className="space-y-1">
                  {reconciliation.rules.map((r, i) => (
                    <li key={i} className="flex gap-1.5">
                      <Badge variant={r.rule === 'OK' ? 'default' : 'destructive'} className="h-4 px-1.5 text-[10px] shrink-0">
                        {r.rule}
                      </Badge>
                      <span>{r.detail}</span>
                    </li>
                  ))}
                </ul>
                {Math.abs(reconciliation.delta) > 1 && (
                  <div className="mt-2 border-t border-rose-200 dark:border-rose-900 pt-2 space-y-1">
                    <div className="font-semibold text-rose-700 dark:text-rose-300">Root cause — fields driving the delta</div>
                    {lineRuleBreakdown.map(({ line, explain }, idx) => {
                      const overridden = explain.rate !== Number(line.gst_rate);
                      if (!overridden) return null;
                      const correctedGross = line.unit_price_excl * Number(line.quantity) * (1 + explain.rate / 100);
                      const driftPerLine = Math.round((line.gross_total - correctedGross) * 100) / 100;
                      return (
                        <div key={idx} className="text-[11px] font-mono bg-white/40 dark:bg-black/20 rounded px-2 py-1">
                          L{idx + 1}: applied={line.gst_rate}% vs inferred={explain.rate}% ({explain.source}),
                          incl_flag={String(line.rate_includes_gst !== false)},
                          gross=₹{line.gross_total.toLocaleString('en-IN')},
                          drift={driftPerLine >= 0 ? '+' : ''}₹{driftPerLine.toLocaleString('en-IN')}
                        </div>
                      );
                    })}
                    <Button type="button" size="sm" variant="outline" className="h-7 mt-1" onClick={autoFixRates}>
                      <Wand2 className="h-3.5 w-3.5 mr-1" />Auto-fix to match Zoho
                    </Button>
                  </div>
                )}
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
          <Button onClick={handleGenerate} disabled={busy || loading || !canRegenerate}
            title={!canRegenerate ? 'Only Supply Chain, Finance, or Admin can generate proformas' : undefined}>
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