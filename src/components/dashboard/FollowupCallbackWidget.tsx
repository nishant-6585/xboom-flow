import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useFollowups, Followup } from '@/hooks/useFollowups';
import { useCallbacks, MissedCallback } from '@/hooks/useCallbacks';
import { useAuth } from '@/hooks/useAuth';
import { Link } from 'react-router-dom';
import { format, isToday, isBefore } from 'date-fns';
import { CalendarCheck, PhoneOff, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CallButton } from '@/components/calls/CallButton';

export function FollowupCallbackWidget() {
  const { followups, loading: followupsLoading } = useFollowups();
  const { callbacks, loading: callbacksLoading } = useCallbacks();
  const { user } = useAuth();

  const now = new Date();

  // My follow-ups
  const myFollowups = followups.filter(f =>
    f.status === 'pending' && (f.user_id === user?.id || f.created_by === user?.id)
  );
  const todayFollowups = myFollowups.filter(f => isToday(new Date(f.followup_at)));
  const overdueFollowups = myFollowups.filter(f => isBefore(new Date(f.followup_at), now) && !isToday(new Date(f.followup_at)));
  const aCategoryFollowups = myFollowups.filter(f => f.is_a_category);

  // My callbacks
  const myCallbacks = callbacks.filter(c => c.status === 'pending' && c.assigned_to === user?.id);
  const todayCallbacks = myCallbacks.filter(c => isToday(new Date(c.call_time)));
  const highPriorityCallbacks = myCallbacks.filter(c => c.priority === 'high');

  const loading = followupsLoading || callbacksLoading;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-5 bg-muted rounded w-1/3" />
            <div className="h-16 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalPending = myFollowups.length + myCallbacks.length;
  if (totalPending === 0) return null;

  const highPriority = aCategoryFollowups.length + highPriorityCallbacks.length;
  const metrics: { label: string; value: number; tone?: string }[] = [
    { label: 'Overdue', value: overdueFollowups.length, tone: 'text-destructive' },
    { label: 'today', value: todayFollowups.length },
    { label: 'pending callbacks', value: myCallbacks.length },
    { label: 'high priority', value: highPriority, tone: 'text-warning' },
  ];
  const primary = metrics.reduce((a, b) => (b.value > a.value ? b : a), metrics[0]);
  const rest = metrics.filter((m) => m !== primary);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-muted-foreground" />
            Follow-ups & Callbacks
          </CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/sales?tab=followups">
              View All <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary line */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span
            className={cn(
              'text-[28px] font-semibold tabular-nums leading-none',
              primary.value > 0 && primary.tone ? primary.tone : 'text-foreground'
            )}
          >
            {primary.value}
          </span>
          <span className="text-sm text-foreground">{primary.label}</span>
          <span className="text-xs text-muted-foreground">
            {rest.map((m, i) => (
              <span key={m.label}>
                {i > 0 && <span className="mx-1">·</span>}
                <span className={cn('tabular-nums', m.value > 0 && m.tone ? m.tone : 'text-muted-foreground')}>
                  {m.value}
                </span>{' '}
                {m.label}
              </span>
            ))}
          </span>
        </div>

        {/* Top items */}
        <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
          {/* A-category followups first */}
          {aCategoryFollowups.slice(0, 2).map(f => (
            <div key={f.id} className="flex items-center gap-2 p-2 rounded-lg bg-red-500/5 border border-red-500/20 text-sm">
              <span className="bg-red-500/20 text-red-600 dark:text-red-400 text-[9px] font-bold px-1.5 rounded">A</span>
              <div className="flex-1 min-w-0">
                <span className="font-medium truncate block">{f.customer_name}</span>
                <span className="text-[10px] text-muted-foreground">{f.product_name}</span>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">{format(new Date(f.followup_at), 'HH:mm')}</span>
            </div>
          ))}

          {/* Today's followups */}
          {todayFollowups.filter(f => !f.is_a_category).slice(0, 3).map(f => (
            <div key={f.id} className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-sm">
              <CalendarCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="font-medium truncate block">{f.customer_name}</span>
                <span className="text-[10px] text-muted-foreground">{f.product_name}</span>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">{format(new Date(f.followup_at), 'HH:mm')}</span>
            </div>
          ))}

          {/* Callbacks */}
          {myCallbacks.slice(0, 3).map(cb => (
            <div key={cb.id} className={cn(
              "flex items-center gap-2 p-2 rounded-lg text-sm border",
              cb.priority === 'high'
                ? "bg-red-500/5 border-red-500/20"
                : "bg-muted/50 border-border/50"
            )}>
              <PhoneOff className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="font-medium truncate block">{cb.customer_name || cb.caller_number}</span>
                <span className="text-[10px] text-muted-foreground">Missed call · Call back</span>
              </div>
              <CallButton
                phoneNumber={cb.caller_number}
                entityType="lead"
                entityId={cb.id}
                iconOnly
                variant="ghost"
                className="h-7 w-7 shrink-0"
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
