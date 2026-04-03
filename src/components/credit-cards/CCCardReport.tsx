import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { CreditCard, CCStatement } from '@/hooks/useCreditCards';

interface Props {
  cards: CreditCard[];
  statements: CCStatement[];
  getCardMetrics: (id: string) => any;
}

const riskBadge = (level: string) => {
  if (level === 'CRITICAL') return <Badge variant="destructive">CRITICAL</Badge>;
  if (level === 'HIGH') return <Badge className="bg-yellow-500/20 text-yellow-700 border-yellow-500/30">HIGH</Badge>;
  return <Badge variant="outline" className="text-green-600 border-green-500/30">SAFE</Badge>;
};

const statusBadge = (status: string) => {
  if (status === 'FULL') return <Badge variant="outline" className="text-green-600 border-green-500/30">FULL</Badge>;
  if (status === 'PARTIAL') return <Badge className="bg-yellow-500/20 text-yellow-700 border-yellow-500/30">PARTIAL</Badge>;
  return <Badge variant="destructive">UNPAID</Badge>;
};

export function CCCardReport({ cards, statements, getCardMetrics }: Props) {
  // Show all statements grouped by latest first
  const latestByCard = new Map<string, CCStatement>();
  statements.forEach(s => {
    if (!latestByCard.has(s.card_id)) latestByCard.set(s.card_id, s);
  });
  const rows = Array.from(latestByCard.values());

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Card-wise Statement Report</CardTitle></CardHeader>
      <CardContent>
        <ScrollArea className="w-full">
          <div className="min-w-[1200px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Card</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Credit Limit</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Min Due</TableHead>
                  <TableHead className="text-right">Total Due</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Interest</TableHead>
                  <TableHead className="text-right">Late Fee</TableHead>
                  <TableHead className="text-right">Util %</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Due In</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(s => {
                  const card = cards.find(c => c.id === s.card_id);
                  const m = getCardMetrics(s.card_id);
                  if (!card || !m) return null;
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium whitespace-nowrap">{card.card_name}</TableCell>
                      <TableCell>{card.bank_name}</TableCell>
                      <TableCell>{s.billing_month}</TableCell>
                      <TableCell className="text-right">₹{(s.outstanding_balance + s.available_credit_limit).toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-right">₹{s.available_credit_limit.toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-right font-medium">₹{s.outstanding_balance.toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-right">₹{s.minimum_due.toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-right">₹{s.total_due.toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-right">₹{(s.amount_paid || 0).toLocaleString('en-IN')}</TableCell>
                      <TableCell>{statusBadge(s.payment_status)}</TableCell>
                      <TableCell className="text-right">{s.interest_charged > 0 ? `₹${s.interest_charged.toLocaleString('en-IN')}` : '—'}</TableCell>
                      <TableCell className="text-right">{s.late_fee > 0 ? `₹${s.late_fee.toLocaleString('en-IN')}` : '—'}</TableCell>
                      <TableCell className="text-right">{m.utilization}%</TableCell>
                      <TableCell>{riskBadge(m.riskLevel)}</TableCell>
                      <TableCell>
                        {m.daysUntilDue !== null ? (
                          <span className={m.daysUntilDue < 0 ? 'text-destructive font-bold' : m.daysUntilDue <= 3 ? 'text-yellow-600 font-medium' : ''}>
                            {m.daysUntilDue < 0 ? `${Math.abs(m.daysUntilDue)}d overdue` : `${m.daysUntilDue}d`}
                          </span>
                        ) : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={15} className="text-center text-muted-foreground py-8">No statements added yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
