import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronDown } from 'lucide-react';
import { STATUS_META, type CallLeadStatusRow, type LeadStatus } from '@/hooks/useCallLeadStatus';

interface Props {
  status?: CallLeadStatusRow;
  onChange: (status: LeadStatus) => void;
  size?: 'sm' | 'xs';
}

export function LeadStatusBadge({ status }: { status?: CallLeadStatusRow }) {
  const current: LeadStatus = status?.status ?? 'new';
  const meta = STATUS_META[current];
  return (
    <Badge variant="outline" className={`${meta.className} text-[10px] h-5 px-1.5 font-semibold`}>
      <span className="mr-0.5">{meta.emoji}</span>
      {meta.label}
    </Badge>
  );
}

export function LeadStatusControls({ status, onChange, size = 'sm' }: Props) {
  const current: LeadStatus = status?.status ?? 'new';
  const meta = STATUS_META[current];

  return (
    <TooltipProvider>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size={size === 'xs' ? 'sm' : 'sm'}
            className={`${meta.className} h-7 px-2 text-[11px] font-semibold gap-1`}
          >
            <span>{meta.emoji}</span>
            <span>{meta.label}</span>
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {(['new', 'contacted', 'qualified', 'closed', 'lost'] as LeadStatus[]).map((s) => {
            const m = STATUS_META[s];
            return (
              <DropdownMenuItem key={s} onClick={() => onChange(s)} className="gap-2">
                <span>{m.emoji}</span>
                <span>Mark {m.label}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
}

export function LeadTimeline({ status }: { status?: CallLeadStatusRow }) {
  const stages: { key: LeadStatus; ts?: string | null }[] = [
    { key: 'new', ts: status?.created_at },
    { key: 'contacted', ts: status?.contacted_at },
    { key: 'qualified', ts: status?.qualified_at },
    { key: 'closed', ts: status?.closed_at ?? status?.lost_at },
  ];
  const order: LeadStatus[] = ['new', 'contacted', 'qualified', 'closed'];
  const currentIdx = Math.max(
    0,
    order.indexOf((status?.status === 'lost' ? 'closed' : status?.status) ?? 'new'),
  );
  return (
    <div className="flex items-center gap-1 text-[11px]">
      {stages.map((stage, i) => {
        const meta = STATUS_META[stage.key];
        const isReached = i <= currentIdx;
        return (
          <div key={stage.key} className="flex items-center gap-1">
            <div
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 border ${
                isReached ? meta.className : 'bg-muted/40 text-muted-foreground border-muted-foreground/20'
              }`}
              title={stage.ts ? new Date(stage.ts).toLocaleString() : 'Pending'}
            >
              <span>{meta.emoji}</span>
              <span className="font-semibold">{meta.label}</span>
            </div>
            {i < stages.length - 1 && <span className="text-muted-foreground">→</span>}
          </div>
        );
      })}
    </div>
  );
}
