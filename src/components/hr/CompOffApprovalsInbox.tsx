import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2, Check, X, Gift, Calendar, User, Search, Filter,
  ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight,
  Download, FileText, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  sendCompoffDecisionEmail,
  retryCompoffDecisionEmail,
  type CompoffNotifLogRow,
} from '@/lib/compoffNotify';

interface PendingCredit {
  id: string;
  employee_id: string;
  earned_date: string;
  earned_type: 'holiday' | 'weekend';
  holiday_name: string | null;
  created_at: string;
  expires_at: string;
  employee_name?: string;
}

type ExpiryFilter = 'all' | 'expired' | 'expiring_7' | 'expiring_30';
type SortBy = 'employee' | 'worked' | 'expiry' | 'submitted';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function CompOffApprovalsInbox() {
  const [rows, setRows] = useState<PendingCredit[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showRejectFor, setShowRejectFor] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [workedFrom, setWorkedFrom] = useState('');
  const [workedTo, setWorkedTo] = useState('');
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>('all');

  // Sorting + pagination
  const [sortBy, setSortBy] = useState<SortBy>('submitted');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Bulk actions
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sharedComment, setSharedComment] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMode, setBulkMode] = useState<'approve' | 'reject' | null>(null);

  // Debounce employee search into the server-side query
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase.rpc('list_pending_compoff_credits', {
        p_search: debouncedSearch || null,
        p_worked_from: workedFrom || null,
        p_worked_to: workedTo || null,
        p_expiry_filter: expiryFilter,
        p_sort_by: sortBy,
        p_sort_dir: sortDir,
        p_page: page,
        p_page_size: pageSize,
      } as any);
      if (error) throw error;
      const list = (data || []) as any[];
      setTotalCount(list[0]?.total_count ? Number(list[0].total_count) : 0);
      setRows(list.map(r => ({
        id: r.id,
        employee_id: r.employee_id,
        employee_name: r.employee_name,
        earned_date: r.earned_date,
        earned_type: r.earned_type,
        holiday_name: r.holiday_name,
        created_at: r.created_at,
        expires_at: r.expires_at,
      })));
      setSelected(new Set());
    } catch (e: any) {
      setLoadError(e.message || 'Failed to load pending comp-off requests');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, workedFrom, workedTo, expiryFilter, sortBy, sortDir, page, pageSize]);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  // Reset page when filters/sort change
  useEffect(() => { setPage(1); }, [workedFrom, workedTo, expiryFilter, sortBy, sortDir, pageSize]);

  // Actor name (for outbound emails)
  const [actorName, setActorName] = useState<string>('HR');
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('name').eq('id', user.id).maybeSingle();
      if (data?.name) setActorName(data.name);
    })();
  }, []);

  // Server already filtered/sorted/paginated; use rows directly
  const filtered = rows;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const allVisibleSelected = filtered.length > 0 && filtered.every(r => selected.has(r.id));
  const toggleAllVisible = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) filtered.forEach(r => next.delete(r.id));
      else filtered.forEach(r => next.add(r.id));
      return next;
    });
  };
  const toggleOne = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleSort = (col: SortBy) => {
    if (sortBy === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir(col === 'employee' || col === 'worked' ? 'asc' : 'desc'); }
  };
  const SortIcon = ({ col }: { col: SortBy }) =>
    sortBy !== col
      ? <ArrowUpDown className="h-3 w-3 opacity-50" />
      : sortDir === 'asc'
        ? <ArrowUp className="h-3 w-3" />
        : <ArrowDown className="h-3 w-3" />;

  // Notification failure log
  const [failedNotifs, setFailedNotifs] = useState<CompoffNotifLogRow[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [retryingLogId, setRetryingLogId] = useState<string | null>(null);
  const loadFailedNotifs = useCallback(async () => {
    setNotifLoading(true);
    const { data } = await supabase
      .from('compoff_notification_log')
      .select('*')
      .in('status', ['failed', 'skipped'])
      .order('updated_at', { ascending: false })
      .limit(50);
    setFailedNotifs((data || []) as any);
    setNotifLoading(false);
  }, []);
  useEffect(() => { loadFailedNotifs(); }, [loadFailedNotifs]);

  const retryEmail = async (row: CompoffNotifLogRow) => {
    setRetryingLogId(row.id);
    const res = await retryCompoffDecisionEmail(row);
    setRetryingLogId(null);
    if (res.status === 'sent') {
      toast.success('Notification email re-sent');
    } else if (res.status === 'skipped') {
      toast.warning(res.error || 'Skipped — no recipient email');
    } else {
      toast.error(res.error || 'Retry failed');
    }
    loadFailedNotifs();
  };

  const handleApprove = async (id: string) => {
    const row = rows.find(r => r.id === id);
    setBusyId(id);
    const { error } = await supabase.rpc('approve_compoff_credit', {
      p_ledger_id: id,
      p_comment: reasonById[id] || null,
    });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Comp-off credit approved');
    if (row) {
      const res = await sendCompoffDecisionEmail({
        ledger_id: row.id,
        employee_id: row.employee_id,
        earned_date: row.earned_date,
        earned_type: row.earned_type,
        decision: 'approved',
        comment: reasonById[id] || null,
        actor_name: actorName,
      });
      if (res.status === 'failed') toast.warning(`Approved, but email failed: ${res.error || 'unknown error'}`);
      loadFailedNotifs();
    }
    fetchPending();
  };

  const handleReject = async (id: string) => {
    const row = rows.find(r => r.id === id);
    const reason = (reasonById[id] || '').trim();
    if (!reason) { toast.error('A rejection reason is required'); return; }
    setBusyId(id);
    const { error } = await supabase.rpc('reject_compoff_credit', {
      p_ledger_id: id,
      p_reason: reason,
    });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Comp-off credit rejected');
    if (row) {
      const res = await sendCompoffDecisionEmail({
        ledger_id: row.id,
        employee_id: row.employee_id,
        earned_date: row.earned_date,
        earned_type: row.earned_type,
        decision: 'rejected',
        reason,
        actor_name: actorName,
      });
      if (res.status === 'failed') toast.warning(`Rejected, but email failed: ${res.error || 'unknown error'}`);
      loadFailedNotifs();
    }
    setShowRejectFor(null);
    fetchPending();
  };

  const runBulk = async (mode: 'approve' | 'reject') => {
    if (!selected.size) { toast.error('Select at least one request'); return; }
    const shared = sharedComment.trim();
    if (mode === 'reject' && !shared) {
      toast.error('A shared rejection reason is required');
      return;
    }
    setBulkBusy(true);
    const ids = Array.from(selected);
    const targets = rows.filter(r => selected.has(r.id));
    try {
      const rpc = mode === 'approve' ? 'approve_compoff_credits_bulk' : 'reject_compoff_credits_bulk';
      const args = mode === 'approve'
        ? { p_ledger_ids: ids, p_comment: shared || null }
        : { p_ledger_ids: ids, p_reason: shared };
      const { data, error } = await supabase.rpc(rpc as any, args as any);
      if (error) throw error;
      const results = (data || []) as Array<{ ledger_id: string; ok: boolean; error: string | null }>;
      const okIds = new Set(results.filter(r => r.ok).map(r => r.ledger_id));
      const failed = results.filter(r => !r.ok);

      // Fire notification emails for successes (in-app notif is done inside RPC)
      let emailFails = 0;
      await Promise.all(targets.filter(r => okIds.has(r.id)).map(async r => {
        const res = await sendCompoffDecisionEmail({
          ledger_id: r.id,
          employee_id: r.employee_id,
          earned_date: r.earned_date,
          earned_type: r.earned_type,
          decision: mode === 'approve' ? 'approved' : 'rejected',
          comment: mode === 'approve' ? shared || null : null,
          reason: mode === 'reject' ? shared : null,
          actor_name: actorName,
        });
        if (res.status === 'failed') emailFails++;
      }));
      if (emailFails > 0) toast.warning(`${emailFails} notification email(s) failed — see the retry log below`);
      loadFailedNotifs();

      setSelected(prev => {
        const next = new Set(prev);
        okIds.forEach(id => next.delete(id));
        return next;
      });

      if (failed.length === 0) {
        toast.success(`${okIds.size} request(s) ${mode === 'approve' ? 'approved' : 'rejected'}`);
        setSharedComment('');
        setBulkMode(null);
      } else {
        toast.warning(`${okIds.size} succeeded, ${failed.length} failed. First error: ${failed[0].error}`);
      }
      fetchPending();
    } catch (e: any) {
      toast.error(e.message || 'Bulk action failed');
    } finally {
      setBulkBusy(false);
    }
  };

  // Exports (current filtered/sorted view)
  const filenameBase = useMemo(() => {
    const parts = ['compoff-approvals', debouncedSearch || 'all',
      workedFrom || 'any', workedTo || 'any', expiryFilter];
    return parts.join('_').replace(/[^a-z0-9_-]/gi, '');
  }, [debouncedSearch, workedFrom, workedTo, expiryFilter]);

  const toCsvValue = (v: any) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const fetchAllForExport = async (): Promise<PendingCredit[]> => {
    // Pull all pages under current filters/sort (cap by totalCount)
    const all: PendingCredit[] = [];
    const size = 200;
    const pages = Math.max(1, Math.ceil(totalCount / size));
    for (let p = 1; p <= pages; p++) {
      const { data, error } = await supabase.rpc('list_pending_compoff_credits', {
        p_search: debouncedSearch || null,
        p_worked_from: workedFrom || null,
        p_worked_to: workedTo || null,
        p_expiry_filter: expiryFilter,
        p_sort_by: sortBy,
        p_sort_dir: sortDir,
        p_page: p,
        p_page_size: size,
      } as any);
      if (error) throw error;
      (data || []).forEach((r: any) => all.push(r));
    }
    return all;
  };

  const exportCsv = async () => {
    try {
      const list = await fetchAllForExport();
      const headers = ['Employee','Worked On','Type','Holiday','Submitted','Expires'];
      const lines = [headers.join(',')];
      list.forEach(r => lines.push([
        r.employee_name || r.employee_id,
        r.earned_date,
        r.earned_type,
        r.holiday_name || '',
        r.created_at,
        r.expires_at,
      ].map(toCsvValue).join(',')));
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${filenameBase}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${list.length} row(s)`);
    } catch (e: any) {
      toast.error(e.message || 'CSV export failed');
    }
  };

  const exportPdf = async () => {
    try {
      const list = await fetchAllForExport();
      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFontSize(14);
      doc.text('Pending Comp-off Approvals', 14, 14);
      doc.setFontSize(10);
      doc.text(
        `${list.length} entries • Filters: name="${debouncedSearch || 'any'}", worked ${workedFrom || 'any'} → ${workedTo || 'any'}, expiry=${expiryFilter} • Generated ${format(new Date(),'yyyy-MM-dd HH:mm')}`,
        14, 20,
      );
      autoTable(doc, {
        startY: 26,
        head: [['Employee','Worked On','Type','Holiday','Submitted','Expires']],
        body: list.map(r => [
          r.employee_name || r.employee_id.slice(0, 8),
          r.earned_date ? format(parseISO(r.earned_date), 'yyyy-MM-dd') : '',
          r.earned_type,
          r.holiday_name || '—',
          r.created_at ? format(parseISO(r.created_at), 'yyyy-MM-dd HH:mm') : '',
          r.expires_at ? format(parseISO(r.expires_at), 'yyyy-MM-dd') : '',
        ]),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [15, 23, 42] },
      });
      doc.save(`${filenameBase}.pdf`);
    } catch (e: any) {
      toast.error(e.message || 'PDF export failed');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Gift className="h-4 w-4" /> Comp-off Credit Approvals
          <Badge variant="outline" className="ml-2">{totalCount} pending</Badge>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={loading || totalCount === 0} className="gap-1 h-8">
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button size="sm" variant="outline" onClick={exportPdf} disabled={loading || totalCount === 0} className="gap-1 h-8">
              <FileText className="h-4 w-4" /> PDF
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loadError && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-2 text-sm">
            <span className="text-destructive">Failed to load: {loadError}</span>
            <Button size="sm" variant="outline" onClick={fetchPending} className="gap-1 h-7">
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </Button>
          </div>
        )}

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 rounded-lg border p-3 bg-muted/30">
          <div>
            <Label className="text-xs flex items-center gap-1"><Search className="h-3 w-3" /> Employee</Label>
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name…"
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Worked from</Label>
            <Input type="date" value={workedFrom} onChange={e => setWorkedFrom(e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Worked to</Label>
            <Input type="date" value={workedTo} onChange={e => setWorkedTo(e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1"><Filter className="h-3 w-3" /> Expiry</Label>
            <Select value={expiryFilter} onValueChange={(v) => setExpiryFilter(v as ExpiryFilter)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="expiring_7">Expiring in 7 days</SelectItem>
                <SelectItem value="expiring_30">Expiring in 30 days</SelectItem>
                <SelectItem value="expired">Already expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(search || workedFrom || workedTo || expiryFilter !== 'all') && (
            <div className="md:col-span-4">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => { setSearch(''); setWorkedFrom(''); setWorkedTo(''); setExpiryFilter('all'); }}
              >
                Clear filters
              </Button>
            </div>
          )}
        </div>

        {/* Sort bar */}
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <span className="mr-1">Sort by:</span>
          {([
            ['employee','Employee'],
            ['worked','Worked date'],
            ['expiry','Expiry'],
            ['submitted','Submitted'],
          ] as [SortBy,string][]).map(([col, label]) => (
            <Button
              key={col}
              size="sm"
              variant={sortBy === col ? 'secondary' : 'ghost'}
              className="h-7 gap-1 text-xs"
              onClick={() => toggleSort(col)}
            >
              {label} <SortIcon col={col} />
            </Button>
          ))}
        </div>

        {/* Bulk action bar */}
        {filtered.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border p-2 bg-background">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAllVisible} />
              Select all {filtered.length} on this page
            </label>
            <span className="text-xs text-muted-foreground ml-1">
              {selected.size} selected
            </span>
            <div className="ml-auto flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={selected.size === 0 || bulkBusy}
                onClick={() => setBulkMode('reject')}
                className="gap-1"
              >
                <X className="h-4 w-4" /> Bulk reject
              </Button>
              <Button
                size="sm"
                disabled={selected.size === 0 || bulkBusy}
                onClick={() => setBulkMode('approve')}
                className="gap-1 bg-green-600 hover:bg-green-700"
              >
                <Check className="h-4 w-4" /> Bulk approve
              </Button>
            </div>

            {bulkMode && (
              <div className="w-full mt-2 space-y-2 border-t pt-2">
                <Label className="text-xs">
                  {bulkMode === 'approve'
                    ? 'Shared approval comment (optional, applied to all selected)'
                    : 'Shared rejection reason (required, applied to all selected)'}
                </Label>
                <Textarea
                  rows={2}
                  value={sharedComment}
                  onChange={e => setSharedComment(e.target.value)}
                  placeholder={bulkMode === 'approve' ? 'Optional shared comment…' : 'Explain the rejection…'}
                  className="text-sm"
                />
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={() => { setBulkMode(null); setSharedComment(''); }}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={bulkBusy}
                    variant={bulkMode === 'reject' ? 'destructive' : 'default'}
                    className={bulkMode === 'approve' ? 'bg-green-600 hover:bg-green-700' : ''}
                    onClick={() => runBulk(bulkMode)}
                  >
                    {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                      bulkMode === 'approve' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />
                    )}
                    Confirm {bulkMode === 'approve' ? 'approve' : 'reject'} {selected.size}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="h-24 bg-muted rounded-lg animate-pulse" />
        ) : totalCount === 0 ? (
          <p className="text-sm text-muted-foreground">No pending comp-off credit requests.</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending requests match the current filters.</p>
        ) : filtered.map(r => (
          <div key={r.id} className="rounded-lg border p-3 space-y-2 bg-background">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selected.has(r.id)}
                  onCheckedChange={() => toggleOne(r.id)}
                  aria-label="Select request"
                />
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{r.employee_name || 'Employee'}</span>
                <Badge variant="secondary" className="capitalize">{r.earned_type}</Badge>
              </div>
              <span className="text-xs text-muted-foreground">
                Submitted {format(parseISO(r.created_at), 'MMM d, yyyy • h:mm a')}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Worked on <span className="text-foreground font-medium">{format(parseISO(r.earned_date), 'MMM d, yyyy')}</span>
                {r.holiday_name && <span>— {r.holiday_name}</span>}
              </span>
              <span>Expires {format(parseISO(r.expires_at), 'MMM d, yyyy')}</span>
            </div>

            <Textarea
              placeholder={
                showRejectFor === r.id
                  ? 'Reason for rejection (required)…'
                  : 'Optional approval comment…'
              }
              value={reasonById[r.id] || ''}
              onChange={(e) => setReasonById(prev => ({ ...prev, [r.id]: e.target.value }))}
              rows={2}
              className="text-sm"
            />

            <div className="flex gap-2">
              {showRejectFor === r.id ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowRejectFor(null)}
                    disabled={busyId === r.id}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleReject(r.id)}
                    disabled={busyId === r.id}
                    className="gap-1"
                  >
                    {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                    Confirm Reject
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowRejectFor(r.id)}
                    disabled={busyId === r.id}
                    className="gap-1"
                  >
                    <X className="h-4 w-4" /> Reject
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleApprove(r.id)}
                    disabled={busyId === r.id}
                    className="gap-1 bg-green-600 hover:bg-green-700"
                  >
                    {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Approve
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}

        {/* Pagination */}
        {totalCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
            <div className="text-xs text-muted-foreground">
              Showing <span className="font-medium">{(page - 1) * pageSize + 1}</span>–
              <span className="font-medium">{Math.min(page * pageSize, totalCount)}</span> of{' '}
              <span className="font-medium">{totalCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Per page</Label>
              <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
                <SelectTrigger className="h-7 w-[70px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map(n => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="h-7 gap-1"
                onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1 || loading}>
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </Button>
              <span className="text-xs text-muted-foreground">Page {page} / {totalPages}</span>
              <Button size="sm" variant="outline" className="h-7 gap-1"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading}>
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Failed notification emails */}
        <div className="mt-4 rounded-lg border">
          <div className="flex items-center justify-between p-2 border-b bg-muted/40">
            <div className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Notification email issues
              <Badge variant="outline">{failedNotifs.length}</Badge>
            </div>
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs"
              onClick={loadFailedNotifs} disabled={notifLoading}>
              <RefreshCw className={`h-3.5 w-3.5 ${notifLoading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
          {failedNotifs.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">
              No notification email failures. Retries will show up here if a send fails.
            </div>
          ) : (
            <ul className="divide-y">
              {failedNotifs.map(n => (
                <li key={n.id} className="p-2 text-xs flex flex-wrap items-center gap-2">
                  <Badge variant={n.status === 'failed' ? 'destructive' : 'secondary'} className="capitalize">
                    {n.status}
                  </Badge>
                  <Badge variant="outline" className="capitalize">{n.decision}</Badge>
                  <span className="text-muted-foreground">to</span>
                  <span className="font-medium">{n.recipient_email || '— no email on file —'}</span>
                  <span className="text-muted-foreground">
                    • {n.attempts} attempt(s) • {format(parseISO(n.updated_at), 'MMM d, HH:mm')}
                  </span>
                  {n.last_error && (
                    <span className="text-destructive truncate max-w-full basis-full pl-1">
                      {n.last_error}
                    </span>
                  )}
                  <Button
                    size="sm" variant="outline" className="ml-auto h-7 gap-1"
                    disabled={retryingLogId === n.id || !n.recipient_email}
                    onClick={() => retryEmail(n)}
                  >
                    {retryingLogId === n.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <RefreshCw className="h-3.5 w-3.5" />}
                    Retry
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}