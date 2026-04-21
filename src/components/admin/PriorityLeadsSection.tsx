import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Phone, MessageSquare, Flame, Sparkles } from 'lucide-react';

export interface PriorityLead {
  callLogId: string;
  name: string;
  phone: string;
  intent: string | null;
  budget: string | null;
  requirement: string | null;
  callTime: string | null;
}

interface Props {
  leads: PriorityLead[];
  onCall: (phone: string) => void;
  onWhatsApp: (phone: string) => void;
  onOpen: (callLogId: string) => void;
}

export function PriorityLeadsSection({ leads, onCall, onWhatsApp, onOpen }: Props) {
  if (leads.length === 0) return null;
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Flame className="h-4 w-4 text-destructive" />
        <h3 className="text-sm font-bold text-foreground">Priority Leads Right Now</h3>
        <span className="text-[11px] text-muted-foreground">Top {leads.length} from AI-enriched calls</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {leads.map((l) => (
          <Card
            key={l.callLogId}
            className="border-l-4 border-l-destructive bg-gradient-to-br from-destructive/5 via-card to-card p-3 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => onOpen(l.callLogId)}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-primary" />
                <span className="text-[10px] font-bold text-destructive">🔥 HOT</span>
              </div>
              {l.callTime && <span className="text-[10px] text-muted-foreground">{l.callTime}</span>}
            </div>
            <div className="font-semibold text-sm truncate">{l.name}</div>
            <div className="font-mono text-xs text-primary mb-1.5">{l.phone}</div>
            <div className="flex flex-wrap gap-1 text-[10px] mb-2">
              {l.requirement && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-foreground">🎯 {l.requirement}</span>
              )}
              {l.budget && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-foreground">💰 {l.budget}</span>
              )}
              {l.intent && (
                <span className="rounded bg-warning/15 text-warning px-1.5 py-0.5 font-medium">⚡ {l.intent}</span>
              )}
            </div>
            <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                className="h-7 flex-1 text-xs"
                onClick={() => onCall(l.phone)}
              >
                <Phone className="h-3 w-3 mr-1" />
                Call Now
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onWhatsApp(l.phone)}
              >
                <MessageSquare className="h-3 w-3 text-emerald-600" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
