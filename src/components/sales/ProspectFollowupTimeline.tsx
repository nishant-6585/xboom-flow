import { format } from 'date-fns';
import { Loader2, Clock, CheckCircle2, Ban, Phone, MessageCircle, Mail, Users, MapPin, Monitor, Circle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  useProspectFollowupTimeline,
  modeLabel,
  outcomeLabel,
  ordinal,
} from '@/hooks/useProspectFollowupTracker';

const MODE_ICON: Record<string, typeof Phone> = {
  call: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  meeting: Users,
  site_visit: MapPin,
  demo: Monitor,
  other: Circle,
};

interface Props {
  prospectId: string;
  onLogFollowup: (completeId?: string | null) => void;
}

export function ProspectFollowupTimeline({ prospectId, onLogFollowup }: Props) {
  const { followups, loading } = useProspectFollowupTimeline(prospectId);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading follow-up history…
      </div>
    );
  }

  return (
    <div className="space-y-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Follow-up sequence
        </span>
        <Button size="sm" className="h-7 rounded-lg" onClick={() => onLogFollowup(null)}>
          + Log follow-up
        </Button>
      </div>

      {followups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No follow-ups recorded yet — log the 1st one.</p>
      ) : (
        <ol className="relative space-y-3 border-l pl-5">
          {followups.map((f, i) => {
            const Icon = MODE_ICON[f.mode || 'other'] || Circle;
            const done = f.status === 'completed';
            const cancelled = f.status === 'cancelled';
            return (
              <li key={f.id} className="relative">
                <span className="absolute -left-[27px] top-1 flex h-4 w-4 items-center justify-center rounded-full bg-background border">
                  {done ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                  ) : cancelled ? (
                    <Ban className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-amber-500" />
                  )}
                </span>
                <div className="rounded-lg border bg-background p-2.5">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-[10px]">{ordinal(f.sequence_no || i + 1)}</Badge>
                    <span className="text-xs font-medium">
                      {format(new Date(f.followup_at), 'dd MMM yyyy, hh:mm a')}
                    </span>
                    {f.mode && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Icon className="h-3 w-3" /> {modeLabel(f.mode)}
                      </span>
                    )}
                    {f.outcome && (
                      <Badge variant="secondary" className="text-[10px]">{outcomeLabel(f.outcome)}</Badge>
                    )}
                    {!done && !cancelled && (
                      <Badge className="text-[10px] bg-amber-500/15 text-amber-600 hover:bg-amber-500/15">Pending</Badge>
                    )}
                  </div>
                  {f.remark ? (
                    <p className="text-sm whitespace-pre-wrap">{f.remark}</p>
                  ) : (
                    <p className="text-sm italic text-muted-foreground">No note added</p>
                  )}
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {done
                        ? `by ${f.completed_by_name || f.created_by_name}`
                        : `scheduled by ${f.created_by_name}`}
                    </span>
                    {!done && !cancelled && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[11px] rounded-lg"
                        onClick={() => onLogFollowup(f.id)}
                      >
                        Mark done
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
