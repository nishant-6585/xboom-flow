import { Card, CardContent } from '@/components/ui/card';
import { TrendingDown, TrendingUp, AlertTriangle, CreditCard, Percent, IndianRupee } from 'lucide-react';

interface Props {
  totalOutstanding: number;
  totalCreditLimit: number;
  avgUtilization: number;
  totalInterest: number;
  riskyCards: number;
  totalCards: number;
}

export function CCSummaryCards({ totalOutstanding, totalCreditLimit, avgUtilization, totalInterest, riskyCards, totalCards }: Props) {
  const fmt = (n: number) => {
    if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
    if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
    return `₹${n.toLocaleString('en-IN')}`;
  };

  const cards = [
    {
      title: 'Total Outstanding',
      value: fmt(totalOutstanding),
      subtitle: `of ${fmt(totalCreditLimit)} limit`,
      icon: IndianRupee,
      color: totalOutstanding > 0 ? 'text-orange-500' : 'text-green-500',
      bg: totalOutstanding > 0 ? 'bg-orange-500/10' : 'bg-green-500/10',
    },
    {
      title: 'Avg Utilization',
      value: `${avgUtilization}%`,
      subtitle: avgUtilization > 80 ? 'High risk zone' : avgUtilization > 50 ? 'Moderate' : 'Healthy',
      icon: Percent,
      color: avgUtilization > 80 ? 'text-red-500' : avgUtilization > 50 ? 'text-yellow-500' : 'text-green-500',
      bg: avgUtilization > 80 ? 'bg-red-500/10' : avgUtilization > 50 ? 'bg-yellow-500/10' : 'bg-green-500/10',
    },
    {
      title: 'Interest Charged',
      value: fmt(totalInterest),
      subtitle: totalInterest > 0 ? 'Interest leakage' : 'No interest',
      icon: TrendingDown,
      color: totalInterest > 0 ? 'text-red-500' : 'text-green-500',
      bg: totalInterest > 0 ? 'bg-red-500/10' : 'bg-green-500/10',
    },
    {
      title: 'Active Cards',
      value: totalCards.toString(),
      subtitle: riskyCards > 0 ? `${riskyCards} need attention` : 'All healthy',
      icon: riskyCards > 0 ? AlertTriangle : CreditCard,
      color: riskyCards > 0 ? 'text-yellow-500' : 'text-primary',
      bg: riskyCards > 0 ? 'bg-yellow-500/10' : 'bg-primary/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c, i) => (
        <Card key={i} className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{c.title}</p>
                <p className="text-xl font-bold">{c.value}</p>
                <p className="text-[10px] text-muted-foreground">{c.subtitle}</p>
              </div>
              <div className={`p-2 rounded-xl ${c.bg}`}>
                <c.icon className={`h-4 w-4 ${c.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
