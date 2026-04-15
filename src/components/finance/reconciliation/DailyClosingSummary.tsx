import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { type BankTransaction, type ReconciliationAccount } from '@/hooks/useBankReconciliation';

interface Props {
  transactions: BankTransaction[];
  accounts: ReconciliationAccount[];
}

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

export function DailyClosingSummary({ transactions, accounts }: Props) {
  const dailySummary = useMemo(() => {
    const map = new Map<string, { date: string; credit: number; debit: number; reconciled: number; pending: number; total: number }>();
    transactions.forEach(tx => {
      const d = tx.transaction_date;
      const entry = map.get(d) || { date: d, credit: 0, debit: 0, reconciled: 0, pending: 0, total: 0 };
      entry.credit += tx.credit_amount || 0;
      entry.debit += tx.debit_amount || 0;
      if (tx.status === 'reconciled') entry.reconciled++;
      else if (tx.status !== 'ignored' && tx.status !== 'duplicate') entry.pending++;
      entry.total++;
      map.set(d, entry);
    });
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  }, [transactions]);

  const accountBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; credit: number; debit: number; count: number }>();
    transactions.forEach(tx => {
      const acc = accounts.find(a => a.id === tx.account_id);
      const name = acc?.name || 'Uncategorized';
      const entry = map.get(name) || { name, credit: 0, debit: 0, count: 0 };
      entry.credit += tx.credit_amount || 0;
      entry.debit += tx.debit_amount || 0;
      entry.count++;
      map.set(name, entry);
    });
    return Array.from(map.values()).sort((a, b) => (b.credit + b.debit) - (a.credit + a.debit));
  }, [transactions, accounts]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Daily Closing Summary</CardTitle></CardHeader>
        <CardContent>
          <div className="max-h-[400px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dailySummary.map(d => (
                  <TableRow key={d.date}>
                    <TableCell className="text-xs">{d.date}</TableCell>
                    <TableCell className="text-xs text-right text-emerald-600">{fmt(d.credit)}</TableCell>
                    <TableCell className="text-xs text-right text-red-600">{fmt(d.debit)}</TableCell>
                    <TableCell className="text-xs text-right font-medium">{fmt(d.credit - d.debit)}</TableCell>
                    <TableCell>
                      <Badge variant={d.pending === 0 ? 'default' : 'secondary'} className="text-[10px]">
                        {d.reconciled}/{d.total}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Account Breakdown</CardTitle></CardHeader>
        <CardContent>
          <div className="max-h-[400px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Credits</TableHead>
                  <TableHead className="text-right">Debits</TableHead>
                  <TableHead className="text-right">Txns</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accountBreakdown.map(a => (
                  <TableRow key={a.name}>
                    <TableCell className="text-xs font-medium">{a.name}</TableCell>
                    <TableCell className="text-xs text-right text-emerald-600">{fmt(a.credit)}</TableCell>
                    <TableCell className="text-xs text-right text-red-600">{fmt(a.debit)}</TableCell>
                    <TableCell className="text-xs text-right">{a.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
