import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ArrowRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface AuditRow {
  id: string;
  created_at: string;
  order_number: string | null;
  action: string;
  triggered_by: string | null;
  triggered_by_name: string | null;
  rules_version: string | null;
  line_changes: any;
  rolled_back_at: string | null;
}

const PAGE_SIZE = 25;

const ACTIONS = [
  { value: 'all', label: 'All actions' },
  { value: 'GENERATE', label: 'Generate' },
  { value: 'REGENERATE', label: 'Regenerate / Auto-regenerate' },
  { value: 'AUTO_FIX_GST', label: 'Auto-fix GST' },
  { value: 'MANUAL_OVERRIDE', label: 'Manual override' },
  { value: 'ROLLBACK', label: 'Rollback' },
];

/** Compact human summary of the `line_changes` payload (handles both
 *  legacy arrays and the newer `{ rules_version, role, changes: [...] }`). */
function summarize(lineChanges: any): string {
  if (!lineChanges) return '—';
  const list = Array.isArray(lineChanges)
    ? lineChanges
    : Array.isArray(lineChanges?.changes)
      ? lineChanges.changes
      : null;
  if (list) {
    if (list.length === 0) return 'No line changes';
    const added = list.filter((c: any) => c.field === '__added__').length;
    const removed = list.filter((c: any) => c.field === '__removed__').length;
    const fieldChanges = list.filter((c: any) => c.field !== '__added__' && c.field !== '__removed__');
    const fieldCounts: Record<string, number> = {};
    fieldChanges.forEach((c: any) => { fieldCounts[c.field] = (fieldCounts[c.field] || 0) + 1; });
    const parts: string[] = [];
    if (added) parts.push(`+${added} added`);
    if (removed) parts.push(`-${removed} removed`);
    Object.entries(fieldCounts).forEach(([f, n]) => parts.push(`${n}× ${f}`));
    return parts.join(', ') || `${list.length} change(s)`;
  }
  if (typeof lineChanges?.reason === 'string') return `Reason: ${lineChanges.reason}`;
  return JSON.stringify(lineChanges).slice(0, 80);
}

export default function ProformaAudit() {
  const { role, loading: authLoading } = useAuth();
  const isPriv = role === 'admin' || role === 'finance';

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  const [orderSearch, setOrderSearch] = useState('');
  const [action, setAction] = useState<string>('all');
  const [triggeredBy, setTriggeredBy] = useState<string>('all');
  const [rulesVersion, setRulesVersion] = useState<string>('all');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');

  const [userOptions, setUserOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [versionOptions, setVersionOptions] = useState<string[]>([]);

  // Load filter dropdown options once.
  useEffect(() => {
    if (!isPriv) return;
    (async () => {
      const { data } = await (supabase.from('proforma_rule_audit') as any)
        .select('triggered_by, triggered_by_name, rules_version')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (data) {
        const users = new Map<string, string>();
        const versions = new Set<string>();
        (data as any[]).forEach((d) => {
          if (d.triggered_by) users.set(d.triggered_by, d.triggered_by_name || d.triggered_by);
          if (d.rules_version) versions.add(d.rules_version);
        });
        setUserOptions(Array.from(users.entries()).map(([id, name]) => ({ id, name })));
        setVersionOptions(Array.from(versions).sort().reverse());
      }
    })();
  }, [isPriv]);

  const fetchPage = async () => {
    setLoading(true);
    try {
      let q: any = (supabase.from('proforma_rule_audit') as any)
        .select(
          'id, created_at, order_number, action, triggered_by, triggered_by_name, rules_version, line_changes, rolled_back_at',
          { count: 'exact' },
        )
        .order('created_at', { ascending: false });
      if (orderSearch.trim()) q = q.ilike('order_number', `%${orderSearch.trim()}%`);
      if (action !== 'all') q = q.eq('action', action);
      if (triggeredBy !== 'all') q = q.eq('triggered_by', triggeredBy);
      if (rulesVersion !== 'all') q = q.eq('rules_version', rulesVersion);
      if (from) q = q.gte('created_at', new Date(from).toISOString());
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        q = q.lte('created_at', end.toISOString());
      }
      const start = page * PAGE_SIZE;
      q = q.range(start, start + PAGE_SIZE - 1);
      const { data, error, count } = await q;
      if (error) throw error;
      setRows((data || []) as AuditRow[]);
      setTotal(count || 0);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load audit entries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isPriv) return;
    fetchPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPriv, page, action, triggeredBy, rulesVersion, from, to]);

  // Debounce order search.
  useEffect(() => {
    if (!isPriv) return;
    const t = setTimeout(() => { setPage(0); fetchPage(); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderSearch]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  if (authLoading) {
    return (
      <div className="py-10 text-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading…
      </div>
    );
  }
  if (!isPriv) {
    return <Navigate to="/proforma-reconciliation" replace />;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Proforma Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          Every rule change, auto-fix, regenerate, override, and rollback across all orders.
        </p>
      </div>

      <Card>
        <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2">
            <Label>Order number</Label>
            <Input
              placeholder="ORD2600320 / ORD-…"
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
            />
          </div>
          <div>
            <Label>Action</Label>
            <Select value={action} onValueChange={(v) => { setAction(v); setPage(0); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Triggered by</Label>
            <Select value={triggeredBy} onValueChange={(v) => { setTriggeredBy(v); setPage(0); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Anyone</SelectItem>
                {userOptions.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Rules version</Label>
            <Select value={rulesVersion} onValueChange={(v) => { setRulesVersion(v); setPage(0); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any version</SelectItem>
                {versionOptions.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:col-span-1">
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} />
            </div>
          </div>
          <div className="md:col-span-3 lg:col-span-6 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              setOrderSearch(''); setAction('all'); setTriggeredBy('all'); setRulesVersion('all');
              setFrom(''); setTo(''); setPage(0);
            }}>Reset filters</Button>
            <Button size="sm" onClick={() => { setPage(0); fetchPage(); }}>
              <RefreshCw className="h-3 w-3 mr-1" />Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span>{total.toLocaleString()} entries</span>
            <span className="text-xs font-normal text-muted-foreground">
              Page {page + 1} of {pageCount}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No audit entries match these filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">When</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>Rules ver.</TableHead>
                    <TableHead>Changes</TableHead>
                    <TableHead className="text-right">Open</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id} className={r.rolled_back_at ? 'opacity-60' : ''}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {format(new Date(r.created_at), 'dd MMM yyyy HH:mm')}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.order_number || '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline">{r.action}</Badge>
                          {r.rolled_back_at && <Badge variant="secondary" className="text-[10px]">Rolled back</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{r.triggered_by_name || '—'}</TableCell>
                      <TableCell className="text-xs">{r.rules_version || '—'}</TableCell>
                      <TableCell className="text-xs max-w-md truncate" title={summarize(r.line_changes)}>
                        {summarize(r.line_changes)}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.order_number ? (
                          <Button asChild size="sm" variant="ghost" className="h-7">
                            <Link to={`/proforma-reconciliation?order=${encodeURIComponent(r.order_number)}`}>
                              Open <ArrowRight className="h-3 w-3 ml-1" />
                            </Link>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex items-center justify-between mt-4">
            <div className="text-xs text-muted-foreground">
              Showing {rows.length === 0 ? 0 : page * PAGE_SIZE + 1}–{page * PAGE_SIZE + rows.length} of {total.toLocaleString()}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Button>
              <Button size="sm" variant="outline" disabled={page + 1 >= pageCount || loading}
                onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}