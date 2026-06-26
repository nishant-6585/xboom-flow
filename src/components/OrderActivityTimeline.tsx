import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { History, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';

interface TimelineEvent {
  event_id: string;
  event_type: string;
  action: string;
  actor: string | null;
  details: string | null;
  occurred_at: string;
}

const TYPE_COLORS: Record<string, string> = {
  order: 'bg-blue-500/15 text-blue-600 dark:text-blue-300',
  field_edit: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
  item_edit: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
  phone_change: 'bg-amber-500/15 text-amber-600 dark:text-amber-300',
  attribution: 'bg-purple-500/15 text-purple-600 dark:text-purple-300',
  proforma: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300',
  invoice: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300',
  procurement: 'bg-orange-500/15 text-orange-600 dark:text-orange-300',
  woo_status: 'bg-pink-500/15 text-pink-600 dark:text-pink-300',
};

export function OrderActivityTimeline({ orderId, refreshKey }: { orderId: string; refreshKey?: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchEvents = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    const { data, error } = await (supabase as any).rpc('get_order_activity_timeline', {
      p_order_id: orderId,
    });
    if (error) {
      console.error('[OrderActivityTimeline] fetch failed', error);
      setEvents([]);
    } else {
      setEvents((data ?? []) as TimelineEvent[]);
    }
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    if (isOpen) fetchEvents();
  }, [isOpen, fetchEvents, refreshKey]);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground">
          <span className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Change History
            {events.length > 0 && (
              <Badge variant="secondary" className="ml-1">{events.length}</Badge>
            )}
          </span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 border rounded-lg bg-muted/30">
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b">
            <span className="text-[11px] text-muted-foreground">
              Every action on this order — newest first
            </span>
            <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1"
              onClick={fetchEvents} disabled={loading}>
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Loading history…</div>
          ) : events.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">No activity recorded yet</div>
          ) : (
            <ScrollArea className="h-[340px]">
              <div className="p-3 space-y-2">
                {events.map((e) => (
                  <div
                    key={e.event_id}
                    className="relative pl-3 border-l-2 border-primary/30"
                  >
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge variant="secondary" className={`text-[10px] h-5 ${TYPE_COLORS[e.event_type] ?? ''}`}>
                        {e.event_type.replace(/_/g, ' ')}
                      </Badge>
                      <span className="text-xs font-semibold text-foreground">{e.action}</span>
                      <span className="text-[11px] text-muted-foreground ml-auto">
                        {format(new Date(e.occurred_at), 'dd MMM yyyy, h:mm a')}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium text-primary">{e.actor || 'System'}</span>
                      {e.details ? <span> · {e.details}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}