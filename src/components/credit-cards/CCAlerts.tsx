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
    if (!m || !m.latestStatement) return;

    if (m.daysUntilDue !== null && m.daysUntilDue <= 3 && m.daysUntilDue >= 0 && m.paymentStatus !== 'FULL') {
      alerts.push({ icon: Clock, title: `Payment due soon: ${c.card_name}`, desc: `Due in ${m.daysUntilDue} day(s). Total Due: ₹${m.latestStatement?.total_due?.toLocaleString('en-IN') || 0}`, variant: 'destructive' });
    }
    if (m.daysUntilDue !== null && m.daysUntilDue < 0 && m.paymentStatus !== 'FULL') {
      alerts.push({ icon: AlertTriangle, title: `OVERDUE: ${c.card_name}`, desc: `${Math.abs(m.daysUntilDue)} day(s) overdue!`, variant: 'destructive' });
    }
    if (m.utilization >= 80) {
      alerts.push({ icon: CreditCard, title: `High utilization: ${c.card_name}`, desc: `${m.utilization}% utilized – ${m.riskLevel}`, variant: 'destructive' });
    }
    if (m.paymentStatus === 'UNPAID' && m.latestStatement?.total_due > 0) {
      alerts.push({ icon: AlertTriangle, title: `Unpaid: ${c.card_name}`, desc: `Total due ₹${m.latestStatement.total_due.toLocaleString('en-IN')} is unpaid.`, variant: 'destructive' });
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
