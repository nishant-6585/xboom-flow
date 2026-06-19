import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, RotateCcw, RefreshCw, FileDown, FileText, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface SalesNotesAuditRecord {
  id: string;
  old_value: string | null;
  new_value: string | null;
  edited_by_name: string;
  edited_at: string;
}

interface Props {
  orderId: string;
  orderLabel: string;
  refreshKey?: number;
  onUndo: (previousValue: string) => void;
}

function truncate(v: string | null, n = 140): string {
  if (!v) return '(empty)';
  return v.length > n ? v.slice(0, n) + '…' : v;
}

export function SalesNotesAuditPanel({ orderId, orderLabel, refreshKey, onUndo }: Props) {
  const { toast } = useToast();
  const [records, setRecords] = useState<SalesNotesAuditRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('edit_history')
      .select('id, old_value, new_value, edited_by_name, edited_at')
      .eq('table_name', 'shopify_orders')
      .eq('record_id', orderId)
      .eq('field_name', 'sales_notes')
      .order('edited_at', { ascending: false })
      .limit(100);
    if (error) {
      console.error('Failed to load sales notes history:', error);
      toast({ title: 'Could not load notes history', description: error.message, variant: 'destructive' });
    } else {
      setRecords((data ?? []) as SalesNotesAuditRecord[]);
    }
    setLoading(false);
  }, [orderId, toast]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory, refreshKey]);

  const handleUndo = () => {
    const latest = records[0];
    if (!latest) return;
    onUndo(latest.old_value ?? '');
    toast({
      title: 'Reverted to previous version',
      description: `Restored sales notes from ${format(new Date(latest.edited_at), 'dd MMM, h:mm a')}. Autosave will persist the change.`,
    });
  };

  const exportCsv = () => {
    const rows = [
      ['Edited At', 'Editor', 'Previous Value', 'New Value'],
      ...records.map(r => [
        format(new Date(r.edited_at), 'yyyy-MM-dd HH:mm:ss'),
        r.edited_by_name ?? '',
        r.old_value ?? '',
        r.new_value ?? '',
      ]),
    ];
    const csv = rows
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-notes-audit-${orderLabel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.setFontSize(14);
    doc.text(`Sales Notes Audit — ${orderLabel}`, 14, 16);
    doc.setFontSize(10);
    doc.text(`Exported ${format(new Date(), 'dd MMM yyyy, h:mm a')}`, 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [['Edited At', 'Editor', 'Previous', 'New']],
      body: records.map(r => [
        format(new Date(r.edited_at), 'dd MMM yyyy h:mm a'),
        r.edited_by_name ?? '',
        r.old_value ?? '(empty)',
        r.new_value ?? '(empty)',
      ]),
      styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillBy: undefined, fillColor: [30, 41, 59], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 32 },
        1: { cellWidth: 30 },
        2: { cellWidth: 60 },
        3: { cellWidth: 60 },
      },
    });
    doc.save(`sales-notes-audit-${orderLabel}.pdf`);
  };

  return (
    <div className="mt-3 border rounded-lg bg-muted/30">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b">
        <div className="flex items-center gap-2 text-xs font-medium">
          <History className="h-3.5 w-3.5" />
          Sales notes history
          {records.length > 0 && (
            <Badge variant="secondary" className="h-5 text-[10px]">{records.length}</Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[10px] gap-1"
            onClick={handleUndo} disabled={records.length === 0}>
            <RotateCcw className="h-3 w-3" /> Undo last
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[10px] gap-1"
            onClick={fetchHistory} disabled={loading}>
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[10px] gap-1"
            onClick={exportCsv} disabled={records.length === 0}>
            <FileDown className="h-3 w-3" /> CSV
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[10px] gap-1"
            onClick={exportPdf} disabled={records.length === 0}>
            <FileText className="h-3 w-3" /> PDF
          </Button>
        </div>
      </div>
      {loading ? (
        <div className="p-3 text-xs text-muted-foreground text-center">Loading…</div>
      ) : records.length === 0 ? (
        <div className="p-3 text-xs text-muted-foreground text-center">No sales notes changes yet</div>
      ) : (
        <ScrollArea className="h-[240px]">
          <div className="p-2 space-y-2">
            {records.map(r => (
              <div key={r.id} className="rounded border bg-background px-2.5 py-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-primary">{r.edited_by_name || 'Unknown'}</span>
                  <span className="text-muted-foreground text-[10px]">
                    {format(new Date(r.edited_at), 'dd MMM yyyy, h:mm a')}
                  </span>
                </div>
                <div className="mt-1 flex items-start gap-1.5">
                  <span className="line-through text-destructive/70 whitespace-pre-wrap break-words flex-1">
                    {truncate(r.old_value)}
                  </span>
                  <ArrowRight className="h-3 w-3 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-green-600 dark:text-green-400 whitespace-pre-wrap break-words flex-1">
                    {truncate(r.new_value)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}