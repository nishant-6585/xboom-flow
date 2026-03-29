import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFollowups, Followup } from '@/hooks/useFollowups';
import { useCallbacks, MissedCallback } from '@/hooks/useCallbacks';
import { useAuth } from '@/hooks/useAuth';
import { Link } from 'react-router-dom';
import { format, isToday, isBefore } from 'date-fns';
import { CalendarCheck, Phone, PhoneOff, ArrowRight, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

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

  return (
    <Card className="border-amber-500/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            Follow-ups & Callbacks
            {totalPending > 0 && (
              <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-400 border-0">{totalPending}</Badge>
            )}
          </CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/sales?tab=followups">
              View All <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="bg-amber-500/10 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{todayFollowups.length}</div>
            <div className="text-[10px] text-muted-foreground">Follow-ups Today</div>
          </div>
          <div className="bg-red-500/10 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-red-600 dark:text-red-400">{overdueFollowups.length}</div>
            <div className="text-[10px] text-muted-foreground">Overdue</div>
          </div>
          <div className="bg-red-500/10 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-red-600 dark:text-red-400">{myCallbacks.length}</div>
            <div className="text-[10px] text-muted-foreground">Pending Callbacks</div>
          </div>
          <div className="bg-red-500/10 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-red-600 dark:text-red-400">{aCategoryFollowups.length + highPriorityCallbacks.length}</div>
            <div className="text-[10px] text-muted-foreground">High Priority</div>
          </div>
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
              <a href={`tel:${cb.caller_number}`} className="text-primary text-xs hover:underline shrink-0">
                <Phone className="w-3.5 h-3.5" />
              </a>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
