import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Heart, AlertTriangle, ShieldAlert, Activity } from 'lucide-react';

interface Props {
  score?: number | null;
  band?: 'healthy' | 'watch' | 'at_risk' | 'critical' | null;
  showScore?: boolean;
}

const STYLES: Record<string, { bg: string; label: string; icon: any }> = {
  healthy: { bg: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30', label: 'Healthy', icon: Heart },
  watch: { bg: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30', label: 'Watch', icon: Activity },
  at_risk: { bg: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30', label: 'At Risk', icon: AlertTriangle },
  critical: { bg: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30', label: 'Critical', icon: ShieldAlert },
};

export function CompanyHealthBadge({ score, band, showScore = true }: Props) {
  const b = band || 'watch';
  const s = STYLES[b];
  const Icon = s.icon;
  return (
    <Badge className={cn('border gap-1 text-[10px]', s.bg)}>
      <Icon className="h-2.5 w-2.5" />
      {s.label}
      {showScore && score != null && <span className="opacity-70">· {score}</span>}
    </Badge>
  );
}