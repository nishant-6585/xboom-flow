import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Check, X, Gift, Calendar, User, Search, Filter } from 'lucide-react';
import { differenceInCalendarDays, format, isAfter, isBefore, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { sendCompoffDecisionEmail } from '@/lib/compoffNotify';

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

export function CompOffApprovalsInbox() {
  const [rows, setRows] = useState<PendingCredit[]>([]);
  const [loading, setLoading] = useState(false);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showRejectFor, setShowRejectFor] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [workedFrom, setWorkedFrom] = useState('');
  const [workedTo, setWorkedTo] = useState('');
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>('all');

  // Bulk actions
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sharedComment, setSharedComment] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMode, setBulkMode] = useState<'approve' | 'reject' | null>(null);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('compoff_ledger')
        .select('id, employee_id, earned_date, earned_type, holiday_name, created_at, expires_at')
        .eq('approval_status', 'pending')
        .order('created_at', { ascending: true });
      if (error) throw error;
      const ids = Array.from(new Set((data || []).map(r => r.employee_id)));
      let nameById: Record<string, string> = {};
      if (ids.length) {
        const { data: emps } = await supabase
          .from('employees')
          .select('id, name')
          .in('id', ids);
        (emps || []).forEach((e: any) => { nameById[e.id] = e.name; });
      }
      setRows((data || []).map((r: any) => ({ ...r, employee_name: nameById[r.employee_id] })));
      setSelected(new Set());
    } catch (e: any) {
      toast.error(e.message || 'Failed to load pending comp-off requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPending(); }, [fetchPending]);

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

  // Derived filtered rows
  const now = new Date();
  const filtered = rows.filter(r => {
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!(r.employee_name || '').toLowerCase().includes(q)) return false;
    }
    if (workedFrom) {
      try { if (isBefore(parseISO(r.earned_date), parseISO(workedFrom))) return false; } catch {}
    }
    if (workedTo) {
      try { if (isAfter(parseISO(r.earned_date), parseISO(workedTo))) return false; } catch {}
    }
    if (expiryFilter !== 'all') {
      const days = differenceInCalendarDays(parseISO(r.expires_at), now);
      if (expiryFilter === 'expired' && days >= 0) return false;
      if (expiryFilter === 'expiring_7' && (days < 0 || days > 7)) return false;
      if (expiryFilter === 'expiring_30' && (days < 0 || days > 30)) return false;
    }
    return true;
  });

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
    if (row) void sendCompoffDecisionEmail({
      ledger_id: row.id,
      employee_id: row.employee_id,
      earned_date: row.earned_date,
      earned_type: row.earned_type,
      decision: 'approved',
      comment: reasonById[id] || null,
      actor_name: actorName,
    });
    setRows(prev => prev.filter(r => r.id !== id));
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
    if (row) void sendCompoffDecisionEmail({
      ledger_id: row.id,
      employee_id: row.employee_id,
      earned_date: row.earned_date,
      earned_type: row.earned_type,
      decision: 'rejected',
      reason,
      actor_name: actorName,
    });
    setRows(prev => prev.filter(r => r.id !== id));
    setShowRejectFor(null);
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
      targets.filter(r => okIds.has(r.id)).forEach(r => {
        void sendCompoffDecisionEmail({
          ledger_id: r.id,
          employee_id: r.employee_id,
          earned_date: r.earned_date,
          earned_type: r.earned_type,
          decision: mode === 'approve' ? 'approved' : 'rejected',
          comment: mode === 'approve' ? shared || null : null,
          reason: mode === 'reject' ? shared : null,
          actor_name: actorName,
        });
      });

      setRows(prev => prev.filter(r => !okIds.has(r.id)));
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
    } catch (e: any) {
      toast.error(e.message || 'Bulk action failed');
    } finally {
      setBulkBusy(false);
    }
  };

  if (loading) {
    return <div className="h-24 bg-muted rounded-lg animate-pulse" />;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Gift className="h-4 w-4" /> Comp-off Credit Approvals
          <Badge variant="outline" className="ml-2">{rows.length} pending</Badge>
          {filtered.length !== rows.length && (
            <Badge variant="secondary" className="ml-1">{filtered.length} match</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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

        {/* Bulk action bar */}
        {filtered.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border p-2 bg-background">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAllVisible} />
              Select all {filtered.length} visible
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

        {rows.length === 0 ? (
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
      </CardContent>
    </Card>
  );
}