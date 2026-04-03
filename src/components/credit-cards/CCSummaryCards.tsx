import { Card, CardContent } from '@/components/ui/card';
import { IndianRupee, TrendingUp, AlertTriangle, Percent, CreditCard } from 'lucide-react';

interface Props {
  totalOutstanding: number;
  totalCreditLimit: number;
  avgUtilization: number;
  totalInterest: number;
  riskyCards: number;
}

export function CCSummaryCards({ totalOutstanding, totalCreditLimit, avgUtilization, totalInterest, riskyCards }: Props) {
  const items = [
    { label: 'Total Outstanding', value: `₹${totalOutstanding.toLocaleString('en-IN')}`, icon: IndianRupee, color: 'text-primary' },
    { label: 'Total Credit Limit', value: `₹${totalCreditLimit.toLocaleString('en-IN')}`, icon: CreditCard, color: 'text-blue-500' },
    { label: 'Avg Utilization', value: `${avgUtilization}%`, icon: Percent, color: avgUtilization > 80 ? 'text-destructive' : avgUtilization > 60 ? 'text-yellow-500' : 'text-green-500' },
    { label: 'Total Interest', value: `₹${totalInterest.toLocaleString('en-IN')}`, icon: TrendingUp, color: totalInterest > 0 ? 'text-destructive' : 'text-muted-foreground' },
    { label: 'Risky Cards', value: riskyCards.toString(), icon: AlertTriangle, color: riskyCards > 0 ? 'text-destructive' : 'text-green-500' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {items.map(item => (
        <Card key={item.label}>
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center gap-2 mb-1">
              <item.icon className={`h-4 w-4 ${item.color}`} />
              <span className="text-xs text-muted-foreground">{item.label}</span>
            </div>
            <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
