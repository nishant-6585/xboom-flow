import { Card, CardContent } from '@/components/ui/card';
import { IndianRupee, ArrowUpRight, ArrowDownRight, CheckCircle2, AlertTriangle, Clock, FileStack } from 'lucide-react';

interface Props {
  kpis: {
    totalCredit: number;
    totalDebit: number;
    netFlow: number;
    reconciled: number;
    unmatched: number;
    pending: number;
    total: number;
  };
}

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

export function ReconciliationKPIs({ kpis }: Props) {
  const cards = [
    { label: 'Total Credits', value: fmt(kpis.totalCredit), icon: ArrowUpRight, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Total Debits', value: fmt(kpis.totalDebit), icon: ArrowDownRight, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Net Flow', value: fmt(kpis.netFlow), icon: IndianRupee, color: kpis.netFlow >= 0 ? 'text-emerald-600' : 'text-red-600', bg: 'bg-muted' },
    { label: 'Reconciled', value: `${kpis.reconciled}/${kpis.total}`, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Unmatched / New', value: String(kpis.unmatched), icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Pending Review', value: String(kpis.pending), icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map(c => (
        <Card key={c.label} className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`p-1.5 rounded-md ${c.bg}`}>
                <c.icon className={`h-4 w-4 ${c.color}`} />
              </div>
              <span className="text-xs text-muted-foreground">{c.label}</span>
            </div>
            <p className="text-lg font-bold">{c.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
