import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { CalendarCheck, Clock, CheckCircle2, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface FollowupHistoryProps {
  sourceType: 'pipeline' | 'prospect';
  sourceId: string;
}

interface FollowupRow {
  id: string;
  status: string;
  followup_at: string;
  remark: string | null;
  completed_at: string | null;
  completed_by_name: string | null;
  created_by_name: string | null;
  created_at: string;
}

export function FollowupHistory({ sourceType, sourceId }: FollowupHistoryProps) {
  const [loading, setLoading] = useState(true);
  const [followups, setFollowups] = useState<FollowupRow[]>([]);

  useEffect(() => {
    if (!sourceId) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('followups')
        .select('id,status,followup_at,remark,completed_at,completed_by_name,created_by_name,created_at')
        .eq('source_type', sourceType)
        .eq('source_id', sourceId)
        .order('followup_at', { ascending: false });
      if (!mounted) return;
      if (!error && data) setFollowups(data as FollowupRow[]);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [sourceType, sourceId]);

  const completed = followups.filter(f => f.status === 'completed');
  const upcoming = followups
    .filter(f => f.status === 'pending')
    .sort((a, b) => a.followup_at.localeCompare(b.followup_at));
  const nextFollowup = upcoming[0];

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading follow-ups…
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <CalendarCheck className="h-4 w-4 text-primary" />
          Follow-up History
        </div>
        <Badge variant="outline" className="text-xs">
          {completed.length} done · {upcoming.length} upcoming
        </Badge>
      </div>

      {/* Next scheduled */}
      <div className="rounded-md border bg-background p-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1">
          <Clock className="h-3.5 w-3.5" /> Next scheduled
        </div>
        {nextFollowup ? (
          <div className="text-sm">
            <span className="font-medium">{format(new Date(nextFollowup.followup_at), 'dd MMM yyyy, hh:mm a')}</span>
            {nextFollowup.created_by_name && (
              <span className="text-muted-foreground"> · by {nextFollowup.created_by_name}</span>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No upcoming follow-up scheduled</div>
        )}
      </div>

      <Separator />

      {/* Completed list */}
      <div>
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> Completed follow-ups
        </div>
        {completed.length === 0 ? (
          <div className="text-sm text-muted-foreground py-2">No follow-ups completed yet.</div>
        ) : (
          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {completed
              .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''))
              .map(f => (
                <div key={f.id} className="rounded-md border bg-background p-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-medium">
                      {f.completed_at ? format(new Date(f.completed_at), 'dd MMM yyyy, hh:mm a') : '—'}
                    </span>
                    {f.completed_by_name && (
                      <span className="text-xs text-muted-foreground">by {f.completed_by_name}</span>
                    )}
                  </div>
                  {f.remark ? (
                    <p className="text-sm whitespace-pre-wrap">{f.remark}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No note added</p>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
