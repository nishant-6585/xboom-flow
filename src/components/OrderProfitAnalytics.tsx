import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Order } from '@/hooks/useOrders';
import { TrendingUp, DollarSign, Package, Calendar, ShoppingCart, IndianRupee } from 'lucide-react';
import { format, startOfMonth, endOfMonth, isWithinInterval, subDays } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, ComposedChart, Area } from 'recharts';
interface OrderProfitAnalyticsProps {
  orders: Order[];
  onCardClick?: (filter: { type: string; value: string }) => void;
}

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

export function OrderProfitAnalytics({ orders, onCardClick }: OrderProfitAnalyticsProps) {
  const analytics = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    // All orders (excluding cancelled) for order count analytics
    const allValidOrders = orders.filter(o => o.status !== 'cancelled');

    // Filter orders with valid profit data
    const ordersWithProfit = orders.filter(o => 
      o.selling_price !== null && 
      o.procurement_rate !== null &&
      o.status !== 'cancelled'
    );

    // Calculate profit for each order
    const ordersWithProfitCalc = ordersWithProfit.map(o => ({
      ...o,
      profit: ((o.selling_price || 0) - (o.procurement_rate || 0)) * o.quantity,
      revenue: (o.selling_price || 0) * o.quantity,
      cost: (o.procurement_rate || 0) * o.quantity,
    }));

    // Total profit
    const totalProfit = ordersWithProfitCalc.reduce((sum, o) => sum + o.profit, 0);
    const totalRevenue = ordersWithProfitCalc.reduce((sum, o) => sum + o.revenue, 0);
    const totalOrders = ordersWithProfitCalc.length;

    // Total order value (including orders without profit data)
    const totalOrderValue = allValidOrders.reduce((sum, o) => sum + ((o.total_sales_amount || 0)), 0);
    const totalOrderCount = allValidOrders.length;

    // Month-to-date
    const mtdOrders = ordersWithProfitCalc.filter(o => 
      isWithinInterval(new Date(o.created_at), { start: monthStart, end: monthEnd })
    );
    const mtdProfit = mtdOrders.reduce((sum, o) => sum + o.profit, 0);
    const mtdRevenue = mtdOrders.reduce((sum, o) => sum + o.revenue, 0);

    const mtdAllOrders = allValidOrders.filter(o => 
      isWithinInterval(new Date(o.created_at), { start: monthStart, end: monthEnd })
    );
    const mtdOrderValue = mtdAllOrders.reduce((sum, o) => sum + ((o.total_sales_amount || 0)), 0);

    // Daily data for last 30 days
    const dailyDataMap = new Map<string, { 
      date: string; 
      profit: number; 
      revenue: number; 
      orderCount: number;
      orderValue: number;
    }>();
    
    for (let i = 0; i < 30; i++) {
      const day = subDays(now, i);
      const dayStr = format(day, 'yyyy-MM-dd');
      dailyDataMap.set(dayStr, { 
        date: format(day, 'MMM dd'), 
        profit: 0, 
        revenue: 0,
        orderCount: 0,
        orderValue: 0
      });
    }

    // Populate profit/revenue data
    ordersWithProfitCalc.forEach(order => {
      const orderDate = format(new Date(order.created_at), 'yyyy-MM-dd');
      const existing = dailyDataMap.get(orderDate);
      if (existing) {
        existing.profit += order.profit;
        existing.revenue += order.revenue;
      }
    });

    // Populate order count and value data
    allValidOrders.forEach(order => {
      const orderDate = format(new Date(order.created_at), 'yyyy-MM-dd');
      const existing = dailyDataMap.get(orderDate);
      if (existing) {
        existing.orderCount += 1;
        existing.orderValue += (order.total_sales_amount || 0);
      }
    });

    const dailyData = Array.from(dailyDataMap.values()).reverse();

    // Category-wise profit
    const categoryProfitMap = new Map<string, { name: string; profit: number; revenue: number; orders: number }>();
    
    ordersWithProfitCalc.forEach(order => {
      const category = order.product_category || 'Uncategorized';
      const existing = categoryProfitMap.get(category);
      if (existing) {
        existing.profit += order.profit;
        existing.revenue += order.revenue;
        existing.orders += 1;
      } else {
        categoryProfitMap.set(category, {
          name: category,
          profit: order.profit,
          revenue: order.revenue,
          orders: 1,
        });
      }
    });

    const categoryProfitData = Array.from(categoryProfitMap.values())
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 10);

    // Model-wise (product_name) report - uses all valid orders
    const modelDataMap = new Map<string, { name: string; code: string; category: string; quantity: number; orderValue: number; orders: number; profit: number; revenue: number; cost: number }>();

    allValidOrders.forEach(order => {
      const model = order.product_name || 'Unknown';
      const existing = modelDataMap.get(model);
      const orderValue = order.total_sales_amount || 0;
      // profit data if available
      const hasProfit = order.selling_price !== null && order.procurement_rate !== null;
      const profit = hasProfit ? ((order.selling_price || 0) - (order.procurement_rate || 0)) * order.quantity : 0;
      const revenue = hasProfit ? (order.selling_price || 0) * order.quantity : 0;
      const cost = hasProfit ? (order.procurement_rate || 0) * order.quantity : 0;

      if (existing) {
        existing.quantity += order.quantity;
        existing.orderValue += orderValue;
        existing.orders += 1;
        existing.profit += profit;
        existing.revenue += revenue;
        existing.cost += cost;
      } else {
        modelDataMap.set(model, {
          name: model,
          code: order.product_code || '',
          category: order.product_category || '',
          quantity: order.quantity,
          orderValue,
          orders: 1,
          profit,
          revenue,
          cost,
        });
      }
    });

    const modelData = Array.from(modelDataMap.values())
      .sort((a, b) => b.orderValue - a.orderValue);

    // Profit margin
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return {
      totalProfit,
      totalRevenue,
      totalOrders,
      totalOrderCount,
      totalOrderValue,
      mtdProfit,
      mtdRevenue,
      mtdOrders: mtdOrders.length,
      mtdOrderCount: mtdAllOrders.length,
      mtdOrderValue,
      dailyData,
      categoryProfitData,
      profitMargin,
      modelData,
    };
  }, [orders]);

  const formatCurrency = (value: number) => {
    if (value >= 10000000) {
      return `₹${(value / 10000000).toFixed(2)}Cr`;
    } else if (value >= 100000) {
      return `₹${(value / 100000).toFixed(2)}L`;
    } else if (value >= 1000) {
      return `₹${(value / 1000).toFixed(1)}K`;
    }
    return `₹${value.toLocaleString('en-IN')}`;
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card 
          className={`${onCardClick ? 'cursor-pointer hover:scale-105 hover:shadow-lg transition-all hover:ring-2 hover:ring-primary/50' : ''}`}
          onClick={() => onCardClick?.({ type: 'view', value: 'all' })}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{analytics.totalOrderCount}</div>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>

        <Card 
          className={`${onCardClick ? 'cursor-pointer hover:scale-105 hover:shadow-lg transition-all hover:ring-2 hover:ring-primary/50' : ''}`}
          onClick={() => onCardClick?.({ type: 'view', value: 'all' })}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Order Value</CardTitle>
            <IndianRupee className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{formatCurrency(analytics.totalOrderValue)}</div>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>

        <Card 
          className={`${onCardClick ? 'cursor-pointer hover:scale-105 hover:shadow-lg transition-all hover:ring-2 hover:ring-primary/50' : ''}`}
          onClick={() => onCardClick?.({ type: 'view', value: 'profitable' })}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${analytics.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(analytics.totalProfit)}
            </div>
            <p className="text-xs text-muted-foreground">
              {analytics.profitMargin.toFixed(1)}% margin
            </p>
          </CardContent>
        </Card>

        <Card 
          className={`${onCardClick ? 'cursor-pointer hover:scale-105 hover:shadow-lg transition-all hover:ring-2 hover:ring-primary/50' : ''}`}
          onClick={() => onCardClick?.({ type: 'mtd', value: 'orders' })}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MTD Orders</CardTitle>
            <Calendar className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{analytics.mtdOrderCount}</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card 
          className={`${onCardClick ? 'cursor-pointer hover:scale-105 hover:shadow-lg transition-all hover:ring-2 hover:ring-primary/50' : ''}`}
          onClick={() => onCardClick?.({ type: 'mtd', value: 'value' })}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MTD Order Value</CardTitle>
            <Package className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-500">{formatCurrency(analytics.mtdOrderValue)}</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card 
          className={`${onCardClick ? 'cursor-pointer hover:scale-105 hover:shadow-lg transition-all hover:ring-2 hover:ring-primary/50' : ''}`}
          onClick={() => onCardClick?.({ type: 'mtd', value: 'profit' })}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MTD Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${analytics.mtdProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {formatCurrency(analytics.mtdProfit)}
            </div>
            <p className="text-xs text-muted-foreground">
              {analytics.mtdOrders} orders
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Order Count and Value Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Number of Orders Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Number of Orders (Last 30 Days)</CardTitle>
            <CardDescription>Daily order count trend</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.dailyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip 
                    formatter={(value: number) => [value, 'Orders']}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar 
                    dataKey="orderCount" 
                    fill="hsl(var(--chart-2))"
                    radius={[4, 4, 0, 0]}
                    name="Orders"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Order Value Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Order Value (Last 30 Days)</CardTitle>
            <CardDescription>Daily order value trend</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={analytics.dailyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    tickFormatter={(value) => formatCurrency(value)}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip 
                    formatter={(value: number) => [formatCurrency(value), 'Order Value']}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="orderValue" 
                    fill="hsl(var(--chart-4))"
                    fillOpacity={0.3}
                    stroke="hsl(var(--chart-4))"
                    strokeWidth={2}
                    name="Value"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="orderValue" 
                    stroke="hsl(var(--chart-4))"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Profit Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Daily Profit Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Daily Profit (Last 30 Days)</CardTitle>
            <CardDescription>Profit trend over the past month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.dailyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    tickFormatter={(value) => formatCurrency(value)}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip 
                    formatter={(value: number) => [formatCurrency(value), 'Profit']}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar 
                    dataKey="profit" 
                    fill="hsl(var(--chart-1))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Category Profit Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Profit by Category</CardTitle>
            <CardDescription>Top categories by profit contribution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {analytics.categoryProfitData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analytics.categoryProfitData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="profit"
                      nameKey="name"
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      labelLine={false}
                    >
                      {analytics.categoryProfitData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => [formatCurrency(value), 'Profit']}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No profit data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Table */}
      <Card>
        <CardHeader>
          <CardTitle>Category Performance</CardTitle>
          <CardDescription>Detailed breakdown by product category</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 font-medium">Category</th>
                  <th className="text-right py-3 px-2 font-medium">Orders</th>
                  <th className="text-right py-3 px-2 font-medium">Revenue</th>
                  <th className="text-right py-3 px-2 font-medium">Profit</th>
                  <th className="text-right py-3 px-2 font-medium">Margin</th>
                </tr>
              </thead>
              <tbody>
                {analytics.categoryProfitData.map((cat, index) => {
                  const margin = cat.revenue > 0 ? (cat.profit / cat.revenue) * 100 : 0;
                  return (
                    <tr key={cat.name} className="border-b last:border-0">
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          {cat.name}
                        </div>
                      </td>
                      <td className="text-right py-3 px-2">{cat.orders}</td>
                      <td className="text-right py-3 px-2">{formatCurrency(cat.revenue)}</td>
                      <td className={`text-right py-3 px-2 font-medium ${cat.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(cat.profit)}
                      </td>
                      <td className="text-right py-3 px-2">{margin.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {/* Model Wise Report */}
      <Card>
        <CardHeader>
          <CardTitle>Model Wise Report</CardTitle>
          <CardDescription>Performance breakdown by product model</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 font-medium">#</th>
                  <th className="text-left py-3 px-2 font-medium">Model</th>
                  <th className="text-left py-3 px-2 font-medium">Code</th>
                  <th className="text-left py-3 px-2 font-medium">Category</th>
                  <th className="text-right py-3 px-2 font-medium">Orders</th>
                  <th className="text-right py-3 px-2 font-medium">Qty</th>
                  <th className="text-right py-3 px-2 font-medium">Order Value</th>
                  <th className="text-right py-3 px-2 font-medium">Revenue</th>
                  <th className="text-right py-3 px-2 font-medium">Cost</th>
                  <th className="text-right py-3 px-2 font-medium">Profit</th>
                  <th className="text-right py-3 px-2 font-medium">Margin</th>
                </tr>
              </thead>
              <tbody>
                {analytics.modelData.map((model, index) => {
                  const margin = model.revenue > 0 ? (model.profit / model.revenue) * 100 : 0;
                  return (
                    <tr key={model.name} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 px-2 text-muted-foreground">{index + 1}</td>
                      <td className="py-3 px-2 font-medium">{model.name}</td>
                      <td className="py-3 px-2 text-muted-foreground">{model.code || '—'}</td>
                      <td className="py-3 px-2 text-muted-foreground">{model.category || '—'}</td>
                      <td className="text-right py-3 px-2">{model.orders}</td>
                      <td className="text-right py-3 px-2">{model.quantity}</td>
                      <td className="text-right py-3 px-2">{formatCurrency(model.orderValue)}</td>
                      <td className="text-right py-3 px-2">{model.revenue > 0 ? formatCurrency(model.revenue) : '—'}</td>
                      <td className="text-right py-3 px-2">{model.cost > 0 ? formatCurrency(model.cost) : '—'}</td>
                      <td className={`text-right py-3 px-2 font-medium ${model.profit > 0 ? 'text-green-600' : model.profit < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                        {model.revenue > 0 ? formatCurrency(model.profit) : '—'}
                      </td>
                      <td className="text-right py-3 px-2">{model.revenue > 0 ? `${margin.toFixed(1)}%` : '—'}</td>
                    </tr>
                  );
                })}
                {analytics.modelData.length === 0 && (
                  <tr>
                    <td colSpan={11} className="text-center py-6 text-muted-foreground">No order data available</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
