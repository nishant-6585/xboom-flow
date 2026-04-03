import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { CreditCard } from '@/hooks/useCreditCards';

interface Props {
  cards: CreditCard[];
  getCardMetrics: (id: string) => any;
}

const riskColor = (level: string) => {
  switch (level) {
    case 'CRITICAL': return 'destructive';
    case 'HIGH RISK': return 'destructive';
    case 'WARNING': return 'secondary';
    default: return 'outline';
  }
};

const statusColor = (status: string) => {
  switch (status) {
    case 'FULLY PAID': return 'outline';
    case 'SAFE': return 'secondary';
    case 'DANGER': return 'destructive';
    default: return 'outline';
  }
};

export function CCCardReport({ cards, getCardMetrics }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Card-wise Report</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Card</TableHead>
              <TableHead>Bank</TableHead>
              <TableHead className="text-right">Utilization</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Interest</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead>Due In</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cards.filter(c => c.is_active).map(c => {
              const m = getCardMetrics(c.id);
              if (!m) return null;
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.card_name}</TableCell>
                  <TableCell>{c.bank_name}</TableCell>
                  <TableCell className="text-right">{m.utilization}%</TableCell>
                  <TableCell>
                    <Badge variant={statusColor(m.paymentStatus) as any}>{m.paymentStatus}</Badge>
                  </TableCell>
                  <TableCell>
                    {m.interestApplicable ? (
                      <Badge variant="destructive">Yes</Badge>
                    ) : (
                      <Badge variant="outline">No</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={riskColor(m.riskLevel) as any}>{m.riskLevel}</Badge>
                  </TableCell>
                  <TableCell>
                    {m.daysUntilDue !== null ? (
                      <span className={m.daysUntilDue <= 3 ? 'text-destructive font-bold' : m.daysUntilDue <= 7 ? 'text-yellow-600 font-medium' : ''}>
                        {m.daysUntilDue < 0 ? `${Math.abs(m.daysUntilDue)}d overdue` : `${m.daysUntilDue}d`}
                      </span>
                    ) : '—'}
                  </TableCell>
                </TableRow>
              );
            })}
            {cards.filter(c => c.is_active).length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No cards added yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
