import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Clock, CreditCard, RefreshCw } from 'lucide-react';
import { Order } from '@/hooks/useOrders';
import { differenceInDays, parseISO, format } from 'date-fns';
import { useNotifications } from '@/hooks/useNotifications';
import { useToast } from '@/hooks/use-toast';

interface PaymentRemindersCardProps {
  orders: Order[];
}

interface PaymentReminder {
  order: Order;
  daysUntilDue: number;
  balanceAmount: number;
}

export function PaymentRemindersCard({ orders }: PaymentRemindersCardProps) {
  const { generatePaymentReminders } = useNotifications();
  const { toast } = useToast();

  const reminders = useMemo(() => {
    const today = new Date();
    
    return orders
      .filter(order => {
        // Only pending/partial payments that are not cancelled or delivered
        const hasUnpaidBalance = order.payment_status === 'pending' || order.payment_status === 'partial';
        const isActive = order.status !== 'cancelled' && order.status !== 'delivered';
        const hasDueDate = !!order.payment_due_date;
        return hasUnpaidBalance && isActive && hasDueDate;
      })
      .map(order => {
        const dueDate = parseISO(order.payment_due_date!);
        const daysUntilDue = differenceInDays(dueDate, today);
        const balanceAmount = (order.total_sales_amount || 0) - (order.amount_paid || 0);
        
        return {
          order,
          daysUntilDue,
          balanceAmount,
        };
      })
      .filter(r => r.daysUntilDue <= 7) // Due within 7 days or overdue
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  }, [orders]);

  const handleGenerateReminders = async () => {
    const success = await generatePaymentReminders();
    if (success) {
      toast({
        title: 'Reminders Generated',
        description: 'Payment reminder notifications have been created.',
      });
    } else {
      toast({
        title: 'Error',
        description: 'Failed to generate reminders.',
        variant: 'destructive',
      });
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusBadge = (daysUntilDue: number) => {
    if (daysUntilDue < 0) {
      return <Badge variant="destructive">Overdue by {Math.abs(daysUntilDue)} days</Badge>;
    } else if (daysUntilDue === 0) {
      return <Badge variant="destructive">Due Today</Badge>;
    } else if (daysUntilDue <= 3) {
      return <Badge variant="secondary" className="bg-warning/10 text-warning border-warning/20">Due in {daysUntilDue} days</Badge>;
    } else {
      return <Badge variant="outline">Due in {daysUntilDue} days</Badge>;
    }
  };

  return (
    <Card className="glass">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Payment Reminders
            </CardTitle>
            <CardDescription>
              Orders with pending payments due soon
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleGenerateReminders}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Generate Alerts
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {reminders.length === 0 ? (
          <div className="text-center py-6">
            <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-muted-foreground text-sm">No payments due in the next 7 days</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reminders.map(({ order, daysUntilDue, balanceAmount }) => (
              <div
                key={order.id}
                className="p-3 rounded-lg border border-border bg-secondary/30 flex items-center gap-3"
              >
                <div className={`p-2 rounded-lg shrink-0 ${
                  daysUntilDue < 0 ? 'bg-destructive/10 text-destructive' :
                  daysUntilDue === 0 ? 'bg-warning/10 text-warning' :
                  'bg-primary/10 text-primary'
                }`}>
                  {daysUntilDue < 0 ? (
                    <AlertTriangle className="w-4 h-4" />
                  ) : (
                    <Clock className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    {order.customer_name} - {order.customer_company}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {order.product_name} • Balance: {formatCurrency(balanceAmount)}
                  </p>
                  {order.payment_due_date && (
                    <p className="text-xs text-muted-foreground">
                      Due: {format(parseISO(order.payment_due_date), 'dd MMM yyyy')}
                    </p>
                  )}
                </div>
                <div className="shrink-0">
                  {getStatusBadge(daysUntilDue)}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
