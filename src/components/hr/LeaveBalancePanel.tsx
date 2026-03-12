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

export function LeaveBalancePanel({ employeeId }: LeaveBalancePanelProps) {
  const { role } = useAuth();
  const { balances, transactions, allBalances, loading, fetchAllBalances } = useLeaveBalances(employeeId);
  const isHROrAdmin = role === 'admin' || role === 'hr';

  useEffect(() => {
    if (isHROrAdmin) fetchAllBalances();
  }, [isHROrAdmin, fetchAllBalances]);

  const elBalance = balances.find(b => b.leave_type === 'EL');

  if (loading) {
    return <div className="h-32 bg-muted rounded-lg animate-pulse" />;
  }

  return (
    <div className="space-y-4">
      {/* My Balance Card */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Leaf className="h-5 w-5 text-primary" />
            My Earned Leave Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-primary">{elBalance?.balance ?? 0}</span>
            <span className="text-muted-foreground">days available ({new Date().getFullYear()})</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">1.75 EL credited monthly on the 1st</p>
        </CardContent>
      </Card>

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
                          {tx.transaction_type === 'credit' ? '+' : '-'} {tx.leave_type}
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
                    {allBalances.map(b => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{b.employee_name || '—'}</TableCell>
                        <TableCell><Badge variant="outline">{b.leave_type}</Badge></TableCell>
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
