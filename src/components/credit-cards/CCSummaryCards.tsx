import { Card, CardContent } from '@/components/ui/card';
import { IndianRupee, TrendingUp, AlertTriangle, Percent, CreditCard, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  totalOutstanding: number;
  totalCreditLimit: number;
  avgUtilization: number;
  totalInterest: number;
  riskyCards: number;
}

const utilizationColor = (v: number) => {
  if (v > 80) return 'text-destructive';
  if (v > 50) return 'text-yellow-500';
  return 'text-emerald-500';
};

const utilizationBg = (v: number) => {
  if (v > 80) return 'bg-destructive/10';
  if (v > 50) return 'bg-yellow-500/10';
  return 'bg-emerald-500/10';
};

export function CCSummaryCards({ totalOutstanding, totalCreditLimit, avgUtilization, totalInterest, riskyCards }: Props) {
  const items = [
    {
      label: 'Total Outstanding',
      subtext: 'Across all active cards',
      value: `₹${totalOutstanding.toLocaleString('en-IN')}`,
      icon: IndianRupee,
      iconBg: 'bg-primary/10',
      iconColor: 'text-primary',
      valueColor: totalOutstanding > 0 ? 'text-foreground' : 'text-muted-foreground',
    },
    {
      label: 'Total Credit Limit',
      subtext: 'Combined card limits',
      value: `₹${totalCreditLimit.toLocaleString('en-IN')}`,
      icon: CreditCard,
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-500',
      valueColor: 'text-foreground',
    },
    {
      label: 'Avg Utilization',
      subtext: avgUtilization > 80 ? '⚠️ High risk zone' : avgUtilization > 50 ? 'Monitor closely' : 'Healthy range',
      value: `${avgUtilization}%`,
      icon: Percent,
      iconBg: utilizationBg(avgUtilization),
      iconColor: utilizationColor(avgUtilization),
      valueColor: utilizationColor(avgUtilization),
    },
    {
      label: 'Interest Charged',
      subtext: totalInterest > 0 ? 'Potential leakage detected' : 'No interest leakage',
      value: `₹${totalInterest.toLocaleString('en-IN')}`,
      icon: TrendingUp,
      iconBg: totalInterest > 0 ? 'bg-destructive/10' : 'bg-emerald-500/10',
      iconColor: totalInterest > 0 ? 'text-destructive' : 'text-emerald-500',
      valueColor: totalInterest > 0 ? 'text-destructive' : 'text-muted-foreground',
    },
    {
      label: 'Risky Cards',
      subtext: riskyCards > 0 ? 'Requires immediate review' : 'All cards healthy',
      value: riskyCards.toString(),
      icon: AlertTriangle,
      iconBg: riskyCards > 0 ? 'bg-destructive/10' : 'bg-emerald-500/10',
      iconColor: riskyCards > 0 ? 'text-destructive' : 'text-emerald-500',
      valueColor: riskyCards > 0 ? 'text-destructive font-bold' : 'text-emerald-500',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {items.map(item => (
        <Card key={item.label} className="border border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-start justify-between mb-3">
              <div className={cn('p-2 rounded-lg', item.iconBg)}>
                <item.icon className={cn('h-4 w-4', item.iconColor)} />
              </div>
            </div>
            <p className={cn('text-2xl font-bold tracking-tight', item.valueColor)}>{item.value}</p>
            <p className="text-xs font-medium text-muted-foreground mt-1">{item.label}</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">{item.subtext}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
