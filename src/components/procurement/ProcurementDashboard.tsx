import { useMemo, useState } from "react";
import { useOrders } from "@/hooks/useOrders";
import { useSuppliers, useSupplierPayments } from "@/hooks/useSuppliers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";
import { format, subDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO, isWithinInterval } from "date-fns";
import { TrendingUp, IndianRupee, Package, Building2, Calendar } from "lucide-react";

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export function ProcurementDashboard() {
  const { orders, loading: ordersLoading } = useOrders();
  const { suppliers, loading: suppliersLoading } = useSuppliers();
  const { payments, loading: paymentsLoading } = useSupplierPayments();
  const [dateRange, setDateRange] = useState<string>("30");

  const dateInterval = useMemo(() => {
    const days = parseInt(dateRange);
    const end = new Date();
    const start = subDays(end, days);
    return { start, end };
  }, [dateRange]);

  // Filter data by date range
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const orderDate = parseISO(order.created_at);
      return isWithinInterval(orderDate, dateInterval);
    });
  }, [orders, dateInterval]);

  const filteredPayments = useMemo(() => {
    return payments.filter(payment => {
      const paymentDate = parseISO(payment.payment_date);
      return isWithinInterval(paymentDate, dateInterval);
    });
  }, [payments, dateInterval]);

  // Day-wise procurement data
  const dayWiseProcurement = useMemo(() => {
    const days = eachDayOfInterval(dateInterval);
    return days.map(day => {
      const dayOrders = filteredOrders.filter(o => 
        isSameDay(parseISO(o.created_at), day)
      );
      const totalValue = dayOrders.reduce((sum, o) => 
        sum + ((o.procurement_rate || 0) * (o.quantity || 1)), 0
      );
      return {
        date: format(day, 'dd MMM'),
        orders: dayOrders.length,
        value: totalValue,
      };
    });
  }, [filteredOrders, dateInterval]);

  // Day-wise payments data
  const dayWisePayments = useMemo(() => {
    const days = eachDayOfInterval(dateInterval);
    return days.map(day => {
      const dayPayments = filteredPayments.filter(p => 
        isSameDay(parseISO(p.payment_date), day)
      );
      const totalAmount = dayPayments.reduce((sum, p) => sum + p.amount, 0);
      return {
        date: format(day, 'dd MMM'),
        amount: totalAmount,
        count: dayPayments.length,
      };
    });
  }, [filteredPayments, dateInterval]);

  // Supplier-wise procurement
  const supplierWiseProcurement = useMemo(() => {
    const supplierMap = new Map<string, number>();
    
    filteredOrders.forEach(order => {
      const supplierName = order.supplier_name || 'Unassigned';
      const value = (order.procurement_rate || 0) * (order.quantity || 1);
      supplierMap.set(supplierName, (supplierMap.get(supplierName) || 0) + value);
    });

    return Array.from(supplierMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filteredOrders]);

  // Category-wise procurement
  const categoryWiseProcurement = useMemo(() => {
    const categoryMap = new Map<string, { value: number; count: number }>();
    
    filteredOrders.forEach(order => {
      const category = order.product_category || 'Uncategorized';
      const value = (order.procurement_rate || 0) * (order.quantity || 1);
      const current = categoryMap.get(category) || { value: 0, count: 0 };
      categoryMap.set(category, { 
        value: current.value + value, 
        count: current.count + 1 
      });
    });

    return Array.from(categoryMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.value - a.value);
  }, [filteredOrders]);

  // Summary stats
  const stats = useMemo(() => {
    const totalProcurement = filteredOrders.reduce((sum, o) => 
      sum + ((o.procurement_rate || 0) * (o.quantity || 1)), 0
    );
    const totalPayments = filteredPayments.reduce((sum, p) => sum + p.amount, 0);
    const activeSuppliers = new Set(filteredOrders.map(o => o.supplier_name).filter(Boolean)).size;
    
    return {
      totalOrders: filteredOrders.length,
      totalProcurement,
      totalPayments,
      activeSuppliers,
      pendingAmount: totalProcurement - totalPayments,
    };
  }, [filteredOrders, filteredPayments]);

  const loading = ordersLoading || suppliersLoading || paymentsLoading;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-pulse text-muted-foreground">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Date Range Filter */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Analytics Overview
        </h3>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="60">Last 60 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Package className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Orders</p>
                <p className="text-2xl font-bold">{stats.totalOrders}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <TrendingUp className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Procurement</p>
                <p className="text-2xl font-bold">₹{(stats.totalProcurement / 100000).toFixed(1)}L</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <IndianRupee className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Paid</p>
                <p className="text-2xl font-bold text-green-600">₹{(stats.totalPayments / 100000).toFixed(1)}L</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <IndianRupee className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-red-600">₹{(stats.pendingAmount / 100000).toFixed(1)}L</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <Building2 className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Suppliers</p>
                <p className="text-2xl font-bold">{stats.activeSuppliers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Day-wise Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Day-wise Procurement */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Day-wise Procurement</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dayWiseProcurement}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 10 }} 
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}K`}
                  />
                  <Tooltip 
                    formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Value']}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))', 
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Day-wise Payments */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Day-wise Payments to Suppliers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dayWisePayments}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 10 }} 
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}K`}
                  />
                  <Tooltip 
                    formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Amount']}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))', 
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="amount" 
                    stroke="hsl(var(--chart-2))" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--chart-2))' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Supplier-wise and Category-wise */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Supplier-wise Procurement */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Top Suppliers by Procurement Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={supplierWiseProcurement} layout="vertical">
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
                    formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Value']}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))', 
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="value" fill="hsl(var(--chart-3))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Category-wise Procurement */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Category-wise Procurement</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center justify-center">
              {categoryWiseProcurement.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryWiseProcurement}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      labelLine={{ stroke: 'hsl(var(--muted-foreground))' }}
                    >
                      {categoryWiseProcurement.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Value']}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--popover))', 
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground">No data available</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Details Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Category-wise Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {categoryWiseProcurement.map((cat, index) => (
              <div 
                key={cat.name}
                className="p-3 rounded-lg border bg-muted/30"
              >
                <Badge 
                  variant="outline" 
                  className="mb-2"
                  style={{ 
                    backgroundColor: `${COLORS[index % COLORS.length]}20`,
                    borderColor: COLORS[index % COLORS.length]
                  }}
                >
                  {cat.name}
                </Badge>
                <p className="text-lg font-bold">₹{(cat.value / 1000).toFixed(1)}K</p>
                <p className="text-xs text-muted-foreground">{cat.count} orders</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
