import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Clock, CreditCard } from 'lucide-react';
import type { CreditCard as CreditCardType } from '@/hooks/useCreditCards';

interface Props {
  cards: CreditCardType[];
  getCardMetrics: (id: string) => any;
}

export function CCAlerts({ cards, getCardMetrics }: Props) {
  const alerts: { icon: any; title: string; desc: string; variant: 'default' | 'destructive' }[] = [];

  cards.filter(c => c.is_active).forEach(c => {
    const m = getCardMetrics(c.id);
    if (!m) return;

    if (m.daysUntilDue !== null && m.daysUntilDue <= 3 && m.daysUntilDue >= 0 && m.paymentStatus !== 'FULLY PAID') {
      alerts.push({ icon: Clock, title: `Payment due soon: ${c.card_name}`, desc: `Due in ${m.daysUntilDue} day(s). Outstanding: ₹${m.latestStatement?.total_due?.toLocaleString('en-IN') || 0}`, variant: 'destructive' });
    }
    if (m.daysUntilDue !== null && m.daysUntilDue < 0 && m.paymentStatus !== 'FULLY PAID') {
      alerts.push({ icon: AlertTriangle, title: `OVERDUE: ${c.card_name}`, desc: `${Math.abs(m.daysUntilDue)} day(s) overdue!`, variant: 'destructive' });
    }
    if (m.utilization >= 80) {
      alerts.push({ icon: CreditCard, title: `High utilization: ${c.card_name}`, desc: `${m.utilization}% utilized – ${m.riskLevel}`, variant: 'destructive' });
    }
    if (m.paymentStatus === 'SAFE' && m.interestApplicable) {
      alerts.push({ icon: AlertTriangle, title: `Minimum payment only: ${c.card_name}`, desc: 'Interest will be charged. Pay full amount to avoid interest.', variant: 'default' });
    }
  });

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((a, i) => (
        <Alert key={i} variant={a.variant}>
          <a.icon className="h-4 w-4" />
          <AlertTitle>{a.title}</AlertTitle>
          <AlertDescription>{a.desc}</AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
