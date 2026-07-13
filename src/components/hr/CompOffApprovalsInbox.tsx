import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Check, X, Gift, Calendar, User } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';

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

export function CompOffApprovalsInbox() {
  const [rows, setRows] = useState<PendingCredit[]>([]);
  const [loading, setLoading] = useState(false);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showRejectFor, setShowRejectFor] = useState<string | null>(null);

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
    } catch (e: any) {
      toast.error(e.message || 'Failed to load pending comp-off requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  const handleApprove = async (id: string) => {
    setBusyId(id);
    const { error } = await supabase.rpc('approve_compoff_credit', {
      p_ledger_id: id,
      p_comment: reasonById[id] || null,
    });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Comp-off credit approved');
    setRows(prev => prev.filter(r => r.id !== id));
  };

  const handleReject = async (id: string) => {
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
    setRows(prev => prev.filter(r => r.id !== id));
    setShowRejectFor(null);
  };

  if (loading) {
    return <div className="h-24 bg-muted rounded-lg animate-pulse" />;
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Gift className="h-4 w-4" /> Comp-off Credit Approvals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No pending comp-off credit requests.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Gift className="h-4 w-4" /> Comp-off Credit Approvals
          <Badge variant="outline" className="ml-2">{rows.length} pending</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map(r => (
          <div key={r.id} className="rounded-lg border p-3 space-y-2 bg-background">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm">
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