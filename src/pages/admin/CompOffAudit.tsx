import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AdminTabsNav from '@/components/admin/AdminTabsNav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, parseISO } from 'date-fns';
import { ShieldCheck, Loader2, Download, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';

interface AuditRow {
  id: string;
  ledger_id: string;
  employee_id: string;
  action: 'submitted' | 'approved' | 'rejected';
  actor_name: string | null;
  reason: string | null;
  comment: string | null;
  earned_date: string | null;
  earned_type: string | null;
  created_at: string;
  employee_name?: string;
}

export default function CompOffAudit() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState<string>(monthAgo);
  const [toDate, setToDate] = useState<string>(today);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('compoff_audit_log').select('*').order('created_at', { ascending: false });
    if (fromDate) q = q.gte('created_at', `${fromDate}T00:00:00`);
    if (toDate) q = q.lte('created_at', `${toDate}T23:59:59`);
    const { data, error } = await q.limit(2000);
    if (error) { setLoading(false); toast.error(error.message); return; }
    const ids = Array.from(new Set((data || []).map((r: any) => r.employee_id)));
    const nameById: Record<string, string> = {};
    if (ids.length) {
      const { data: emps } = await supabase.from('employees').select('id, name').in('id', ids);
      (emps || []).forEach((e: any) => { nameById[e.id] = e.name; });
    }
    setRows((data || []).map((r: any) => ({ ...r, employee_name: nameById[r.employee_id] })));
    setLoading(false);
  }, [fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  const filenameBase = useMemo(
    () => `compoff-audit_${fromDate || 'all'}_to_${toDate || 'now'}`,
    [fromDate, toDate],
  );

  const toCsvValue = (v: any) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const exportCsv = () => {
    const headers = ['When', 'Employee', 'Action', 'Actor', 'Earned Date', 'Earned Type', 'Reason', 'Comment'];
    const lines = [headers.join(',')];
    rows.forEach(r => {
      lines.push([
        format(parseISO(r.created_at), 'yyyy-MM-dd HH:mm'),
        r.employee_name || r.employee_id,
        r.action,
        r.actor_name || '',
        r.earned_date ? format(parseISO(r.earned_date), 'yyyy-MM-dd') : '',
        r.earned_type || '',
        r.reason || '',
        r.comment || '',
      ].map(toCsvValue).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${filenameBase}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text('Comp-off Approval Audit Log', 14, 14);
    doc.setFontSize(10);
    doc.text(
      `Range: ${fromDate || 'earliest'} → ${toDate || 'today'}  •  ${rows.length} entries  •  Generated ${format(new Date(), 'yyyy-MM-dd HH:mm')}`,
      14, 20,
    );
    autoTable(doc, {
      startY: 26,
      head: [['When', 'Employee', 'Action', 'Actor', 'Earned', 'Type', 'Reason / Comment']],
      body: rows.map(r => [
        format(parseISO(r.created_at), 'yyyy-MM-dd HH:mm'),
        r.employee_name || r.employee_id.slice(0, 8),
        r.action,
        r.actor_name || '—',
        r.earned_date ? format(parseISO(r.earned_date), 'yyyy-MM-dd') : '—',
        r.earned_type || '—',
        [r.reason ? `Reason: ${r.reason}` : '', r.comment || ''].filter(Boolean).join(' • ') || '—',
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [15, 23, 42] },
      columnStyles: { 6: { cellWidth: 90 } },
    });
    doc.save(`${filenameBase}.pdf`);
  };

  return (
    <div className="min-h-screen bg-background">
      <AdminTabsNav active="compoff-audit" />
      <div className="container mx-auto px-4 py-6 space-y-4">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" /> Comp-off Approval Audit Log
              </CardTitle>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-8 text-sm" />
                </div>
                <Button size="sm" variant="outline" onClick={exportCsv} disabled={loading || rows.length === 0} className="gap-1">
                  <Download className="h-4 w-4" /> CSV
                </Button>
                <Button size="sm" variant="outline" onClick={exportPdf} disabled={loading || rows.length === 0} className="gap-1">
                  <FileText className="h-4 w-4" /> PDF
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
              </div>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No comp-off audit entries yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/80">
                    <TableHead className="font-bold text-foreground">When</TableHead>
                    <TableHead className="font-bold text-foreground">Employee</TableHead>
                    <TableHead className="font-bold text-foreground">Action</TableHead>
                    <TableHead className="font-bold text-foreground">Actor</TableHead>
                    <TableHead className="font-bold text-foreground">Earned</TableHead>
                    <TableHead className="font-bold text-foreground">Reason / Comment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {format(parseISO(r.created_at), 'MMM d, yyyy • h:mm a')}
                      </TableCell>
                      <TableCell className="text-sm">{r.employee_name || r.employee_id.slice(0, 8)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            r.action === 'approved' ? 'default'
                              : r.action === 'rejected' ? 'destructive'
                              : 'secondary'
                          }
                          className="capitalize"
                        >
                          {r.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{r.actor_name || '—'}</TableCell>
                      <TableCell className="text-xs">
                        {r.earned_date ? format(parseISO(r.earned_date), 'MMM d, yyyy') : '—'}
                        {r.earned_type ? ` (${r.earned_type})` : ''}
                      </TableCell>
                      <TableCell className="text-xs max-w-md">
                        {r.reason && <div className="text-red-700">Reason: {r.reason}</div>}
                        {r.comment && <div className="text-muted-foreground">{r.comment}</div>}
                        {!r.reason && !r.comment && <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}