import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Loader2, FileDown, FileSpreadsheet, AlertTriangle, CheckCircle2, RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { inferGstRate, reconcileProforma } from '@/lib/proformaRules';
import { exportReconciliationCsv, exportReconciliationPdf } from '@/lib/proformaReconciliationExport';
import { format } from 'date-fns';

interface ProformaLine {
  product_name: string;
  hsn: string;
  quantity: number;
  gst_rate: number;
  gross_total: number;
}

interface AuditEntry {
  id: string;
  action: string;
  triggered_by_name: string | null;
  line_changes: Array<{ index: number; field: string; before: any; after: any; product_name?: string }>;
  before_snapshot: any;
  after_snapshot: any;
  rolled_back_at: string | null;
  created_at: string;
}

/**
 * Stand-alone view: compare the latest XBoom proforma for an order against the
 * official Zoho invoice total (entered manually) and explain every delta by rule.
 */
export default function ProformaReconciliation() {
  const [params, setParams] = useSearchParams();
  const { user, role } = useAuth();
  const isPriv = role === 'admin' || role === 'finance';

  const initialOrder = params.get('order') || '';
  const initialOrderId = params.get('order_id') || '';
  const [orderNumber, setOrderNumber] = useState(initialOrder || 'ORD2600320');
  const [search, setSearch] = useState(initialOrder);
  const [resolvingId, setResolvingId] = useState(!!initialOrderId);
  const [loading, setLoading] = useState(false);
  const [lines, setLines] = useState<ProformaLine[]>([]);
  const [proformaTotal, setProformaTotal] = useState(0);
  const [amountPaid, setAmountPaid] = useState(0);
  const [orderTotal, setOrderTotal] = useState(0);
  const [expectedTotal, setExpectedTotal] = useState<number>(0);
  const [auditTrail, setAuditTrail] = useState<AuditEntry[]>([]);
  const [proformaId, setProformaId] = useState<string | null>(null);

  // Resolve `?order_id=<uuid>` deep-link → order_number, then drive normal flow.
  useEffect(() => {
    if (!initialOrderId) return;
    (async () => {
      try {
        const { data: ord } = await (supabase.from('orders') as any)
          .select('order_number').eq('id', initialOrderId).maybeSingle();
        let orderNo = ord?.order_number as string | undefined;
        if (!orderNo) {
          const { data: woo } = await (supabase.from('woocommerce_orders') as any)
            .select('order_number').eq('id', initialOrderId).maybeSingle();
          orderNo = woo?.order_number;
        }
        if (orderNo) {
          setSearch(orderNo);
          setOrderNumber(orderNo);
        } else {
          toast.error('Could not find order for this notification');
        }
      } catch (e: any) {
        toast.error(e.message || 'Failed to resolve order id');
      } finally {
        setResolvingId(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOrderId]);

  useEffect(() => {
    if (!search) return;
    setParams({ order: search }, { replace: true });
  }, [search, setParams]);

  useEffect(() => {
    if (!search) return;
    (async () => {
      setLoading(true);
      try {
        // 1. Find the order (internal first, fallback to woo)
        const { data: ord } = await (supabase.from('orders') as any)
          .select('id, order_number, total_sales_amount, amount_paid')
          .eq('order_number', search).maybeSingle();
        let orderTotalLocal = 0; let amountPaidLocal = 0;
        if (ord) {
          orderTotalLocal = Number(ord.total_sales_amount || 0);
          amountPaidLocal = Number(ord.amount_paid || 0);
        } else {
          const { data: woo } = await (supabase.from('woocommerce_orders') as any)
            .select('id, order_number, total_sales_amount, amount_paid')
            .eq('order_number', search).maybeSingle();
          if (woo) {
            orderTotalLocal = Number(woo.total_sales_amount || 0);
            amountPaidLocal = Number(woo.amount_paid || 0);
          }
        }
        setOrderTotal(orderTotalLocal);
        setAmountPaid(amountPaidLocal);
        if (expectedTotal === 0) setExpectedTotal(orderTotalLocal);

        // 2. Latest proforma snapshot from audit log
        const { data: logs } = await (supabase.from('proforma_audit_log') as any)
          .select('id, invoice_id, snapshot, created_at')
          .filter('snapshot->>order_number', 'eq', search)
          .order('created_at', { ascending: false }).limit(1);
        const log = logs?.[0];
        if (log) {
          setProformaId(log.invoice_id);
          const snap = log.snapshot || {};
          setProformaTotal(Number(snap.total) || 0);
          const snapLines = (snap.lines || []) as ProformaLine[];
          setLines(snapLines.map((l) => ({
            product_name: l.product_name, hsn: l.hsn || '',
            quantity: Number(l.quantity) || 0,
            gst_rate: Number(l.gst_rate) || 0,
            gross_total: Number(l.gross_total) || 0,
          })));
        } else {
          setProformaId(null);
          setProformaTotal(0); setLines([]);
        }

        // 3. Rule-change audit trail
        const { data: trail } = await (supabase.from('proforma_rule_audit') as any)
          .select('id, action, triggered_by_name, line_changes, before_snapshot, after_snapshot, rolled_back_at, created_at')
          .eq('order_number', search)
          .order('created_at', { ascending: false }).limit(20);
        setAuditTrail((trail || []) as AuditEntry[]);
        setOrderNumber(search);
      } catch (e: any) {
        toast.error(e.message || 'Failed to load reconciliation data');
      } finally { setLoading(false); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const reconciliation = useMemo(() => reconcileProforma({
    lines, proformaTotal, expectedTotal,
  }), [lines, proformaTotal, expectedTotal]);

  const lineRows = useMemo(() => {
    const totalProforma = lines.reduce((s, l) => s + l.gross_total, 0) || 1;
    return lines.map((l) => {
      const expected = expectedTotal > 0
        ? Math.round((l.gross_total / totalProforma) * expectedTotal * 100) / 100
        : null;
      return {
        product_name: l.product_name, hsn: l.hsn,
        quantity: l.quantity, gst_rate: l.gst_rate,
        gross_total: l.gross_total,
        expected_gross: expected,
        delta: expected != null ? Math.round((l.gross_total - expected) * 100) / 100 : null,
        inferred_rate: inferGstRate(l.product_name, l.hsn),
      };
    });
  }, [lines, expectedTotal]);

  const rollback = async (entry: AuditEntry) => {
    if (!isPriv) { toast.error('Only Admin/Finance can roll back rule changes'); return; }
    if (!entry.before_snapshot) { toast.error('No snapshot to roll back to'); return; }
    if (!confirm('Roll back this Auto-fix? Lines will be restored to the previous state. You still need to Regenerate the proforma to persist the change.')) return;
    try {
      const { error } = await (supabase.from('proforma_rule_audit') as any)
        .update({ rolled_back_at: new Date().toISOString(), rolled_back_by: user?.id })
        .eq('id', entry.id);
      if (error) throw error;
      setLines((entry.before_snapshot.lines || []) as ProformaLine[]);
      toast.success('Restored previous line state. Regenerate the proforma to save it.');
      setSearch(search); // refresh trail
    } catch (e: any) { toast.error(e.message || 'Rollback failed'); }
  };

  const exportPayload = () => ({
    orderNumber,
    proformaTotal,
    expectedTotal,
    delta: reconciliation.delta,
    amountPaid,
    rules: reconciliation.rules,
    lines: lineRows,
    generatedAt: new Date(),
  });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Proforma Reconciliation</h1>
          <p className="text-sm text-muted-foreground">Compare XBoom proforma totals against Zoho invoice totals and inspect every delta by rule.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => exportReconciliationCsv(exportPayload())}>
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Export CSV
          </Button>
          <Button onClick={() => exportReconciliationPdf(exportPayload())}>
            <FileDown className="h-4 w-4 mr-1" /> Export PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Order number</Label>
            <div className="flex gap-2">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. ORD2600320" />
            </div>
          </div>
          <div>
            <Label>Expected (Zoho) invoice total ₹</Label>
            <Input type="number" step="0.01" value={expectedTotal}
              onChange={(e) => setExpectedTotal(Number(e.target.value) || 0)} />
            <p className="text-[11px] text-muted-foreground mt-1">Paste from the Zoho tax invoice. Defaults to the order header total.</p>
          </div>
          <div>
            <Label>Payment received ₹</Label>
            <Input type="number" step="0.01" value={amountPaid} readOnly />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="py-10 text-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading…
        </div>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                <span>Summary</span>
                <span className="flex items-center gap-2 text-sm">
                  {Math.abs(reconciliation.delta) <= 1 ? (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300"><CheckCircle2 className="h-3 w-3 mr-1" />Matches</Badge>
                  ) : (
                    <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Δ ₹{reconciliation.delta.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Badge>
                  )}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><div className="text-muted-foreground">Proforma total</div><div className="text-lg font-semibold">₹{proformaTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div></div>
              <div><div className="text-muted-foreground">Expected (Zoho)</div><div className="text-lg font-semibold">₹{expectedTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div></div>
              <div><div className="text-muted-foreground">Delta</div><div className={`text-lg font-semibold ${Math.abs(reconciliation.delta) > 1 ? 'text-rose-600' : 'text-emerald-600'}`}>₹{reconciliation.delta.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div></div>
              <div><div className="text-muted-foreground">Paid</div><div className="text-lg font-semibold">₹{amountPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Line items</CardTitle></CardHeader>
            <CardContent>
              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No proforma found for {orderNumber}.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>HSN/SAC</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">GST %</TableHead>
                      <TableHead className="text-right">Inferred %</TableHead>
                      <TableHead className="text-right">Proforma ₹</TableHead>
                      <TableHead className="text-right">Expected ₹</TableHead>
                      <TableHead className="text-right">Δ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineRows.map((l, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{l.product_name}</TableCell>
                        <TableCell>{l.hsn}</TableCell>
                        <TableCell className="text-right">{l.quantity}</TableCell>
                        <TableCell className="text-right">{l.gst_rate}%</TableCell>
                        <TableCell className={`text-right ${l.inferred_rate !== l.gst_rate ? 'text-rose-600 font-semibold' : ''}`}>{l.inferred_rate}%</TableCell>
                        <TableCell className="text-right">₹{l.gross_total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-right">{l.expected_gross != null ? `₹${l.expected_gross.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}</TableCell>
                        <TableCell className={`text-right ${l.delta && Math.abs(l.delta) > 1 ? 'text-rose-600' : ''}`}>{l.delta != null ? `₹${l.delta.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Rule attribution</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {reconciliation.rules.map((r, i) => (
                <div key={i} className="flex gap-2 items-start text-sm">
                  <Badge variant={r.rule === 'OK' ? 'default' : 'destructive'} className="shrink-0">{r.rule}</Badge>
                  <span>{r.detail}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Auto-fix audit trail</CardTitle></CardHeader>
            <CardContent>
              {auditTrail.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No rule changes recorded for this order yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>By</TableHead>
                      <TableHead>Changes</TableHead>
                      <TableHead className="text-right">Rollback</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditTrail.map((a) => (
                      <TableRow key={a.id} className={a.rolled_back_at ? 'opacity-60' : ''}>
                        <TableCell className="text-xs">{format(new Date(a.created_at), 'dd MMM HH:mm')}</TableCell>
                        <TableCell><Badge variant="outline">{a.action}</Badge></TableCell>
                        <TableCell className="text-xs">{a.triggered_by_name || '—'}</TableCell>
                        <TableCell className="text-xs">
                          {(a.line_changes || []).slice(0, 4).map((c, i) => (
                            <div key={i}>L{c.index + 1} {c.field}: {String(c.before)} → <span className="font-semibold">{String(c.after)}</span></div>
                          ))}
                          {(a.line_changes || []).length > 4 && <div className="text-muted-foreground">+{a.line_changes.length - 4} more</div>}
                        </TableCell>
                        <TableCell className="text-right">
                          {a.rolled_back_at ? (
                            <Badge variant="secondary">Rolled back</Badge>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => rollback(a)} disabled={!isPriv}>
                              <RotateCcw className="h-3 w-3 mr-1" />Rollback
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {!isPriv && (
                <p className="text-[11px] text-muted-foreground mt-2">Rollback is restricted to Admin/Finance roles.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}