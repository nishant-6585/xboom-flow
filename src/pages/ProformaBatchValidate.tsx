import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ShieldCheck, AlertTriangle, CheckCircle2, ExternalLink, FileSpreadsheet, FileDown } from 'lucide-react';
import jsPDF from 'jspdf';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { inferGstRate, reconcileProforma, PROFORMA_RULES_VERSION } from '@/lib/proformaRules';

interface Row {
  order_number: string;
  order_id?: string | null;
  expected_total: number;
  computed_total: number;
  delta: number;
  rules_version_stored?: string | null;
  stale: boolean;
  rule_hits: string[];
  status: 'OK' | 'MISMATCH' | 'STALE_RULES' | 'MISSING';
}

function inr(n: number) { return `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`; }

export default function ProformaBatchValidate() {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const run = async () => {
    const numbers = input.split(/[\s,;\n]+/).map((s) => s.trim()).filter(Boolean);
    if (numbers.length === 0) { toast.error('Paste at least one order number'); return; }
    setBusy(true); setRows([]); setSelected(new Set());
    try {
      const { data: orders } = await (supabase
        .from('orders') as any)
        .select('id, order_number, total_sales_amount, amount_paid')
        .in('order_number', numbers);
      const map = new Map<string, any>((orders || []).map((o: any) => [o.order_number, o]));

      const results: Row[] = [];
      for (const num of numbers) {
        const order = map.get(num);
        if (!order) {
          results.push({ order_number: num, expected_total: 0, computed_total: 0, delta: 0,
            stale: false, rule_hits: ['Order not found'], status: 'MISSING' });
          continue;
        }
        const [{ data: items }, { data: invoices }] = await Promise.all([
          (supabase.from('order_items') as any).select('product_name, quantity, unit_price').eq('order_id', order.id),
          (supabase.from('order_invoices') as any).select('audit_snapshot').eq('order_id', order.id).eq('invoice_type', 'proforma').order('created_at', { ascending: false }).limit(1),
        ]);
        const lines = (items || []).map((it: any) => {
          const qty = Number(it.quantity) || 1;
          const unit = Number(it.unit_price) || 0;
          const rate = inferGstRate(it.product_name, '88062200');
          const gross = Math.round(unit * qty * 100) / 100;
          return { product_name: it.product_name, hsn: '88062200', quantity: qty, gst_rate: rate, gross_total: gross };
        });
        const computed = lines.reduce((s: number, l: any) => s + l.gross_total, 0);
        const expected = Number(order.total_sales_amount) || 0;
        const recon = reconcileProforma({ lines, proformaTotal: computed, expectedTotal: expected });
        const storedVersion = invoices?.[0]?.audit_snapshot?.rules_version || null;
        const stale = storedVersion !== PROFORMA_RULES_VERSION;
        const status: Row['status'] = Math.abs(recon.delta) > 1 ? 'MISMATCH' : (stale ? 'STALE_RULES' : 'OK');
        results.push({
          order_number: num, order_id: order.id,
          expected_total: expected, computed_total: computed, delta: recon.delta,
          rules_version_stored: storedVersion, stale,
          rule_hits: recon.rules.map((r) => `${r.rule}: ${r.detail}`),
          status,
        });
      }
      setRows(results);
      const flagged = results.filter((r) => r.status !== 'OK').length;
      toast.success(`Validated ${results.length} orders — ${flagged} need attention`);
    } finally { setBusy(false); }
  };

  const toggle = (n: string) => {
    setSelected((prev) => { const next = new Set(prev); next.has(n) ? next.delete(n) : next.add(n); return next; });
  };

  const exportCsv = () => {
    const out: string[] = [['Order', 'Status', 'Expected', 'Computed', 'Delta', 'Stored rules version', 'Rules hit'].join(',')];
    for (const r of rows) {
      out.push([
        r.order_number, r.status, r.expected_total, r.computed_total, r.delta,
        r.rules_version_stored || '', `"${r.rule_hits.join(' | ').replace(/"/g, "'")}"`,
      ].join(','));
    }
    const blob = new Blob([out.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `proforma-batch-validate-${Date.now()}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    let y = 40;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text('Proforma Batch Validation Report', 40, y); y += 22;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 40, y);
    doc.text(`Rules version: ${PROFORMA_RULES_VERSION}`, W - 200, y); y += 18;
    doc.setDrawColor(220); doc.line(40, y, W - 40, y); y += 16;

    doc.setFont('helvetica', 'bold'); doc.text('Summary', 40, y); y += 14;
    doc.setFont('helvetica', 'normal');
    const totalDrift = rows.reduce((s, r) => s + Math.abs(r.delta), 0);
    const sums: Array<[string, string]> = [
      ['Total orders', String(rows.length)],
      ['OK', String(counts.OK || 0)],
      ['Mismatch', String(counts.MISMATCH || 0)],
      ['Stale rules', String(counts.STALE_RULES || 0)],
      ['Missing', String(counts.MISSING || 0)],
      ['Aggregate |Δ|', inr(totalDrift)],
    ];
    for (const [k, v] of sums) { doc.text(k, 50, y); doc.text(v, W - 50, y, { align: 'right' }); y += 14; }
    y += 8;

    doc.setFont('helvetica', 'bold'); doc.text('Per-order detail', 40, y); y += 14;
    doc.setFontSize(9);
    const headers = ['Order', 'Status', 'Expected', 'Computed', 'Δ', 'Rules v'];
    const colX = [40, 150, 230, 310, 390, 460];
    headers.forEach((h, i) => doc.text(h, colX[i], y)); y += 12;
    doc.setFont('helvetica', 'normal');
    for (const r of rows) {
      if (y > 780) { doc.addPage(); y = 40; }
      doc.text(r.order_number, colX[0], y);
      doc.text(r.status, colX[1], y);
      doc.text(inr(r.expected_total), colX[2], y);
      doc.text(inr(r.computed_total), colX[3], y);
      doc.text(r.delta === 0 ? '—' : inr(r.delta), colX[4], y);
      doc.text(r.rules_version_stored || '—', colX[5], y);
      y += 11;
    }
    doc.save(`proforma-batch-validate-${Date.now()}.pdf`);
  };

  const counts = rows.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="container mx-auto p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6" /> Batch validate GST &amp; totals
        </h1>
        <p className="text-sm text-muted-foreground">
          Recomputes each proforma against the current rule engine (v{PROFORMA_RULES_VERSION}) and flags mismatches.
          Nothing is regenerated until you tick rows and confirm.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Orders to validate</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Textarea rows={4} placeholder="ORD2600320, ORD2600321 …  (comma, space, or newline separated)"
            value={input} onChange={(e) => setInput(e.target.value)} />
          <div className="flex justify-end">
            <Button onClick={run} disabled={busy}>
              {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Validating…</> : 'Run validation'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Results — {rows.length} order(s)</CardTitle>
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="default">OK: {counts.OK || 0}</Badge>
              <Badge variant="destructive">Mismatch: {counts.MISMATCH || 0}</Badge>
              <Badge variant="outline">Stale: {counts.STALE_RULES || 0}</Badge>
              <Badge variant="secondary">Missing: {counts.MISSING || 0}</Badge>
              <Button variant="ghost" size="sm" onClick={exportCsv}>
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />CSV
              </Button>
              <Button variant="ghost" size="sm" onClick={exportPdf}>
                <FileDown className="h-3.5 w-3.5 mr-1" />PDF
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead className="text-right">Computed</TableHead>
                  <TableHead className="text-right">Δ</TableHead>
                  <TableHead>Rules v</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.order_number} className={r.status === 'MISMATCH' ? 'bg-rose-50/40 dark:bg-rose-950/20' : ''}>
                    <TableCell>
                      {r.status !== 'OK' && r.status !== 'MISSING' && (
                        <Checkbox checked={selected.has(r.order_number)} onCheckedChange={() => toggle(r.order_number)} />
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.order_number}</TableCell>
                    <TableCell>
                      {r.status === 'OK' && <Badge variant="default"><CheckCircle2 className="h-3 w-3 mr-1" />OK</Badge>}
                      {r.status === 'MISMATCH' && <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Mismatch</Badge>}
                      {r.status === 'STALE_RULES' && <Badge variant="outline">Stale rules</Badge>}
                      {r.status === 'MISSING' && <Badge variant="secondary">Missing</Badge>}
                    </TableCell>
                    <TableCell className="text-right text-xs">{inr(r.expected_total)}</TableCell>
                    <TableCell className="text-right text-xs">{inr(r.computed_total)}</TableCell>
                    <TableCell className={`text-right text-xs ${Math.abs(r.delta) > 1 ? 'text-rose-600 font-medium' : ''}`}>
                      {r.delta === 0 ? '—' : inr(r.delta)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.rules_version_stored || <span className="text-muted-foreground italic">none</span>}
                      {r.stale && r.rules_version_stored && <span className="text-amber-600"> ≠ v{PROFORMA_RULES_VERSION}</span>}
                    </TableCell>
                    <TableCell>
                      {r.order_id && (
                        <Link to={`/orders?open=${r.order_id}`} className="text-xs underline inline-flex items-center">
                          Open <ExternalLink className="h-3 w-3 ml-0.5" />
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {selected.size > 0 && (
              <div className="mt-3 p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-xs flex items-center justify-between">
                <span>{selected.size} order(s) selected for regeneration. Open each one and click <em>Regenerate Proforma</em> in the dialog — bulk PDF generation runs client-side and uses the same dialog you'd use manually.</span>
              </div>
            )}

            {rows.some((r) => r.rule_hits.length > 0 && r.status === 'MISMATCH') && (
              <div className="mt-4 text-xs space-y-1">
                <div className="font-semibold">Rule attribution per mismatched order</div>
                {rows.filter((r) => r.status === 'MISMATCH').map((r) => (
                  <div key={r.order_number} className="border-l-2 border-rose-400 pl-2">
                    <span className="font-mono">{r.order_number}</span>: {r.rule_hits.join(' · ')}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
