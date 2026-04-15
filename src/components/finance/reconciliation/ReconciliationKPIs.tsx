import { Card, CardContent } from '@/components/ui/card';
import { IndianRupee, ArrowUpRight, ArrowDownRight, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

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
  const reconciledPct = kpis.total > 0 ? Math.round((kpis.reconciled / kpis.total) * 100) : 0;

  const cards = [
    {
      label: 'Total Credits',
      value: fmt(kpis.totalCredit),
      icon: ArrowUpRight,
      gradient: 'from-emerald-500/15 to-emerald-500/5',
      iconBg: 'bg-emerald-500/20',
      iconColor: 'text-emerald-500',
      valueColor: 'text-emerald-500',
    },
    {
      label: 'Total Debits',
      value: fmt(kpis.totalDebit),
      icon: ArrowDownRight,
      gradient: 'from-red-500/15 to-red-500/5',
      iconBg: 'bg-red-500/20',
      iconColor: 'text-red-500',
      valueColor: 'text-red-500',
    },
    {
      label: 'Net Flow',
      value: fmt(kpis.netFlow),
      icon: IndianRupee,
      gradient: kpis.netFlow >= 0 ? 'from-emerald-500/10 to-transparent' : 'from-red-500/10 to-transparent',
      iconBg: 'bg-muted',
      iconColor: kpis.netFlow >= 0 ? 'text-emerald-500' : 'text-red-500',
      valueColor: kpis.netFlow >= 0 ? 'text-emerald-500' : 'text-red-500',
    },
    {
      label: 'Reconciled',
      value: `${kpis.reconciled}/${kpis.total}`,
      icon: CheckCircle2,
      gradient: 'from-green-500/15 to-green-500/5',
      iconBg: 'bg-green-500/20',
      iconColor: 'text-green-500',
      valueColor: '',
      extra: reconciledPct,
    },
    {
      label: 'Unmatched / New',
      value: String(kpis.unmatched),
      icon: AlertTriangle,
      gradient: 'from-amber-500/15 to-amber-500/5',
      iconBg: 'bg-amber-500/20',
      iconColor: 'text-amber-500',
      valueColor: kpis.unmatched > 0 ? 'text-amber-500' : '',
    },
    {
      label: 'Pending Review',
      value: String(kpis.pending),
      icon: Clock,
      gradient: 'from-blue-500/15 to-blue-500/5',
      iconBg: 'bg-blue-500/20',
      iconColor: 'text-blue-500',
      valueColor: kpis.pending > 0 ? 'text-blue-500' : '',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map(c => (
        <Card key={c.label} className={`border-border/40 bg-gradient-to-br ${c.gradient} overflow-hidden relative`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{c.label}</span>
              <div className={`p-1.5 rounded-lg ${c.iconBg}`}>
                <c.icon className={`h-4 w-4 ${c.iconColor}`} />
              </div>
            </div>
            <p className={`text-xl font-bold tracking-tight ${c.valueColor}`}>{c.value}</p>
            {'extra' in c && typeof c.extra === 'number' && (
              <div className="mt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground">{c.extra}% complete</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-green-500 transition-all duration-500"
                    style={{ width: `${c.extra}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
