import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatementUpload, CreditCard } from '@/hooks/useCreditCards';
import { CheckCircle2, XCircle, Loader2, Clock, History, AlertTriangle } from 'lucide-react';

interface Props {
  uploads: StatementUpload[];
  cards: CreditCard[];
  onRetry?: (upload: StatementUpload) => void;
}

// Uploads older than 5 minutes in PROCESSING are stale
const STALE_MS = 5 * 60 * 1000;

export function CCUploadHistory({ uploads, cards, onRetry }: Props) {
  if (uploads.length === 0) return null;

  const isStale = (u: StatementUpload) =>
    u.status === 'PROCESSING' && Date.now() - new Date(u.created_at).getTime() > STALE_MS;

  const getStatus = (u: StatementUpload) => {
    if (isStale(u)) return 'TIMED_OUT';
    return u.status;
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'SUCCESS': return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
      case 'FAILED': return <XCircle className="h-3.5 w-3.5 text-red-500" />;
      case 'TIMED_OUT': return <AlertTriangle className="h-3.5 w-3.5 text-red-500" />;
      case 'PROCESSING': return <Loader2 className="h-3.5 w-3.5 text-yellow-500 animate-spin" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'SUCCESS': return <Badge className="bg-green-500/10 text-green-600 border-green-500/30 text-[10px]">Success</Badge>;
      case 'FAILED': return <Badge className="bg-red-500/10 text-red-600 border-red-500/30 text-[10px]">Failed</Badge>;
      case 'TIMED_OUT': return <Badge className="bg-red-500/10 text-red-600 border-red-500/30 text-[10px]">Timed Out</Badge>;
      default: return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30 text-[10px]">Processing</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <History className="h-4 w-4" /> Recent Uploads
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {uploads.map(u => {
          const card = cards.find(c => c.id === u.card_id);
          const status = getStatus(u);
          return (
            <div key={u.id} className="flex items-center justify-between text-xs bg-muted/30 rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                {statusIcon(status)}
                <span className="truncate font-medium">{u.file_name}</span>
                {u.detected_bank && <span className="text-muted-foreground shrink-0">• {u.detected_bank}</span>}
                {card && <span className="text-muted-foreground shrink-0">→ {card.card_name}</span>}
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {u.error_message && (status === 'FAILED' || status === 'TIMED_OUT') && (
                  <span className="text-red-500 max-w-[200px] truncate" title={u.error_message}>
                    {u.error_message}
                  </span>
                )}
                {u.confidence_score != null && status === 'SUCCESS' && (
                  <span className="text-muted-foreground">{u.confidence_score}%</span>
                )}
                {statusBadge(status)}
                <span className="text-muted-foreground">
                  {new Date(u.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
