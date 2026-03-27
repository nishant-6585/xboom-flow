import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { History, CheckCircle2, XCircle, Zap } from 'lucide-react';
import { format } from 'date-fns';

interface ActionLog {
  id: string;
  user_id: string;
  action_type: string;
  payload: Record<string, unknown>;
  status: string;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
}

export function ActionHistoryPanel() {
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const fetchLogs = async () => {
      let query = supabase.from('ai_action_logs').select('*').order('created_at', { ascending: false }).limit(200);
      if (filter !== 'all') query = query.eq('status', filter);
      const { data } = await query;
      if (data) setLogs(data as unknown as ActionLog[]);
    };
    fetchLogs();
  }, [filter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <History className="w-5 h-5 text-primary" /> Action History
          </h3>
          <p className="text-sm text-muted-foreground">Full audit trail of all AI-executed actions</p>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="executed">Executed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="denied">Denied</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ScrollArea className="h-[500px]">
        <div className="space-y-1.5 pr-4">
          {logs.map(log => (
            <Card key={log.id}>
              <CardContent className="p-3 flex items-center gap-3">
                {log.status === 'executed' ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                ) : log.status === 'failed' ? (
                  <XCircle className="w-4 h-4 text-destructive shrink-0" />
                ) : (
                  <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{log.action_type.replace(/_/g, ' ')}</p>
                    <Badge variant={log.status === 'executed' ? 'default' : 'destructive'} className="text-[10px] h-4">
                      {log.status}
                    </Badge>
                  </div>
                  {log.error_message && <p className="text-xs text-destructive">{log.error_message}</p>}
                  {log.result && (log.result as any).message && (
                    <p className="text-xs text-muted-foreground">{(log.result as any).message}</p>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {format(new Date(log.created_at), 'dd MMM HH:mm')}
                </span>
              </CardContent>
            </Card>
          ))}
          {logs.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="p-6 text-center text-muted-foreground">
                <p className="text-sm">No action history yet.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
