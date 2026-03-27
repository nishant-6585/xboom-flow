import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, X, Clock, ShieldCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

const DATA_TYPE_LABELS: Record<string, string> = {
  salary: 'Salary Data',
  bank_details: 'Bank Details',
  pan: 'PAN/Aadhaar',
  attendance: 'Attendance Records',
  leave: 'Leave Data',
  employee_personal: 'Employee Personal Info',
  payment: 'Payment Data',
  expense: 'Expense Data',
  invoice: 'Invoice Data',
  cashflow: 'Cashflow Data',
};

export function AccessRequestsPanel() {
  const { session, roles } = useAuth();
  const queryClient = useQueryClient();
  const [processing, setProcessing] = useState<string | null>(null);

  const isAdmin = roles?.includes('admin');
  const isHR = roles?.includes('hr');
  const isFinance = roles?.includes('finance');

  const { data: requests, isLoading } = useQuery({
    queryKey: ['ai-access-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_access_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!(isAdmin || isHR || isFinance),
  });

  const handleDecision = async (requestId: string, decision: 'approved' | 'rejected', durationMinutes = 10) => {
    if (!session?.user?.id) return;
    setProcessing(requestId);
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('user_id', session.user.id)
        .single();

      // Update request status
      const { error: updateErr } = await supabase
        .from('ai_access_requests')
        .update({
          status: decision,
          approved_by: session.user.id,
          approved_by_name: profile?.name || 'Admin',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (updateErr) throw updateErr;

      // If approved, create temp permission
      if (decision === 'approved') {
        const request = requests?.find(r => r.id === requestId);
        if (request) {
          const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
          const { error: permErr } = await supabase
            .from('ai_temp_permissions')
            .insert({
              user_id: request.requester_user_id,
              data_type: request.requested_data_type,
              target_entity_id: request.target_entity_id,
              granted_by: session.user.id,
              granted_by_name: profile?.name || 'Admin',
              access_request_id: requestId,
              expires_at: expiresAt,
            });
          if (permErr) throw permErr;
        }
      }

      queryClient.invalidateQueries({ queryKey: ['ai-access-requests'] });
      toast.success(decision === 'approved' 
        ? `Access granted for ${durationMinutes} minutes` 
        : 'Access request rejected');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to process request');
    } finally {
      setProcessing(null);
    }
  };

  if (!isAdmin && !isHR && !isFinance) return null;

  const pendingRequests = requests?.filter(r => r.status === 'pending') || [];
  const recentDecisions = requests?.filter(r => r.status !== 'pending').slice(0, 10) || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">AI Data Access Requests</h3>
        {pendingRequests.length > 0 && (
          <Badge variant="destructive" className="text-[10px] h-5">
            {pendingRequests.length} pending
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : pendingRequests.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">No pending access requests.</p>
      ) : (
        <ScrollArea className="max-h-[300px]">
          <div className="space-y-2">
            {pendingRequests.map(req => (
              <div
                key={req.id}
                className="p-3 rounded-lg border border-border/50 dark:border-border/30 bg-muted/30 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{req.requester_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Requesting: <span className="font-medium text-foreground/80">{DATA_TYPE_LABELS[req.requested_data_type] || req.requested_data_type}</span>
                    </p>
                    {req.reason && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{req.reason}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] border-green-500/30 text-green-600 hover:bg-green-500/10 gap-1"
                    disabled={processing === req.id}
                    onClick={() => handleDecision(req.id, 'approved', 10)}
                  >
                    {processing === req.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Check className="w-2.5 h-2.5" />}
                    10 min
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] border-green-500/30 text-green-600 hover:bg-green-500/10 gap-1"
                    disabled={processing === req.id}
                    onClick={() => handleDecision(req.id, 'approved', 30)}
                  >
                    30 min
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] border-destructive/30 text-destructive hover:bg-destructive/10 gap-1"
                    disabled={processing === req.id}
                    onClick={() => handleDecision(req.id, 'rejected')}
                  >
                    <X className="w-2.5 h-2.5" />
                    Deny
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {recentDecisions.length > 0 && (
        <div className="pt-2 border-t border-border/30">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Recent Decisions</p>
          <div className="space-y-1">
            {recentDecisions.slice(0, 5).map(req => (
              <div key={req.id} className="flex items-center justify-between text-[10px] py-1">
                <span className="text-muted-foreground truncate">{req.requester_name} → {DATA_TYPE_LABELS[req.requested_data_type] || req.requested_data_type}</span>
                <Badge
                  variant={req.status === 'approved' ? 'confirmed' : 'rejected'}
                  className="text-[9px] h-4"
                >
                  {req.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
