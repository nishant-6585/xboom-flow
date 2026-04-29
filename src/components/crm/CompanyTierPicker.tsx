import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { CompanyTierBadge } from './CompanyTierBadge';
import { cn } from '@/lib/utils';

type Tier = 'A' | 'B' | 'C';

interface Props {
  tier?: Tier | null;
  source?: 'auto' | 'manual' | null;
  onChange: (tier: Tier | null) => void;
  disabled?: boolean;
}

const TIER_LABEL: Record<Tier, string> = {
  A: 'A — Strategic',
  B: 'B — Important',
  C: 'C — Standard',
};

export function CompanyTierPicker({ tier, source, onChange, disabled }: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn('inline-flex items-center hover:opacity-80 transition-opacity', disabled && 'cursor-not-allowed opacity-60')}
          title="Click to set tier"
        >
          <CompanyTierBadge tier={tier ?? null} source={source ?? null} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-44 p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 pb-1">Set Tier</div>
        <div className="grid grid-cols-3 gap-1 mb-2">
          {(['A', 'B', 'C'] as Tier[]).map(t => (
            <Button
              key={t}
              size="sm"
              variant={tier === t ? 'default' : 'outline'}
              className="h-7 text-xs font-bold"
              onClick={(e) => { e.stopPropagation(); onChange(t); }}
              title={TIER_LABEL[t]}
            >
              {t}
            </Button>
          ))}
        </div>
        {tier && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-full text-[11px] text-muted-foreground"
            onClick={(e) => { e.stopPropagation(); onChange(null); }}
          >
            Clear tier
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}