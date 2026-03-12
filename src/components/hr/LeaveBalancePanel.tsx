import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLeaveBalances } from '@/hooks/useLeaveBalances';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { Leaf, History, Users } from 'lucide-react';

interface LeaveBalancePanelProps {
  employeeId?: string;
}

const LEAVE_TYPE_DISPLAY: Record<string, string> = {
  EL: 'Earned Leave',
  paid: 'Paid Leave',
  sick: 'Sick Leave',
  unpaid: 'Unpaid Leave',
  wfh: 'Work from Home',
  casual: 'Paid Leave (Casual)',
  half_day_casual: 'Half Day Paid',
};

export function LeaveBalancePanel({ employeeId }: LeaveBalancePanelProps) {
  const { role } = useAuth();
  const { balanceSummaries, transactions, allBalances, loading, fetchAllBalances } = useLeaveBalances(employeeId);
  const isHROrAdmin = role === 'admin' || role === 'hr';

  useEffect(() => {
    if (isHROrAdmin) fetchAllBalances();
  }, [isHROrAdmin, fetchAllBalances]);

  if (loading) {
    return <div className="h-32 bg-muted rounded-lg animate-pulse" />;
  }

  return (
    <div className="space-y-4">
      {/* Leave Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {balanceSummaries.map((summary) => (
          <Card key={summary.leave_type} className="border-primary/20">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <Leaf className="h-4 w-4 text-primary" />
                {summary.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-primary">{summary.balance}</span>
                <span className="text-sm text-muted-foreground">days</span>
              </div>
              <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                <span className="text-green-600">+{summary.total_credited} credited</span>
                <span className="text-red-600">-{summary.total_used} used</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-4 w-4" /> Credit History
          </TabsTrigger>
          {isHROrAdmin && (
            <TabsTrigger value="team" className="gap-1.5">
              <Users className="h-4 w-4" /> All Employees
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="history" className="mt-4">
          {transactions.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No leave transactions yet</p>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Balance After</TableHead>
                    <TableHead>Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map(tx => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-xs">{format(new Date(tx.created_at), 'dd MMM yyyy')}</TableCell>
                      <TableCell>
                        <Badge variant={tx.transaction_type === 'credit' ? 'default' : 'destructive'} className="text-xs">
                          {tx.transaction_type === 'credit' ? '+' : '-'} {LEAVE_TYPE_DISPLAY[tx.leave_type] || tx.leave_type}
                        </Badge>
                      </TableCell>
                      <TableCell className={tx.transaction_type === 'credit' ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                        {tx.transaction_type === 'credit' ? '+' : '-'}{tx.amount}
                      </TableCell>
                      <TableCell className="font-medium">{tx.balance_after}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{tx.remarks || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {isHROrAdmin && (
          <TabsContent value="team" className="mt-4">
            {allBalances.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No leave balances found</p>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Leave Type</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Year</TableHead>
                      <TableHead>Last Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allBalances
                      .filter(b => b.leave_type !== 'casual' && b.leave_type !== 'half_day_casual')
                      .map(b => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{b.employee_name || '—'}</TableCell>
                        <TableCell><Badge variant="outline">{LEAVE_TYPE_DISPLAY[b.leave_type] || b.leave_type}</Badge></TableCell>
                        <TableCell className="font-semibold text-primary">{b.balance}</TableCell>
                        <TableCell>{b.year}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(b.updated_at), 'dd MMM yyyy')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
