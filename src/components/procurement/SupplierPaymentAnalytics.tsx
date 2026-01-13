import { useMemo } from "react";
import { useOrders } from "@/hooks/useOrders";
import { useSuppliers, useSupplierPayments } from "@/hooks/useSuppliers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO, addDays, isBefore, isToday } from "date-fns";
import { IndianRupee, Building2, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

const PAYMENT_TERMS_DAYS: Record<string, number> = {
  'advance': 0,
  'cod': 0,
  'net_7': 7,
  'net_15': 15,
  'net_30': 30,
  'net_45': 45,
  'net_60': 60,
};

export function SupplierPaymentAnalytics() {
  const { orders } = useOrders();
  const { suppliers } = useSuppliers();
  const { payments } = useSupplierPayments();

  // Current month interval
  const currentMonthInterval = useMemo(() => {
    const now = new Date();
    return {
      start: startOfMonth(now),
      end: endOfMonth(now),
    };
  }, []);

  // MTD Procurement stats
  const mtdStats = useMemo(() => {
    const mtdOrders = orders.filter(order => {
      const orderDate = parseISO(order.created_at);
      return isWithinInterval(orderDate, currentMonthInterval);
    });

    const totalProcurement = mtdOrders.reduce((sum, o) => 
      sum + ((o.procurement_rate || 0) * (o.quantity || 1)), 0
    );

    const mtdPayments = payments.filter(payment => {
      const paymentDate = parseISO(payment.payment_date);
      return isWithinInterval(paymentDate, currentMonthInterval);
    });

    const totalPaid = mtdPayments.reduce((sum, p) => sum + p.amount, 0);

    return {
      totalProcurement,
      totalPaid,
      pendingPayment: totalProcurement - totalPaid,
      orderCount: mtdOrders.length,
      paymentCount: mtdPayments.length,
    };
  }, [orders, payments, currentMonthInterval]);

  // Supplier-wise breakdown for MTD
  const supplierWiseStats = useMemo(() => {
    const supplierMap = new Map<string, { 
      name: string; 
      procurement: number; 
      paid: number; 
      pending: number;
      orderCount: number;
    }>();

    // Filter MTD orders
    const mtdOrders = orders.filter(order => {
      const orderDate = parseISO(order.created_at);
      return isWithinInterval(orderDate, currentMonthInterval);
    });

    // Calculate procurement per supplier
    mtdOrders.forEach(order => {
      const supplierName = order.supplier_name || 'Unassigned';
      const supplierId = order.supplier_id || 'unassigned';
      const value = (order.procurement_rate || 0) * (order.quantity || 1);
      const current = supplierMap.get(supplierId) || { 
        name: supplierName, 
        procurement: 0, 
        paid: 0, 
        pending: 0,
        orderCount: 0 
      };
      supplierMap.set(supplierId, {
        ...current,
        procurement: current.procurement + value,
        orderCount: current.orderCount + 1,
      });
    });

    // Add payments
    const mtdPayments = payments.filter(payment => {
      const paymentDate = parseISO(payment.payment_date);
      return isWithinInterval(paymentDate, currentMonthInterval);
    });

    mtdPayments.forEach(payment => {
      const supplier = suppliers.find(s => s.id === payment.supplier_id);
      const supplierName = supplier?.name || 'Unknown';
      const supplierId = payment.supplier_id;
      const current = supplierMap.get(supplierId) || { 
        name: supplierName, 
        procurement: 0, 
        paid: 0, 
        pending: 0,
        orderCount: 0 
      };
      supplierMap.set(supplierId, {
        ...current,
        paid: current.paid + payment.amount,
        name: supplierName,
      });
    });

    // Calculate pending
    const result = Array.from(supplierMap.entries()).map(([id, data]) => ({
      id,
      ...data,
      pending: Math.max(0, data.procurement - data.paid),
    }));

    return result.sort((a, b) => b.procurement - a.procurement).slice(0, 10);
  }, [orders, payments, suppliers, currentMonthInterval]);

  // Orders due for payment (based on supplier payment terms)
  const ordersWithPaymentDue = useMemo(() => {
    const today = new Date();
    
    return orders
      .filter(order => {
        // Only consider orders with supplier assigned
        if (!order.supplier_name) return false;
        
        // Check if order has supplier payment terms
        const paymentTerms = (order as any).supplier_payment_terms;
        if (!paymentTerms) return false;
        
        // Calculate due date based on terms
        const daysToAdd = PAYMENT_TERMS_DAYS[paymentTerms] || 0;
        if (daysToAdd === 0 && paymentTerms === 'advance') return false; // Advance should be paid already
        
        const orderDate = parseISO(order.created_at);
        const dueDate = addDays(orderDate, daysToAdd);
        
        // Check if due within 7 days or overdue
        const sevenDaysFromNow = addDays(today, 7);
        return isBefore(dueDate, sevenDaysFromNow);
      })
      .map(order => {
        const paymentTerms = (order as any).supplier_payment_terms;
        const daysToAdd = PAYMENT_TERMS_DAYS[paymentTerms] || 0;
        const orderDate = parseISO(order.created_at);
        const dueDate = addDays(orderDate, daysToAdd);
        const isOverdue = isBefore(dueDate, today) && !isToday(dueDate);
        const isDueToday = isToday(dueDate);
        
        return {
          ...order,
          dueDate,
          isOverdue,
          isDueToday,
          paymentTerms,
        };
      })
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }, [orders]);

  // Payment status distribution pie chart
  const paymentDistribution = useMemo(() => {
    return [
      { name: 'Paid', value: mtdStats.totalPaid, fill: 'hsl(var(--chart-2))' },
      { name: 'Pending', value: mtdStats.pendingPayment, fill: 'hsl(var(--chart-4))' },
    ].filter(d => d.value > 0);
  }, [mtdStats]);

  return (
    <div className="space-y-6">
      {/* MTD Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <IndianRupee className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">MTD Procurement</p>
                <p className="text-2xl font-bold">₹{(mtdStats.totalProcurement / 100000).toFixed(1)}L</p>
                <p className="text-xs text-muted-foreground">{mtdStats.orderCount} orders</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Payments Made</p>
                <p className="text-2xl font-bold text-green-600">₹{(mtdStats.totalPaid / 100000).toFixed(1)}L</p>
                <p className="text-xs text-muted-foreground">{mtdStats.paymentCount} payments</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <Clock className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Payment</p>
                <p className="text-2xl font-bold text-red-600">₹{(mtdStats.pendingPayment / 100000).toFixed(1)}L</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Due/Overdue</p>
                <p className="text-2xl font-bold text-orange-600">{ordersWithPaymentDue.length}</p>
                <p className="text-xs text-muted-foreground">orders</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Payment Distribution Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Payment Distribution (MTD)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {paymentDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [`₹${value.toLocaleString()}`, '']}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-2">
              {paymentDistribution.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.fill }} />
                  <span className="text-xs text-muted-foreground">{item.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Supplier-wise Breakdown */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Supplier-wise Breakdown (MTD)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={supplierWiseStats} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}K`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 10 }}
                    width={80}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      `₹${value.toLocaleString()}`,
                      name === 'procurement' ? 'Procurement' : name === 'paid' ? 'Paid' : 'Pending'
                    ]}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="paid" stackId="a" fill="hsl(var(--chart-2))" name="paid" />
                  <Bar dataKey="pending" stackId="a" fill="hsl(var(--chart-4))" name="pending" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Orders Due for Payment */}
      {ordersWithPaymentDue.length > 0 && (
        <Card className="border-orange-200 dark:border-orange-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              Supplier Payments Due
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-2">
                {ordersWithPaymentDue.map((order) => (
                  <div
                    key={order.id}
                    className={`p-3 rounded-lg border ${
                      order.isOverdue 
                        ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
                        : order.isDueToday
                        ? 'bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800'
                        : 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{order.order_number}</span>
                          <Badge variant="outline" className={
                            order.isOverdue 
                              ? 'bg-red-500/10 text-red-600 border-red-500/20' 
                              : order.isDueToday
                              ? 'bg-orange-500/10 text-orange-600 border-orange-500/20'
                              : 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
                          }>
                            {order.isOverdue ? 'Overdue' : order.isDueToday ? 'Due Today' : 'Upcoming'}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {order.paymentTerms.replace('_', ' ').toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {order.product_name} • {order.supplier_name}
                        </p>
                        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                          <span>Due: {format(order.dueDate, 'dd MMM yyyy')}</span>
                          <span>Value: ₹{((order.procurement_rate || 0) * order.quantity).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Supplier-wise Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Supplier Payment Summary (MTD)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium">Supplier</th>
                  <th className="text-right py-2 font-medium">Orders</th>
                  <th className="text-right py-2 font-medium">Procurement</th>
                  <th className="text-right py-2 font-medium">Paid</th>
                  <th className="text-right py-2 font-medium">Pending</th>
                </tr>
              </thead>
              <tbody>
                {supplierWiseStats.map((supplier, index) => (
                  <tr key={supplier.id} className="border-b last:border-0">
                    <td className="py-2">{supplier.name}</td>
                    <td className="text-right py-2">{supplier.orderCount}</td>
                    <td className="text-right py-2">₹{supplier.procurement.toLocaleString()}</td>
                    <td className="text-right py-2 text-green-600">₹{supplier.paid.toLocaleString()}</td>
                    <td className="text-right py-2 text-red-600">₹{supplier.pending.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
