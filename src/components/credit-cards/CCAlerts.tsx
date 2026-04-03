import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Clock, CreditCard, ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CreditCard as CreditCardType } from '@/hooks/useCreditCards';

interface Props {
  cards: CreditCardType[];
  getCardMetrics: (id: string) => any;
  onAddStatement?: () => void;
}

interface AlertItem {
  severity: 'critical' | 'warning';
  icon: any;
  cardName: string;
  issue: string;
  amount?: string;
}

export function CCAlerts({ cards, getCardMetrics, onAddStatement }: Props) {
  const [expanded, setExpanded] = useState(false);

  const critical: AlertItem[] = [];
  const warning: AlertItem[] = [];

  cards.filter(c => c.is_active).forEach(c => {
    const m = getCardMetrics(c.id);
    if (!m || !m.latestStatement) return;

    if (m.daysUntilDue !== null && m.daysUntilDue < 0 && m.paymentStatus !== 'FULL') {
      critical.push({ severity: 'critical', icon: AlertTriangle, cardName: c.card_name, issue: `${Math.abs(m.daysUntilDue)}d overdue`, amount: `₹${m.latestStatement.total_due?.toLocaleString('en-IN')}` });
    }
    if (m.utilization >= 90) {
      critical.push({ severity: 'critical', icon: CreditCard, cardName: c.card_name, issue: `${m.utilization}% utilized — CRITICAL`, amount: `₹${m.latestStatement.outstanding_balance?.toLocaleString('en-IN')}` });
    }
    if (m.paymentStatus === 'UNPAID' && m.latestStatement?.total_due > 0) {
      critical.push({ severity: 'critical', icon: AlertCircle, cardName: c.card_name, issue: 'Total due unpaid', amount: `₹${m.latestStatement.total_due?.toLocaleString('en-IN')}` });
    }

    if (m.daysUntilDue !== null && m.daysUntilDue >= 0 && m.daysUntilDue <= 3 && m.paymentStatus !== 'FULL') {
      warning.push({ severity: 'warning', icon: Clock, cardName: c.card_name, issue: `Due in ${m.daysUntilDue}d`, amount: `₹${m.latestStatement.total_due?.toLocaleString('en-IN')}` });
    }
    if (m.utilization >= 80 && m.utilization < 90) {
      warning.push({ severity: 'warning', icon: CreditCard, cardName: c.card_name, issue: `${m.utilization}% utilized`, amount: `₹${m.latestStatement.outstanding_balance?.toLocaleString('en-IN')}` });
    }
    if (m.paymentStatus === 'PARTIAL') {
      warning.push({ severity: 'warning', icon: Info, cardName: c.card_name, issue: 'Only partial payment made', amount: `₹${(m.latestStatement.total_due - (m.latestStatement.amount_paid || 0))?.toLocaleString('en-IN')} remaining` });
    }
  });

  const allGood = critical.length === 0 && warning.length === 0;
  const visibleCritical = expanded ? critical : critical.slice(0, 3);
  const visibleWarning = expanded ? warning : warning.slice(0, 3);
  const hasMore = (critical.length > 3 || warning.length > 3);

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            {allGood ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}
            Alert Center
            {!allGood && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                {critical.length + warning.length}
              </Badge>
            )}
          </CardTitle>
          {hasMore && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setExpanded(!expanded)}>
              {expanded ? <><ChevronUp className="h-3 w-3 mr-1" />Less</> : <><ChevronDown className="h-3 w-3 mr-1" />View All</>}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        {allGood ? (
          <div className="flex items-center gap-3 py-3 px-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">All cards are in good standing</p>
              <p className="text-xs text-muted-foreground">No critical issues or upcoming dues</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleCritical.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-destructive flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive" />Critical Issues
                </p>
                {visibleCritical.map((a, i) => (
                  <AlertRow key={`c-${i}`} item={a} variant="critical" />
                ))}
              </div>
            )}
            {visibleWarning.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-yellow-600 dark:text-yellow-500 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />Needs Attention
                </p>
                {visibleWarning.map((a, i) => (
                  <AlertRow key={`w-${i}`} item={a} variant="warning" />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AlertRow({ item, variant }: { item: AlertItem; variant: 'critical' | 'warning' }) {
  const Icon = item.icon;
  return (
    <div className={cn(
      'flex items-center gap-3 px-3 py-2 rounded-lg border text-sm',
      variant === 'critical' ? 'bg-destructive/5 border-destructive/20' : 'bg-yellow-500/5 border-yellow-500/20'
    )}>
      <Icon className={cn('h-4 w-4 shrink-0', variant === 'critical' ? 'text-destructive' : 'text-yellow-600 dark:text-yellow-500')} />
      <div className="flex-1 min-w-0">
        <span className="font-medium">{item.cardName}</span>
        <span className="text-muted-foreground ml-2">{item.issue}</span>
      </div>
      {item.amount && <span className="font-semibold text-xs whitespace-nowrap">{item.amount}</span>}
    </div>
  );
}
