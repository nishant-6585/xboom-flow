import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLeaveBalances, EmployeeLeaveRow } from '@/hooks/useLeaveBalances';
import { useAuth } from '@/hooks/useAuth';
import { LeaveBalanceEditDialog } from '@/components/hr/LeaveBalanceEditDialog';
import { format } from 'date-fns';
import { Leaf, History, Users, Pencil, Gift } from 'lucide-react';
import { useCompOff } from '@/hooks/useCompOff';
import { CompOffHistoryTable } from '@/components/hr/CompOffHistoryTable';

interface LeaveBalancePanelProps {
  employeeId?: string;
}

const LEAVE_TYPE_DISPLAY: Record<string, string> = {
  EL: 'Earned Leave',
  paid: 'Earned Leave',
  sick: 'Sick Leave',
  casual: 'Earned Leave (Casual)',
  half_day_casual: 'Half Day Earned',
};

export function LeaveBalancePanel({ employeeId }: LeaveBalancePanelProps) {
  const { role } = useAuth();
  const { balanceSummaries, transactions, employeeRows, loading, fetchAllBalances, adjustBalances } = useLeaveBalances(employeeId);
  const { balance: compoffBalance } = useCompOff(employeeId);
  const isHROrAdmin = role === 'admin' || role === 'hr';

  const [editRow, setEditRow] = useState<EmployeeLeaveRow | null>(null);

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
        <Card className="border-primary/20">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Gift className="h-4 w-4 text-primary" />
              Compensatory Off
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-primary">{compoffBalance}</span>
              <span className="text-sm text-muted-foreground">days</span>
            </div>
            <div className="text-xs text-muted-foreground mt-2">Earned by working on holidays/weekends</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-4 w-4" /> Credit History
          </TabsTrigger>
          <TabsTrigger value="compoff" className="gap-1.5">
            <Gift className="h-4 w-4" /> CompOff History
          </TabsTrigger>
          {isHROrAdmin && (
            <TabsTrigger value="team" className="gap-1.5">
              <Users className="h-4 w-4" /> Leave Balance Management
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
                  {transactions.filter(tx => tx.leave_type !== 'paid' && tx.leave_type !== 'half_day_paid' && tx.leave_type !== 'unpaid' && tx.leave_type !== 'wfh' && tx.leave_type !== 'half_day_unpaid').map(tx => (
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
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{tx.remarks || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="compoff" className="mt-4">
          <CompOffHistoryTable employeeId={employeeId} />
        </TabsContent>

        {isHROrAdmin && (
          <TabsContent value="team" className="mt-4">
            {employeeRows.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No leave balances found</p>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-center">Earned Leave</TableHead>
                      <TableHead className="text-center">Sick Leave</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employeeRows.map(row => {
                      const getBalance = (lt: string) => row.balances.find(b => b.leave_type === lt)?.balance ?? 0;
                      return (
                        <TableRow key={row.employee_id}>
                          <TableCell className="font-medium">{row.employee_name}</TableCell>
                          <TableCell className="text-center font-semibold text-primary">{getBalance('EL')}</TableCell>
                          <TableCell className="text-center font-semibold text-primary">{getBalance('sick')}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => setEditRow(row)}>
                              <Pencil className="h-4 w-4 mr-1" /> Edit
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>
        )}
      </Tabs>

      {editRow && (
        <LeaveBalanceEditDialog
          open={!!editRow}
          onOpenChange={(open) => { if (!open) setEditRow(null); }}
          employeeName={editRow.employee_name}
          employeeId={editRow.employee_id}
          balances={
            // Only EL and Sick are balance-tracked leave types
            ['EL', 'sick'].map(lt => {
              const existing = editRow.balances.find(b => b.leave_type === lt);
              return {
                leave_type: lt,
                label: LEAVE_TYPE_DISPLAY[lt] || lt,
                balance: existing?.balance ?? 0,
              };
            })
          }
          onSave={(adjustments, reason) => adjustBalances(editRow.employee_id, adjustments, reason)}
        />
      )}
    </div>
  );
}
