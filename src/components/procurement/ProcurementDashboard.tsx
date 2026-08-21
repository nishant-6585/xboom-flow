import { useMemo, useState } from "react";
import { useOrders } from "@/hooks/useOrders";
import { useSuppliers, useSupplierPayments } from "@/hooks/useSuppliers";
import { useImports } from "@/hooks/useImports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { format, subDays, eachDayOfInterval, isSameDay, parseISO, isWithinInterval } from "date-fns";
import { TrendingUp, IndianRupee, Package, Building2, Calendar, Download, FileSpreadsheet, FileText, CalendarCheck, AlertTriangle, Ship } from "lucide-react";
import { exportProcurementAnalyticsToExcel, exportProcurementAnalyticsToPDF, ProcurementAnalyticsExportData } from "@/lib/exportUtils";
import { toast } from "sonner";
import { ExpenseSummaryByOrders } from "./OrderLinkedExpenses";
import { formatINR } from "@/lib/currency";

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export function ProcurementDashboard() {
  const { orders, loading: ordersLoading } = useOrders();
  const { suppliers, loading: suppliersLoading } = useSuppliers();
  const { payments, loading: paymentsLoading } = useSupplierPayments();
  const { imports, loading: importsLoading } = useImports();
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

  /**
   * Imports in the selected window. Previously the dashboard read only orders,
   * so a month spent entirely on imports showed as zero procurement spend.
   * Valued at landed cost in INR, which is comparable with order values.
   */
  const filteredImports = useMemo(() => {
    return imports.filter(imp => {
      const date = imp.order_date ? parseISO(imp.order_date) : parseISO(imp.created_at);
      return isWithinInterval(date, dateInterval);
    });
  }, [imports, dateInterval]);

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

  // Supplier-wise procurement with count
  const supplierWiseProcurement = useMemo(() => {
    const supplierMap = new Map<string, { value: number; count: number }>();
    
    filteredOrders.forEach(order => {
      const supplierName = order.supplier_name || 'Unassigned';
      const value = (order.procurement_rate || 0) * (order.quantity || 1);
      const current = supplierMap.get(supplierName) || { value: 0, count: 0 };
      supplierMap.set(supplierName, { 
        value: current.value + value, 
        count: current.count + 1 
      });
    });

    return Array.from(supplierMap.entries())
      .map(([name, data]) => ({ name, ...data }))
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

  // Summary stats with pending orders and procurement planning
  const stats = useMemo(() => {
    const totalProcurement = filteredOrders.reduce((sum, o) => 
      sum + ((o.procurement_rate || 0) * (o.quantity || 1)), 0
    );
    const totalImportValue = filteredImports.reduce(
      (sum, imp) => sum + (imp.total_landed_cost ?? imp.base_amount ?? 0),
      0
    );
    const totalPayments = filteredPayments.reduce((sum, p) => sum + p.amount, 0);
    const activeSuppliers = new Set(
      [
        ...filteredOrders.map(o => o.supplier_name),
        ...filteredImports.map(i => i.supplier_name),
      ].filter(Boolean)
    ).size;

    const importsInTransit = filteredImports.filter(i =>
      ['shipped', 'in_transit', 'at_port', 'customs_clearance'].includes(i.status)
    ).length;
    
    // Pending orders (not delivery_done or cancelled)
    const pendingOrders = filteredOrders.filter(o => 
      !['delivery_done', 'cancelled'].includes(o.status)
    ).length;
    const completedOrders = filteredOrders.filter(o => o.status === 'delivery_done').length;
    
    // Procurement planning stats - orders with procurement_date set
    const plannedOrders = filteredOrders.filter(o => 
      o.procurement_date && !['delivery_done', 'cancelled'].includes(o.status)
    ).length;
    const unplannedOrders = filteredOrders.filter(o => 
      !o.procurement_date && !['delivery_done', 'cancelled'].includes(o.status)
    ).length;
    
    return {
      totalOrders: filteredOrders.length,
      pendingOrders,
      completedOrders,
      plannedOrders,
      unplannedOrders,
      totalProcurement,
      totalImports: filteredImports.length,
      totalImportValue,
      importsInTransit,
      totalPayments,
      activeSuppliers,
      // Payables now span both rails: order-linked procurement and imports.
      pendingAmount: totalProcurement + totalImportValue - totalPayments,
    };
  }, [filteredOrders, filteredImports, filteredPayments]);

  const loading = ordersLoading || suppliersLoading || paymentsLoading || importsLoading;

  // Prepare export data
  const getExportData = (): ProcurementAnalyticsExportData => {
    const combinedDayWise = dayWiseProcurement.map((d, i) => ({
      date: d.date,
      orders: d.orders,
      value: d.value,
      payments: dayWisePayments[i]?.amount || 0,
    }));

    return {
      dayWise: combinedDayWise,
      supplierWise: supplierWiseProcurement,
      categoryWise: categoryWiseProcurement,
      summary: stats,
    };
  };

  const handleExportExcel = () => {
    exportProcurementAnalyticsToExcel(getExportData(), {
      filename: `procurement-analytics-${format(new Date(), 'yyyy-MM-dd')}`,
      title: "Procurement Analytics Report",
    });
    toast.success("Excel exported successfully");
  };

  const handleExportPDF = () => {
    exportProcurementAnalyticsToPDF(getExportData(), {
      filename: `procurement-analytics-${format(new Date(), 'yyyy-MM-dd')}`,
      title: "Procurement Analytics Report",
      subtitle: `Period: Last ${dateRange} days`,
    });
    toast.success("PDF exported successfully");
  };

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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h3 className="text-lg font-medium flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Analytics Overview
        </h3>
        <div className="flex items-center gap-3">
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Download className="w-4 h-4" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportExcel} className="gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                Export to Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPDF} className="gap-2">
                <FileText className="w-4 h-4" />
                Export to PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Procurement Planning Highlight */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-green-500/50 bg-green-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-500/20 rounded-lg">
                <CalendarCheck className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Planned (Date Set)</p>
                <p className="text-3xl font-bold text-green-600">{stats.plannedOrders}</p>
                <p className="text-xs text-muted-foreground">Orders with procurement date</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-orange-500/50 bg-orange-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-orange-500/20 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Unplanned (Date Missing)</p>
                <p className="text-3xl font-bold text-orange-600">{stats.unplannedOrders}</p>
                <p className="text-xs text-muted-foreground">Orders need planning attention</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
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
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <Ship className="w-5 h-5 text-orange-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Imports</p>
                <p className="text-2xl font-bold">{formatINR(stats.totalImportValue, { compact: true })}</p>
                <p className="text-xs text-muted-foreground">
                  {stats.totalImports} total
                  {stats.importsInTransit > 0 && ` · ${stats.importsInTransit} in transit`}
                </p>
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
                <p className="text-2xl font-bold">{formatINR(stats.totalProcurement, { compact: true })}</p>
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
                <p className="text-2xl font-bold text-green-600">{formatINR(stats.totalPayments, { compact: true })}</p>
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
                <p className="text-2xl font-bold text-red-600">{formatINR(stats.pendingAmount, { compact: true })}</p>
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

      {/* Pending vs Total Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pending vs Total Orders Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Pending vs Completed Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Pending', value: stats.pendingOrders, fill: 'hsl(var(--chart-4))' },
                      { name: 'Completed', value: stats.completedOrders, fill: 'hsl(var(--chart-2))' },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    <Cell fill="hsl(var(--chart-4))" />
                    <Cell fill="hsl(var(--chart-2))" />
                  </Pie>
                  <Tooltip 
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
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(var(--chart-4))' }} />
                <span className="text-sm text-muted-foreground">Pending ({stats.pendingOrders})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(var(--chart-2))' }} />
                <span className="text-sm text-muted-foreground">Completed ({stats.completedOrders})</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Day-wise Procurement Value */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Day-wise Procurement Value</CardTitle>
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
      </div>

      {/* Supplier-wise Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Supplier-wise Procurement Count */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Supplier-wise No. of Procurements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={supplierWiseProcurement} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    type="number"
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    tick={{ fontSize: 10 }}
                    width={100}
                  />
                  <Tooltip 
                    formatter={(value: number) => [value, 'Orders']}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))', 
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--chart-5))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Supplier-wise Procurement Value */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Supplier-wise Procurement Value</CardTitle>
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

      {/* Expenses Summary */}
      <ExpenseSummaryByOrders />
    </div>
  );
}
