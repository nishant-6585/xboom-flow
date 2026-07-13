import { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AdminTabsNav from '@/components/admin/AdminTabsNav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Upload, Loader2, FileText, CheckCircle2, AlertTriangle } from 'lucide-react';

type ParsedRow = {
  rowNumber: number;
  id: string | null;
  product_name: string;
  current_category: string | null;
  new_category: string | null;
  status: 'ok' | 'unchanged' | 'missing_id' | 'missing_category' | 'not_found';
  message?: string;
};

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  // Minimal RFC-4180-ish parser (supports "..." quotes and doubled quotes)
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = '';
        if (row.some((v) => v.length > 0)) rows.push(row);
        row = [];
      } else cur += c;
    }
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row); }
  const headers = (rows.shift() ?? []).map((h) => h.trim().toLowerCase());
  return { headers, rows };
}

export default function PricelistCategoryImport() {
  const [csvText, setCsvText] = useState('');
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<ParsedRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ updated: number; unchanged: number; missing: number } | null>(null);

  const readyRows = useMemo(() => preview.filter((r) => r.status === 'ok'), [preview]);

  async function handleFile(f: File) {
    const text = await f.text();
    setCsvText(text);
    await runPreview(text);
  }

  async function runPreview(text: string) {
    setResult(null);
    const { headers, rows } = parseCsv(text);
    const idIdx = headers.indexOf('id');
    const catIdx = headers.indexOf('product_category');
    const nameIdx = headers.indexOf('product_name');
    if (idIdx === -1 || catIdx === -1) {
      toast.error('CSV must include "id" and "product_category" columns');
      setPreview([]);
      return;
    }

    const ids = rows.map((r) => (r[idIdx] || '').trim()).filter(Boolean);
    let existing: Record<string, { product_category: string | null; product_name: string | null }> = {};
    if (ids.length > 0) {
      const { data, error } = await supabase
        .from('pricelist')
        .select('id, product_name, product_category')
        .in('id', ids);
      if (error) {
        toast.error('Could not load current categories: ' + error.message);
        return;
      }
      existing = Object.fromEntries((data ?? []).map((r: any) => [r.id, r]));
    }

    const parsed: ParsedRow[] = rows.map((r, i) => {
      const id = (r[idIdx] || '').trim() || null;
      const newCat = (r[catIdx] || '').trim() || null;
      const name = nameIdx >= 0 ? (r[nameIdx] || '').trim() : '';
      if (!id) return { rowNumber: i + 2, id: null, product_name: name, current_category: null, new_category: newCat, status: 'missing_id' };
      if (!newCat) return { rowNumber: i + 2, id, product_name: name, current_category: null, new_category: null, status: 'missing_category' };
      const cur = existing[id];
      if (!cur) return { rowNumber: i + 2, id, product_name: name, current_category: null, new_category: newCat, status: 'not_found' };
      const current = cur.product_category ?? null;
      if ((current ?? '') === newCat) {
        return { rowNumber: i + 2, id, product_name: cur.product_name ?? name, current_category: current, new_category: newCat, status: 'unchanged' };
      }
      return { rowNumber: i + 2, id, product_name: cur.product_name ?? name, current_category: current, new_category: newCat, status: 'ok' };
    });
    setPreview(parsed);
  }

  async function apply() {
    if (readyRows.length === 0) { toast.error('Nothing to apply'); return; }
    setUploading(true);
    try {
      const payload = readyRows.map((r) => ({ id: r.id, product_category: r.new_category }));
      const { data, error } = await supabase.rpc('update_pricelist_categories_bulk', {
        p_items: payload as any,
        p_reason: reason || null,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const res = { updated: Number(row?.updated ?? 0), unchanged: Number(row?.unchanged ?? 0), missing: Number(row?.missing ?? 0) };
      setResult(res);
      toast.success(`Applied ${res.updated} updates — audit trail recorded`);
      await runPreview(csvText);
    } catch (e: any) {
      toast.error(e.message ?? 'Bulk update failed');
    } finally {
      setUploading(false);
    }
  }

  const summary = useMemo(() => {
    const c = { ok: 0, unchanged: 0, missing_id: 0, missing_category: 0, not_found: 0 } as Record<string, number>;
    preview.forEach((r) => { c[r.status]++; });
    return c;
  }, [preview]);

  return (
    <div className="min-h-screen bg-background">
      <AdminTabsNav active="pricelist-category-import" />
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold">Pricelist Category Import</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload CSV</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload a CSV with at least the columns <code>id</code> and <code>product_category</code>.
              Existing columns exported from the pricelist (e.g. <code>product_name</code>) are ignored during update.
              Every changed row is recorded in <code>edit_history</code> with your name and an optional reason.
            </p>
            <div className="flex items-center gap-3">
              <Input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                className="max-w-md"
              />
              {csvText && (
                <Button variant="outline" size="sm" onClick={() => runPreview(csvText)}>Re-parse</Button>
              )}
            </div>
            <div className="grid gap-1">
              <Label htmlFor="reason">Reason (optional, applied to every updated row)</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Recategorization of Xboom rows after brand-vs-category cleanup"
                className="min-h-[60px]"
                maxLength={500}
              />
            </div>
          </CardContent>
        </Card>

        {preview.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                Preview
                <Badge variant="outline">{preview.length} rows</Badge>
                <Badge variant="secondary">{summary.ok} to update</Badge>
                {summary.unchanged > 0 && <Badge variant="outline">{summary.unchanged} unchanged</Badge>}
                {(summary.missing_id + summary.missing_category + summary.not_found) > 0 && (
                  <Badge variant="destructive">{summary.missing_id + summary.missing_category + summary.not_found} skipped</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Button onClick={apply} disabled={uploading || readyRows.length === 0}>
                  {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                  Apply {readyRows.length} updates
                </Button>
                {result && (
                  <div className="text-sm inline-flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Updated: {result.updated} · Unchanged: {result.unchanged} · Skipped: {result.missing}
                  </div>
                )}
              </div>
              <div className="max-h-[500px] overflow-y-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">#</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Current category</TableHead>
                      <TableHead>New category</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.slice(0, 500).map((r) => (
                      <TableRow key={`${r.rowNumber}-${r.id ?? 'x'}`}>
                        <TableCell className="text-xs text-muted-foreground">{r.rowNumber}</TableCell>
                        <TableCell className="text-sm">
                          <div>{r.product_name || '—'}</div>
                          <div className="text-xs text-muted-foreground">{r.id?.slice(0, 8) ?? '—'}</div>
                        </TableCell>
                        <TableCell className="text-xs">{r.current_category ?? '—'}</TableCell>
                        <TableCell className="text-xs">{r.new_category ?? '—'}</TableCell>
                        <TableCell>
                          {r.status === 'ok' && <Badge>Will update</Badge>}
                          {r.status === 'unchanged' && <Badge variant="outline">Unchanged</Badge>}
                          {r.status === 'missing_id' && <Badge variant="destructive" className="inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Missing id</Badge>}
                          {r.status === 'missing_category' && <Badge variant="destructive" className="inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Missing category</Badge>}
                          {r.status === 'not_found' && <Badge variant="destructive" className="inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Not found</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {preview.length > 500 && (
                  <div className="p-2 text-xs text-muted-foreground text-center">
                    Showing first 500 of {preview.length} rows.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}