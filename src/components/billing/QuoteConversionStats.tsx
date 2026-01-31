import { Quote } from '@/hooks/useQuotes';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, CheckCircle2, XCircle, Clock, TrendingUp } from 'lucide-react';

interface QuoteConversionStatsProps {
  quotes: Quote[];
}

export function QuoteConversionStats({ quotes }: QuoteConversionStatsProps) {
  const totalQuotes = quotes.length;
  const convertedQuotes = quotes.filter(q => q.status === 'converted').length;
  const lostQuotes = quotes.filter(q => q.status === 'rejected' || q.status === 'expired').length;
  const pendingQuotes = quotes.filter(q => 
    q.status === 'draft' || q.status === 'sent' || q.status === 'accepted'
  ).length;
  
  const conversionRate = totalQuotes > 0 
    ? ((convertedQuotes / totalQuotes) * 100).toFixed(1) 
    : '0';

  const totalValue = quotes.reduce((sum, q) => sum + q.total_amount, 0);
  const convertedValue = quotes
    .filter(q => q.status === 'converted')
    .reduce((sum, q) => sum + q.total_amount, 0);

  const stats = [
    {
      label: 'Total Quotes',
      value: totalQuotes,
      icon: FileText,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      label: 'Converted to Order',
      value: convertedQuotes,
      icon: CheckCircle2,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      label: 'Lost / Expired',
      value: lostQuotes,
      icon: XCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-100',
    },
    {
      label: 'Pending',
      value: pendingQuotes,
      icon: Clock,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
    },
    {
      label: 'Conversion Rate',
      value: `${conversionRate}%`,
      icon: TrendingUp,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
