import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, X, Clock, Loader2, CheckCircle2, XCircle, AlertTriangle, RotateCcw, ListChecks } from 'lucide-react';
import { AIActionQueueItem } from '@/hooks/useAIAutomation';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';

interface Props {
  queue: AIActionQueueItem[];
  onApprove: (id: string, userName: string, userId: string) => void;
  onReject: (id: string) => void;
}

const STATUS_CONFIG: Record<string, { icon: typeof Clock; color: string; label: string }> = {
  pending: { icon: Clock, color: 'text-amber-500', label: 'Pending Approval' },
  approved: { icon: CheckCircle2, color: 'text-blue-500', label: 'Approved' },
  executing: { icon: Loader2, color: 'text-blue-500', label: 'Executing' },
  executed: { icon: CheckCircle2, color: 'text-green-500', label: 'Executed' },
  failed: { icon: XCircle, color: 'text-destructive', label: 'Failed' },
  rejected: { icon: XCircle, color: 'text-muted-foreground', label: 'Rejected' },
  cancelled: { icon: X, color: 'text-muted-foreground', label: 'Cancelled' },
};

const RISK_BADGE: Record<string, string> = {
  low: 'bg-green-500/10 text-green-600 border-green-500/20',
  medium: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  high: 'bg-destructive/10 text-destructive border-destructive/20',
};

export function ActionQueuePanel({ queue, onApprove, onReject }: Props) {
  const { user, profile } = useAuth();
  const pendingCount = queue.filter(q => q.status === 'pending').length;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-primary" />
          Action Queue
          {pendingCount > 0 && (
            <Badge className="bg-amber-500 text-white">{pendingCount} pending</Badge>
          )}
        </h3>
        <p className="text-sm text-muted-foreground">Review, approve, and track automated actions</p>
      </div>

      {queue.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center text-muted-foreground">
            <ListChecks className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No actions in queue. Automated actions will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[500px]">
          <div className="space-y-2 pr-4">
            {queue.map(item => {
              const config = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
              const StatusIcon = config.icon;
              const isPending = item.status === 'pending' && item.requires_approval;

              return (
                <Card key={item.id} className={isPending ? 'border-amber-500/30 bg-amber-500/5' : ''}>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        <StatusIcon className={`w-4 h-4 mt-0.5 shrink-0 ${config.color} ${item.status === 'executing' ? 'animate-spin' : ''}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-sm">{item.action_type.replace(/_/g, ' ')}</p>
                            <Badge variant="outline" className={`text-[10px] h-4 ${RISK_BADGE[item.risk_level]}`}>
                              {item.risk_level}
                            </Badge>
                            <Badge variant="outline" className={`text-[10px] h-4 ${config.color}`}>
                              {config.label}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            By {item.user_name} • {item.triggered_by} • {format(new Date(item.created_at), 'dd MMM, HH:mm')}
                          </p>
                          {item.error_message && (
                            <div className="flex items-center gap-1 mt-1 text-xs text-destructive">
                              <AlertTriangle className="w-3 h-3" /> {item.error_message}
                            </div>
                          )}
                          {item.result && (item.result as any).message && (
                            <p className="text-xs text-green-600 mt-1">✓ {(item.result as any).message}</p>
                          )}
                          {item.approved_by_name && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              Approved by {item.approved_by_name} on {format(new Date(item.approved_at!), 'dd MMM, HH:mm')}
                            </p>
                          )}
                        </div>
                      </div>
                      {isPending && (
                        <div className="flex gap-1 shrink-0">
                          <Button size="sm" className="h-7 text-xs" onClick={() => onApprove(item.id, profile?.name || 'Admin', user?.id || '')}>
                            <Check className="w-3 h-3 mr-1" /> Approve
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={() => onReject(item.id)}>
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                      {item.status === 'failed' && item.retry_count < (item as any).max_retries && (
                        <Button size="sm" variant="outline" className="h-7 text-xs">
                          <RotateCcw className="w-3 h-3 mr-1" /> Retry
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
