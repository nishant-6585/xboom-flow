import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOrderProcurementLinks, OrderProcurementLinkWithDetails } from '@/hooks/useOrderProcurementLinks';
import { useInventoryProcurementPayments } from '@/hooks/useInventoryProcurementPayments';
import { useAuth } from '@/hooks/useAuth';
import { format, parseISO } from 'date-fns';
import { 
  Link2, Package, IndianRupee, Search, Loader2, Trash2, 
  CheckCircle2, Clock, AlertTriangle, TrendingUp, BarChart3,
  FileText, CreditCard, Wand2
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, Area, AreaChart
} from 'recharts';
import { AutoMatchProcurements } from './AutoMatchProcurements';

export function OrderProcurementTracker() {
  const { links, loading, deleteLink, refetch } = useOrderProcurementLinks();
  const { getPaymentsForProcurement, getTotalPaidForProcurement } = useInventoryProcurementPayments();
  const { role } = useAuth();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [autoMatchOpen, setAutoMatchOpen] = useState(false);

  const canManage = role === 'admin' || role === 'supply_chain' || role === 'finance';

  // Filter links by search
  const filteredLinks = useMemo(() => {
    if (!search) return links;
    const searchLower = search.toLowerCase();
    return links.filter(link => 
      link.order?.order_number?.toLowerCase().includes(searchLower) ||
      link.order?.product_name.toLowerCase().includes(searchLower) ||
      link.order?.customer_company.toLowerCase().includes(searchLower) ||
      link.procurement?.procurement_number?.toLowerCase().includes(searchLower) ||
      link.procurement?.product_name.toLowerCase().includes(searchLower) ||
      link.procurement?.supplier_name?.toLowerCase().includes(searchLower)
    );
  }, [links, search]);

  // Calculate analytics
  const analytics = useMemo(() => {
    const totalLinks = links.length;
    let totalOrderValue = 0;
    let totalProcurementValue = 0;
    let totalPaymentReceived = 0;
    let totalPaymentMade = 0;

    const orderPaymentStatusCount: Record<string, number> = {};
    const procurementPaymentStatusCount: Record<string, number> = {};
    const supplierDistribution: Record<string, number> = {};

    links.forEach(link => {
      if (link.order) {
        totalOrderValue += link.order.total_sales_amount || 0;
        totalPaymentReceived += link.order.amount_paid || 0;
        const status = link.order.payment_status || 'pending';
        orderPaymentStatusCount[status] = (orderPaymentStatusCount[status] || 0) + 1;
      }

      if (link.procurement) {
        totalProcurementValue += link.procurement.total_amount || 0;
        totalPaymentMade += getTotalPaidForProcurement(link.inventory_procurement_id);
        const status = link.procurement.payment_status;
        procurementPaymentStatusCount[status] = (procurementPaymentStatusCount[status] || 0) + 1;
        
        const supplier = link.procurement.supplier_name || 'Unknown';
        supplierDistribution[supplier] = (supplierDistribution[supplier] || 0) + 1;
      }
    });

    const profit = totalPaymentReceived - totalPaymentMade;
    const pendingOrderPayment = totalOrderValue - totalPaymentReceived;
    const pendingProcurementPayment = totalProcurementValue - totalPaymentMade;

    return {
      totalLinks,
      totalOrderValue,
      totalProcurementValue,
      totalPaymentReceived,
      totalPaymentMade,
      profit,
      pendingOrderPayment,
      pendingProcurementPayment,
      orderPaymentStatusCount,
      procurementPaymentStatusCount,
      supplierDistribution,
    };
  }, [links, getTotalPaidForProcurement]);

  // Prepare chart data
  const orderPaymentChartData = useMemo(() => {
    return Object.entries(analytics.orderPaymentStatusCount).map(([status, count]) => ({
      name: status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' '),
      value: count,
      fill: status === 'paid' ? 'hsl(var(--chart-1))' : 
            status === 'partial' ? 'hsl(var(--chart-2))' : 
            status === 'pending' ? 'hsl(var(--chart-3))' : 'hsl(var(--chart-4))',
    }));
  }, [analytics]);

  const procurementPaymentChartData = useMemo(() => {
    return Object.entries(analytics.procurementPaymentStatusCount).map(([status, count]) => ({
      name: status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' '),
      value: count,
      fill: status === 'paid' ? 'hsl(var(--chart-1))' : 
            status === 'partial' ? 'hsl(var(--chart-2))' : 
            status === 'pending' ? 'hsl(var(--chart-3))' : 'hsl(var(--chart-4))',
    }));
  }, [analytics]);

  const supplierChartData = useMemo(() => {
    return Object.entries(analytics.supplierDistribution)
      .map(([supplier, count]) => ({ name: supplier, value: count }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [analytics]);

  const getOrderPaymentBadge = (status: string | null) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"><CheckCircle2 className="h-3 w-3 mr-1" />Paid</Badge>;
      case 'partial':
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"><Clock className="h-3 w-3 mr-1" />Partial</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  const getProcurementPaymentBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"><CheckCircle2 className="h-3 w-3 mr-1" />Paid</Badge>;
      case 'partial':
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"><Clock className="h-3 w-3 mr-1" />Partial</Badge>;
      case 'overdue':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"><AlertTriangle className="h-3 w-3 mr-1" />Overdue</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header with Auto-Match Button */}
        {canManage && (
          <div className="flex justify-end">
            <Button onClick={() => setAutoMatchOpen(true)} variant="outline" className="gap-2">
              <Wand2 className="h-4 w-4" />
              Auto-Match
            </Button>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
            <TabsTrigger value="overview" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Analytics</span>
            </TabsTrigger>
            <TabsTrigger value="details" className="gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Details</span>
            </TabsTrigger>
          </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <Link2 className="h-4 w-4" />
                  Linked Orders
                </div>
                <p className="text-2xl font-bold">{analytics.totalLinks}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <IndianRupee className="h-4 w-4" />
                  Order Value
                </div>
                <p className="text-2xl font-bold">₹{(analytics.totalOrderValue / 100000).toFixed(1)}L</p>
                <p className="text-xs text-muted-foreground">
                  Received: ₹{(analytics.totalPaymentReceived / 100000).toFixed(1)}L
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <Package className="h-4 w-4" />
                  Procurement Value
                </div>
                <p className="text-2xl font-bold">₹{(analytics.totalProcurementValue / 100000).toFixed(1)}L</p>
                <p className="text-xs text-muted-foreground">
                  Paid: ₹{(analytics.totalPaymentMade / 100000).toFixed(1)}L
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <TrendingUp className="h-4 w-4" />
                  Net Position
                </div>
                <p className={`text-2xl font-bold ${analytics.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ₹{(Math.abs(analytics.profit) / 100000).toFixed(1)}L
                </p>
                <p className="text-xs text-muted-foreground">
                  {analytics.profit >= 0 ? 'Profit' : 'Loss'} on payments
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Quick Summary Table */}
          {filteredLinks.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Link2 className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="font-medium text-lg">No Order-Linked Procurements</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  No procurements have been linked to orders yet. Link procurements when creating them.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Recent Links</CardTitle>
                <CardDescription>Last 10 order-procurement links</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Procurement</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Payment Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLinks.slice(0, 10).map((link) => (
                      <TableRow key={link.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{link.order?.order_number || '-'}</p>
                            <p className="text-xs text-muted-foreground">{link.order?.product_name}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{link.procurement?.procurement_number || '-'}</Badge>
                        </TableCell>
                        <TableCell>
                          {link.procurement?.supplier_name || '-'}
                        </TableCell>
                        <TableCell className="text-right">{link.quantity_used}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {getOrderPaymentBadge(link.order?.payment_status || null)}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Order Payment Status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Order Payment Status</CardTitle>
              </CardHeader>
              <CardContent>
                {orderPaymentChartData.length > 0 ? (
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={orderPaymentChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {orderPaymentChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                    No data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Procurement Payment Status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Procurement Payment Status</CardTitle>
              </CardHeader>
              <CardContent>
                {procurementPaymentChartData.length > 0 ? (
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={procurementPaymentChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {procurementPaymentChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                    No data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Supplier Distribution */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Procurements by Supplier</CardTitle>
              </CardHeader>
              <CardContent>
                {supplierChartData.length > 0 ? (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={supplierChartData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis dataKey="name" type="category" width={120} fontSize={12} />
                        <Tooltip />
                        <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Payment Flow */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Payment Summary</CardTitle>
                <CardDescription>Overview of payments received from orders vs payments made to suppliers</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1">Payment Received</p>
                    <p className="text-xl font-bold text-green-600 dark:text-green-400">
                      ₹{analytics.totalPaymentReceived.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1">Pending from Orders</p>
                    <p className="text-xl font-bold text-orange-600 dark:text-orange-400">
                      ₹{analytics.pendingOrderPayment.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1">Payment Made</p>
                    <p className="text-xl font-bold text-red-600 dark:text-red-400">
                      ₹{analytics.totalPaymentMade.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1">Pending to Suppliers</p>
                    <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                      ₹{analytics.pendingProcurementPayment.toLocaleString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Details Tab */}
        <TabsContent value="details" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle>All Linked Orders & Procurements</CardTitle>
                  <CardDescription>
                    Complete list of order-procurement links with payment details
                  </CardDescription>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search..."
                    className="pl-9"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredLinks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {search ? 'No matching records found' : 'No linked procurements yet'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order No.</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Procurement No.</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead className="text-right">Order Amount</TableHead>
                        <TableHead className="text-right">Amount Received</TableHead>
                        <TableHead className="text-right">Procurement Amount</TableHead>
                        <TableHead className="text-right">Amount Paid</TableHead>
                        <TableHead>Linked At</TableHead>
                        {canManage && <TableHead className="text-right">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLinks.map((link) => {
                        const procurementPaid = getTotalPaidForProcurement(link.inventory_procurement_id);
                        
                        return (
                          <TableRow key={link.id}>
                            <TableCell>
                              <Badge variant="outline">{link.order?.order_number || '-'}</Badge>
                            </TableCell>
                            <TableCell className="max-w-[150px] truncate">
                              {link.order?.product_name || link.procurement?.product_name || '-'}
                            </TableCell>
                            <TableCell>{link.order?.customer_company || '-'}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">{link.procurement?.procurement_number || '-'}</Badge>
                            </TableCell>
                            <TableCell>{link.procurement?.supplier_name || '-'}</TableCell>
                            <TableCell className="text-right">
                              ₹{(link.order?.total_sales_amount || 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-green-600 dark:text-green-400 font-medium">
                                ₹{(link.order?.amount_paid || 0).toLocaleString()}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              ₹{(link.procurement?.total_amount || 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-orange-600 dark:text-orange-400 font-medium">
                                ₹{procurementPaid.toLocaleString()}
                              </span>
                            </TableCell>
                            <TableCell>
                              {format(parseISO(link.linked_at), 'dd MMM yyyy')}
                            </TableCell>
                            {canManage && (
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => deleteLink(link.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        </Tabs>
      </div>

      <AutoMatchProcurements
        open={autoMatchOpen}
        onOpenChange={setAutoMatchOpen}
        onMatchesCreated={refetch}
      />
    </>
  );
}
