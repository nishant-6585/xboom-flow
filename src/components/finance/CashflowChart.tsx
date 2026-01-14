import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line } from 'recharts';
import { ExpectedPayment } from '@/hooks/useExpectedPayments';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, isWithinInterval, parseISO, isBefore } from 'date-fns';
import { CalendarDays, TrendingUp, AlertTriangle, CheckCircle2, Clock, Trash2 } from 'lucide-react';

interface CashflowChartProps {
  expectedPayments: ExpectedPayment[];
  onMarkReceived: (id: string) => void;
  onDelete: (id: string) => void;
}

export function CashflowChart({ expectedPayments, onMarkReceived, onDelete }: CashflowChartProps) {
  const [view, setView] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  // Process data for charts
  const chartData = useMemo(() => {
    const pendingPayments = expectedPayments.filter(p => p.status === 'pending');
    const today = new Date();

    if (view === 'daily') {
      // Next 14 days
      const days: { date: string; label: string; amount: number; count: number }[] = [];
      for (let i = 0; i < 14; i++) {
        const date = addDays(today, i);
        const dateStr = format(date, 'yyyy-MM-dd');
        const dayPayments = pendingPayments.filter(p => p.expected_date === dateStr);
        days.push({
          date: dateStr,
          label: format(date, 'dd MMM'),
          amount: dayPayments.reduce((sum, p) => sum + Number(p.amount), 0),
          count: dayPayments.length,
        });
      }
      return days;
    }

    if (view === 'weekly') {
      // Next 8 weeks
      const weeks: { date: string; label: string; amount: number; count: number }[] = [];
      for (let i = 0; i < 8; i++) {
        const weekStart = startOfWeek(addDays(today, i * 7), { weekStartsOn: 1 });
        const weekEnd = endOfWeek(addDays(today, i * 7), { weekStartsOn: 1 });
        const weekPayments = pendingPayments.filter(p => {
          const pDate = parseISO(p.expected_date);
          return isWithinInterval(pDate, { start: weekStart, end: weekEnd });
        });
        weeks.push({
          date: format(weekStart, 'yyyy-MM-dd'),
          label: `W${i + 1}: ${format(weekStart, 'dd MMM')}`,
          amount: weekPayments.reduce((sum, p) => sum + Number(p.amount), 0),
          count: weekPayments.length,
        });
      }
      return weeks;
    }

    // Monthly - next 6 months
    const months: { date: string; label: string; amount: number; count: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const monthDate = addDays(today, i * 30);
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);
      const monthPayments = pendingPayments.filter(p => {
        const pDate = parseISO(p.expected_date);
        return isWithinInterval(pDate, { start: monthStart, end: monthEnd });
      });
      months.push({
        date: format(monthStart, 'yyyy-MM-dd'),
        label: format(monthStart, 'MMM yyyy'),
        amount: monthPayments.reduce((sum, p) => sum + Number(p.amount), 0),
        count: monthPayments.length,
      });
    }
    return months;
  }, [expectedPayments, view]);

  // Summary stats
  const stats = useMemo(() => {
    const today = new Date();
    const pending = expectedPayments.filter(p => p.status === 'pending');
    const overdue = pending.filter(p => isBefore(parseISO(p.expected_date), today));
    const thisWeek = pending.filter(p => {
      const pDate = parseISO(p.expected_date);
      return isWithinInterval(pDate, { start: today, end: addDays(today, 7) });
    });
    const received = expectedPayments.filter(p => p.status === 'received');

    return {
      totalPending: pending.reduce((sum, p) => sum + Number(p.amount), 0),
      pendingCount: pending.length,
      overdueAmount: overdue.reduce((sum, p) => sum + Number(p.amount), 0),
      overdueCount: overdue.length,
      thisWeekAmount: thisWeek.reduce((sum, p) => sum + Number(p.amount), 0),
      thisWeekCount: thisWeek.length,
      receivedAmount: received.reduce((sum, p) => sum + Number(p.amount), 0),
      receivedCount: received.length,
    };
  }, [expectedPayments]);

  const getStatusBadge = (status: string, expectedDate: string) => {
    const isOverdue = status === 'pending' && isBefore(parseISO(expectedDate), new Date());
    if (status === 'received') {
      return <Badge className="bg-green-500/20 text-green-700"><CheckCircle2 className="h-3 w-3 mr-1" />Received</Badge>;
    }
    if (isOverdue) {
      return <Badge className="bg-red-500/20 text-red-700"><AlertTriangle className="h-3 w-3 mr-1" />Overdue</Badge>;
    }
    return <Badge className="bg-yellow-500/20 text-yellow-700"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 border-yellow-500/20">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/20">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-xl font-bold">₹{stats.totalPending.toLocaleString('en-IN')}</p>
                <p className="text-xs text-muted-foreground">Pending ({stats.pendingCount})</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/20">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/20">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-xl font-bold">₹{stats.overdueAmount.toLocaleString('en-IN')}</p>
                <p className="text-xs text-muted-foreground">Overdue ({stats.overdueCount})</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <CalendarDays className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xl font-bold">₹{stats.thisWeekAmount.toLocaleString('en-IN')}</p>
                <p className="text-xs text-muted-foreground">This Week ({stats.thisWeekCount})</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xl font-bold">₹{stats.receivedAmount.toLocaleString('en-IN')}</p>
                <p className="text-xs text-muted-foreground">Received ({stats.receivedCount})</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Expected Cashflow
              </CardTitle>
              <CardDescription>Projected incoming payments timeline</CardDescription>
            </div>
            <Tabs value={view} onValueChange={(v) => setView(v as any)}>
              <TabsList>
                <TabsTrigger value="daily">Daily</TabsTrigger>
                <TabsTrigger value="weekly">Weekly</TabsTrigger>
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" fontSize={12} />
                <YAxis 
                  tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}K`}
                  fontSize={12}
                />
                <Tooltip 
                  formatter={(value: number) => [`₹${value.toLocaleString('en-IN')}`, 'Expected']}
                  labelFormatter={(label) => `Period: ${label}`}
                />
                <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Pending Payments Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Pending Payments Timeline
          </CardTitle>
          <CardDescription>Track and manage expected payments</CardDescription>
        </CardHeader>
        <CardContent>
          {expectedPayments.filter(p => p.status !== 'cancelled').length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CalendarDays className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No expected payments added yet</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Customer</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Expected Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expectedPayments
                    .filter(p => p.status !== 'cancelled')
                    .sort((a, b) => new Date(a.expected_date).getTime() - new Date(b.expected_date).getTime())
                    .map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{payment.customer_name}</p>
                            <p className="text-xs text-muted-foreground">{payment.customer_company}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {payment.source_type}
                          </Badge>
                          {payment.order_number && (
                            <span className="text-xs text-muted-foreground ml-1">
                              ({payment.order_number})
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          ₹{Number(payment.amount).toLocaleString('en-IN')}
                        </TableCell>
                        <TableCell>
                          {format(parseISO(payment.expected_date), 'dd MMM yyyy')}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(payment.status, payment.expected_date)}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {payment.status === 'pending' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => onMarkReceived(payment.id)}
                                title="Mark as Received"
                              >
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => onDelete(payment.id)}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
