import { useMemo } from "react";
import { useOrders } from "@/hooks/useOrders";
import { useSuppliers, useSupplierPayments } from "@/hooks/useSuppliers";
import { useInventoryProcurements } from "@/hooks/useInventoryProcurements";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO, addDays, isBefore, isToday } from "date-fns";
import { IndianRupee, Building2, AlertTriangle, Clock, CheckCircle2, Package, ShoppingCart } from "lucide-react";

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
  const { procurements: inventoryProcurements } = useInventoryProcurements();

  // Current month interval
  const currentMonthInterval = useMemo(() => {
    const now = new Date();
    return {
      start: startOfMonth(now),
      end: endOfMonth(now),
    };
  }, []);

  // MTD Procurement stats - now including inventory procurements
  const mtdStats = useMemo(() => {
    // Order-based procurement
    const mtdOrders = orders.filter(order => {
      const orderDate = parseISO(order.created_at);
      return isWithinInterval(orderDate, currentMonthInterval);
    });

    const orderProcurement = mtdOrders.reduce((sum, o) => 
      sum + ((o.procurement_rate || 0) * (o.quantity || 1)), 0
    );

    // Inventory-based procurement
    const mtdInventoryProcurements = inventoryProcurements.filter(proc => {
      const procDate = parseISO(proc.procurement_date);
      return isWithinInterval(procDate, currentMonthInterval);
    });

    const inventoryProcurement = mtdInventoryProcurements.reduce((sum, p) => 
      sum + (p.total_amount || 0), 0
    );

    const totalProcurement = orderProcurement + inventoryProcurement;

    // MTD Payments
    const mtdPayments = payments.filter(payment => {
      const paymentDate = parseISO(payment.payment_date);
      return isWithinInterval(paymentDate, currentMonthInterval);
    });

    const totalPaid = mtdPayments.reduce((sum, p) => sum + p.amount, 0);

    return {
      totalProcurement,
      orderProcurement,
      inventoryProcurement,
      totalPaid,
      pendingPayment: Math.max(0, totalProcurement - totalPaid),
      orderCount: mtdOrders.length,
      inventoryProcurementCount: mtdInventoryProcurements.length,
      paymentCount: mtdPayments.length,
    };
  }, [orders, payments, inventoryProcurements, currentMonthInterval]);

  // Supplier-wise breakdown for MTD - including inventory procurements
  const supplierWiseStats = useMemo(() => {
    const supplierMap = new Map<string, { 
      name: string; 
      procurement: number; 
      paid: number; 
      pending: number;
      orderCount: number;
      inventoryProcCount: number;
    }>();

    // Filter MTD orders
    const mtdOrders = orders.filter(order => {
      const orderDate = parseISO(order.created_at);
      return isWithinInterval(orderDate, currentMonthInterval);
    });

    // Calculate procurement per supplier from orders
    mtdOrders.forEach(order => {
      const supplierName = order.supplier_name || 'Unassigned';
      const supplierId = order.supplier_id || 'unassigned';
      const value = (order.procurement_rate || 0) * (order.quantity || 1);
      const current = supplierMap.get(supplierId) || { 
        name: supplierName, 
        procurement: 0, 
        paid: 0, 
        pending: 0,
        orderCount: 0,
        inventoryProcCount: 0,
      };
      supplierMap.set(supplierId, {
        ...current,
        procurement: current.procurement + value,
        orderCount: current.orderCount + 1,
      });
    });

    // Filter MTD inventory procurements
    const mtdInventoryProcurements = inventoryProcurements.filter(proc => {
      const procDate = parseISO(proc.procurement_date);
      return isWithinInterval(procDate, currentMonthInterval);
    });

    // Add inventory procurement values
    mtdInventoryProcurements.forEach(proc => {
      if (!proc.supplier_id) return;
      
      const supplierName = proc.supplier_name || 'Unknown';
      const supplierId = proc.supplier_id;
      const value = proc.total_amount || 0;
      const current = supplierMap.get(supplierId) || { 
        name: supplierName, 
        procurement: 0, 
        paid: 0, 
        pending: 0,
        orderCount: 0,
        inventoryProcCount: 0,
      };
      supplierMap.set(supplierId, {
        ...current,
        name: supplierName,
        procurement: current.procurement + value,
        inventoryProcCount: current.inventoryProcCount + 1,
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
        orderCount: 0,
        inventoryProcCount: 0,
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
  }, [orders, payments, suppliers, inventoryProcurements, currentMonthInterval]);

  // Items due for payment (orders + inventory procurements)
  const itemsWithPaymentDue = useMemo(() => {
    const today = new Date();
    const results: Array<{
      id: string;
      type: 'order' | 'inventory';
      name: string;
      identifier: string;
      supplierName: string;
      dueDate: Date;
      isOverdue: boolean;
      isDueToday: boolean;
      paymentTerms: string;
      value: number;
    }> = [];
    
    // Orders due for payment
    orders.forEach(order => {
      if (!order.supplier_name) return;
      
      const paymentTerms = (order as any).supplier_payment_terms;
      if (!paymentTerms) return;
      
      const daysToAdd = PAYMENT_TERMS_DAYS[paymentTerms] || 0;
      if (daysToAdd === 0 && paymentTerms === 'advance') return;
      
      const orderDate = parseISO(order.created_at);
      const dueDate = addDays(orderDate, daysToAdd);
      
      const sevenDaysFromNow = addDays(today, 7);
      if (!isBefore(dueDate, sevenDaysFromNow)) return;
      
      const isOverdue = isBefore(dueDate, today) && !isToday(dueDate);
      const isDueToday = isToday(dueDate);
      
      results.push({
        id: order.id,
        type: 'order',
        name: order.product_name,
        identifier: order.order_number || order.id.slice(0, 8),
        supplierName: order.supplier_name || '',
        dueDate,
        isOverdue,
        isDueToday,
        paymentTerms,
        value: (order.procurement_rate || 0) * order.quantity,
      });
    });

    // Inventory procurements due for payment
    inventoryProcurements.forEach(proc => {
      if (!proc.supplier_name) return;
      if (proc.payment_status === 'paid') return;
      
      const paymentTerms = proc.payment_terms;
      if (!paymentTerms) return;
      
      const daysToAdd = PAYMENT_TERMS_DAYS[paymentTerms] || 0;
      if (daysToAdd === 0 && paymentTerms === 'advance') return;
      
      const procDate = parseISO(proc.procurement_date);
      const dueDate = proc.payment_due_date ? parseISO(proc.payment_due_date) : addDays(procDate, daysToAdd);
      
      const sevenDaysFromNow = addDays(today, 7);
      if (!isBefore(dueDate, sevenDaysFromNow)) return;
      
      const isOverdue = isBefore(dueDate, today) && !isToday(dueDate);
      const isDueToday = isToday(dueDate);
      
      results.push({
        id: proc.id,
        type: 'inventory',
        name: proc.product_name,
        identifier: proc.product_code || proc.id.slice(0, 8),
        supplierName: proc.supplier_name || '',
        dueDate,
        isOverdue,
        isDueToday,
        paymentTerms: paymentTerms || '',
        value: proc.total_amount || 0,
      });
    });

    return results.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }, [orders, inventoryProcurements]);

  // Payment status distribution pie chart
  const paymentDistribution = useMemo(() => {
    return [
      { name: 'Paid', value: mtdStats.totalPaid, fill: 'hsl(var(--chart-2))' },
      { name: 'Pending', value: mtdStats.pendingPayment, fill: 'hsl(var(--chart-4))' },
    ].filter(d => d.value > 0);
  }, [mtdStats]);

  // Procurement source distribution
  const procurementSourceDistribution = useMemo(() => {
    return [
      { name: 'Orders', value: mtdStats.orderProcurement, fill: 'hsl(var(--primary))' },
      { name: 'Inventory', value: mtdStats.inventoryProcurement, fill: 'hsl(var(--chart-3))' },
    ].filter(d => d.value > 0);
  }, [mtdStats]);

  return (
    <div className="space-y-6">
      {/* MTD Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <IndianRupee className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Procurement</p>
                <p className="text-2xl font-bold">₹{(mtdStats.totalProcurement / 100000).toFixed(1)}L</p>
                <p className="text-xs text-muted-foreground">MTD combined</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <ShoppingCart className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Order Procurement</p>
                <p className="text-2xl font-bold">₹{(mtdStats.orderProcurement / 100000).toFixed(1)}L</p>
                <p className="text-xs text-muted-foreground">{mtdStats.orderCount} orders</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <Package className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Inventory Procurement</p>
                <p className="text-2xl font-bold">₹{(mtdStats.inventoryProcurement / 100000).toFixed(1)}L</p>
                <p className="text-xs text-muted-foreground">{mtdStats.inventoryProcurementCount} procurements</p>
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
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Due/Overdue</p>
                <p className="text-2xl font-bold text-orange-600">{itemsWithPaymentDue.length}</p>
                <p className="text-xs text-muted-foreground">items</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Payment Distribution Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Payment Status (MTD)</CardTitle>
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

        {/* Procurement Source Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Procurement Sources (MTD)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={procurementSourceDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {procurementSourceDistribution.map((entry, index) => (
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
              {procurementSourceDistribution.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.fill }} />
                  <span className="text-xs text-muted-foreground">{item.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pending Payment Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="text-center py-4">
                <p className="text-4xl font-bold text-red-600 dark:text-red-400">
                  ₹{(mtdStats.pendingPayment / 100000).toFixed(1)}L
                </p>
                <p className="text-sm text-muted-foreground mt-1">Pending Payment</p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-lg font-semibold">{itemsWithPaymentDue.filter(i => i.isOverdue).length}</p>
                  <p className="text-xs text-red-600">Overdue</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-lg font-semibold">{itemsWithPaymentDue.filter(i => !i.isOverdue).length}</p>
                  <p className="text-xs text-orange-600">Due Soon</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Supplier-wise Breakdown Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Supplier-wise Breakdown (MTD)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
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
                  width={100}
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

      {/* Items Due for Payment */}
      {itemsWithPaymentDue.length > 0 && (
        <Card className="border-orange-200 dark:border-orange-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              Supplier Payments Due
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="all" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="all">All ({itemsWithPaymentDue.length})</TabsTrigger>
                <TabsTrigger value="orders">
                  Orders ({itemsWithPaymentDue.filter(i => i.type === 'order').length})
                </TabsTrigger>
                <TabsTrigger value="inventory">
                  Inventory ({itemsWithPaymentDue.filter(i => i.type === 'inventory').length})
                </TabsTrigger>
              </TabsList>
              
              {['all', 'orders', 'inventory'].map(tab => (
                <TabsContent key={tab} value={tab}>
                  <ScrollArea className="max-h-[300px]">
                    <div className="space-y-2">
                      {itemsWithPaymentDue
                        .filter(item => tab === 'all' || (tab === 'orders' && item.type === 'order') || (tab === 'inventory' && item.type === 'inventory'))
                        .map((item) => (
                          <div
                            key={item.id}
                            className={`p-3 rounded-lg border ${
                              item.isOverdue 
                                ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
                                : item.isDueToday
                                ? 'bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800'
                                : 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant="outline" className="text-xs">
                                    {item.type === 'order' ? (
                                      <><ShoppingCart className="h-3 w-3 mr-1" />Order</>
                                    ) : (
                                      <><Package className="h-3 w-3 mr-1" />Inventory</>
                                    )}
                                  </Badge>
                                  <span className="font-medium text-sm">{item.identifier}</span>
                                  <Badge variant="outline" className={
                                    item.isOverdue 
                                      ? 'bg-red-500/10 text-red-600 border-red-500/20' 
                                      : item.isDueToday
                                      ? 'bg-orange-500/10 text-orange-600 border-orange-500/20'
                                      : 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
                                  }>
                                    {item.isOverdue ? 'Overdue' : item.isDueToday ? 'Due Today' : 'Upcoming'}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">
                                    {item.paymentTerms.replace('_', ' ').toUpperCase()}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {item.name} • {item.supplierName}
                                </p>
                                <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                                  <span>Due: {format(item.dueDate, 'dd MMM yyyy')}</span>
                                  <span>Value: ₹{item.value.toLocaleString()}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
              ))}
            </Tabs>
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
                  <th className="text-right py-2 font-medium">Inv. Proc.</th>
                  <th className="text-right py-2 font-medium">Procurement</th>
                  <th className="text-right py-2 font-medium">Paid</th>
                  <th className="text-right py-2 font-medium">Pending</th>
                </tr>
              </thead>
              <tbody>
                {supplierWiseStats.map((supplier) => (
                  <tr key={supplier.id} className="border-b last:border-0">
                    <td className="py-2">{supplier.name}</td>
                    <td className="text-right py-2">{supplier.orderCount}</td>
                    <td className="text-right py-2">{supplier.inventoryProcCount}</td>
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
