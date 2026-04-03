import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Brain, AlertTriangle, TrendingDown, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CreditCard } from '@/hooks/useCreditCards';

interface Props {
  cards: CreditCard[];
  getCardMetrics: (id: string) => any;
  summaryMetrics: { totalOutstanding: number; totalInterest: number; riskyCards: number; avgUtilization: number };
}

export function CCInsights({ cards, getCardMetrics, summaryMetrics }: Props) {
  const insights: { icon: any; text: string; severity: 'critical' | 'warning' | 'info' }[] = [];

  // High utilization cards
  const highUtilCards = cards.filter(c => {
    const m = getCardMetrics(c.id);
    return m && m.utilization >= 90;
  });
  if (highUtilCards.length > 0) {
    insights.push({
      icon: AlertTriangle,
      text: `${highUtilCards.length} card${highUtilCards.length > 1 ? 's are' : ' is'} over 90% utilized — immediate action required`,
      severity: 'critical',
    });
  }

  // Interest leakage
  const partialCards = cards.filter(c => {
    const m = getCardMetrics(c.id);
    return m && m.paymentStatus === 'PARTIAL';
  });
  if (partialCards.length > 0) {
    insights.push({
      icon: TrendingDown,
      text: `Interest leakage risk: ${partialCards.length} card${partialCards.length > 1 ? 's have' : ' has'} partial payments`,
      severity: 'warning',
    });
  }

  // Upcoming dues
  const upcomingDue = cards.reduce((total, c) => {
    const m = getCardMetrics(c.id);
    if (m?.daysUntilDue !== null && m.daysUntilDue >= 0 && m.daysUntilDue <= 3 && m.paymentStatus !== 'FULL') {
      return total + (m.latestStatement?.total_due || 0);
    }
    return total;
  }, 0);
  if (upcomingDue > 0) {
    insights.push({
      icon: Clock,
      text: `Total ₹${upcomingDue.toLocaleString('en-IN')} due in the next 3 days`,
      severity: 'warning',
    });
  }

  if (summaryMetrics.totalInterest > 0) {
    insights.push({
      icon: TrendingDown,
      text: `₹${summaryMetrics.totalInterest.toLocaleString('en-IN')} total interest charged — review payment strategy`,
      severity: 'info',
    });
  }

  if (insights.length === 0) return null;

  const sevStyles = {
    critical: 'bg-destructive/5 border-destructive/20 text-destructive',
    warning: 'bg-yellow-500/5 border-yellow-500/20 text-yellow-700 dark:text-yellow-500',
    info: 'bg-blue-500/5 border-blue-500/20 text-blue-700 dark:text-blue-400',
  };

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          Finance Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-4 space-y-2">
        {insights.map((ins, i) => {
          const Icon = ins.icon;
          return (
            <div key={i} className={cn('flex items-start gap-3 px-3 py-2.5 rounded-lg border text-sm', sevStyles[ins.severity])}>
              <Icon className="h-4 w-4 mt-0.5 shrink-0" />
              <p className="text-xs font-medium">{ins.text}</p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
