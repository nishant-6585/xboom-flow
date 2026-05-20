import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { CreditCard as CreditCardIcon, Wallet } from 'lucide-react';
import type { CreditCard, CCStatement, CCPayment } from '@/hooks/useCreditCards';
import { getStatementCreditLimit } from '@/lib/creditCardMetrics';

interface Props {
  cards: CreditCard[];
  statements: CCStatement[];
  payments: CCPayment[];
}

const fmt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export function CCAvailableCredit({ cards, statements, payments }: Props) {
  if (cards.length === 0) return null;

  // Latest statement per card (statements already sorted by due_date desc in the hook)
  const latestByCard = new Map<string, CCStatement>();
  statements.forEach((s) => {
    if (!latestByCard.has(s.card_id)) latestByCard.set(s.card_id, s);
  });

  const rows = cards
    .filter((c) => c.is_active !== false)
    .map((card) => {
      const stmt = latestByCard.get(card.id);
      const creditLimit = stmt ? getStatementCreditLimit(stmt, card) : card.credit_limit || 0;

      // Live outstanding = statement outstanding − payments recorded against that statement
      // (the parsed `available_credit_limit` is a snapshot from PDF and doesn't reflect
      // payments recorded afterwards in the app)
      const stmtOutstanding = stmt?.outstanding_balance || 0;
      const stmtPayments = stmt
        ? payments
            .filter((p) => p.statement_id === stmt.id)
            .reduce((sum, p) => sum + (p.amount || 0), 0)
        : 0;
      const liveOutstanding = Math.max(0, stmtOutstanding - stmtPayments);
      const available = Math.max(0, creditLimit - liveOutstanding);
      const utilization = creditLimit > 0 ? Math.min(100, (liveOutstanding / creditLimit) * 100) : 0;

      return { card, creditLimit, liveOutstanding, available, utilization, stmtPayments };
    });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Wallet className="h-4 w-4" /> Available Credit by Card
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map(({ card, creditLimit, liveOutstanding, available, utilization, stmtPayments }) => {
          const tone =
            utilization > 80 ? 'text-red-500' : utilization > 50 ? 'text-yellow-500' : 'text-green-500';
          return (
            <div key={card.id} className="rounded-lg border p-3 space-y-2 bg-card/50">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <CreditCardIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs font-medium truncate">{card.bank_name}</p>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{card.card_name}</p>
                </div>
                <Badge variant="outline" className={`text-[10px] ${tone}`}>
                  {utilization.toFixed(0)}% used
                </Badge>
              </div>

              <div>
                <p className="text-[10px] text-muted-foreground">Available Credit</p>
                <p className="text-lg font-bold text-green-600">{fmt(available)}</p>
              </div>

              <Progress value={utilization} className="h-1.5" />

              <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground pt-1">
                <div>
                  <p>Credit Limit</p>
                  <p className="text-foreground font-medium">{creditLimit > 0 ? fmt(creditLimit) : '—'}</p>
                </div>
                <div className="text-right">
                  <p>Outstanding</p>
                  <p className="text-foreground font-medium">{fmt(liveOutstanding)}</p>
                </div>
              </div>
              {stmtPayments > 0 && (
                <p className="text-[10px] text-green-600">
                  +{fmt(stmtPayments)} freed up by recent payments
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}