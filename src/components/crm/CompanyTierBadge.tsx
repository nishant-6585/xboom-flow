import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Lock } from 'lucide-react';

interface Props {
  tier?: 'A' | 'B' | 'C' | null;
  source?: 'auto' | 'manual' | null;
  size?: 'sm' | 'md';
}

const COLORS: Record<string, string> = {
  A: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  B: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  C: 'bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30',
};

export function CompanyTierBadge({ tier, source, size = 'sm' }: Props) {
  if (!tier) {
    return <Badge variant="outline" className="text-[10px]">—</Badge>;
  }
  return (
    <Badge className={cn('border font-bold gap-1', COLORS[tier], size === 'md' ? 'text-sm px-2.5 py-0.5' : 'text-xs')}>
      {tier}
      {source === 'manual' && <Lock className="h-2.5 w-2.5" />}
    </Badge>
  );
}