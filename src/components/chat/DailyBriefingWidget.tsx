import { AlertTriangle, TrendingUp, Clock, Package } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DailyBriefingWidgetProps {
  onPrompt: (prompt: string) => void;
}

const BRIEFING_ITEMS = [
  { icon: AlertTriangle, label: 'Overdue payments', prompt: 'Show me all overdue payments with customer details and amounts', color: 'text-destructive' },
  { icon: TrendingUp, label: 'Hot leads needing follow-up', prompt: 'Show hot leads that need follow-up today', color: 'text-orange-500' },
  { icon: Clock, label: 'Pending approvals', prompt: 'What tasks and approvals are pending?', color: 'text-amber-500' },
  { icon: Package, label: 'Low stock alerts', prompt: 'Show me low stock inventory items', color: 'text-primary' },
];

export function DailyBriefingWidget({ onPrompt }: DailyBriefingWidgetProps) {
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1 rounded-md bg-primary/15">
          <TrendingUp className="w-3.5 h-3.5 text-primary" />
        </div>
        <span className="text-xs font-semibold text-foreground">Daily Briefing</span>
      </div>
      <div className="space-y-1">
        {BRIEFING_ITEMS.map(({ icon: Icon, label, prompt, color }) => (
          <button
            key={label}
            onClick={() => onPrompt(prompt)}
            className={cn(
              "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left",
              "hover:bg-background/60 transition-colors group"
            )}
          >
            <Icon className={cn("w-3.5 h-3.5 shrink-0", color)} />
            <span className="text-[11px] text-foreground/80 group-hover:text-foreground">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
