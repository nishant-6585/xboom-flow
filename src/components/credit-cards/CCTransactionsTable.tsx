import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { CreditCard, CCTransaction } from '@/hooks/useCreditCards';

interface Props {
  transactions: CCTransaction[];
  cards: CreditCard[];
}

const catColor = (c: string) => {
  switch (c) {
    case 'Marketing': return 'default';
    case 'Tools': return 'secondary';
    case 'Infra': return 'outline';
    default: return 'outline';
  }
};

export function CCTransactionsTable({ transactions, cards }: Props) {
  const [filterCard, setFilterCard] = useState<string>('all');
  const filtered = filterCard === 'all' ? transactions : transactions.filter(t => t.card_id === filterCard);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-sm">Recent Transactions</CardTitle>
        <Select value={filterCard} onValueChange={setFilterCard}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All Cards" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Cards</SelectItem>
            {cards.map(c => <SelectItem key={c.id} value={c.id}>{c.card_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Card</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Department</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.slice(0, 50).map(t => (
              <TableRow key={t.id}>
                <TableCell className="whitespace-nowrap">{new Date(t.transaction_date).toLocaleDateString('en-IN')}</TableCell>
                <TableCell>{cards.find(c => c.id === t.card_id)?.card_name || '—'}</TableCell>
                <TableCell><Badge variant={catColor(t.category) as any}>{t.category}</Badge></TableCell>
                <TableCell className="max-w-48 truncate">{t.description || '—'}</TableCell>
                <TableCell>{t.department || '—'}</TableCell>
                <TableCell className="text-right font-medium">₹{t.amount.toLocaleString('en-IN')}</TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No transactions</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
