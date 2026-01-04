import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Order } from '@/hooks/useOrders';
import { TrendingUp, TrendingDown, DollarSign, Package, Calendar } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfDay, isWithinInterval, subDays } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

interface OrderProfitAnalyticsProps {
  orders: Order[];
}

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

export function OrderProfitAnalytics({ orders }: OrderProfitAnalyticsProps) {
  const analytics = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const last30Days = subDays(now, 30);

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

    // Month-to-date profit
    const mtdOrders = ordersWithProfitCalc.filter(o => 
      isWithinInterval(new Date(o.created_at), { start: monthStart, end: monthEnd })
    );
    const mtdProfit = mtdOrders.reduce((sum, o) => sum + o.profit, 0);
    const mtdRevenue = mtdOrders.reduce((sum, o) => sum + o.revenue, 0);

    // Daily profit for last 30 days
    const dailyProfitMap = new Map<string, { date: string; profit: number; revenue: number; orders: number }>();
    
    for (let i = 0; i < 30; i++) {
      const day = subDays(now, i);
      const dayStr = format(day, 'yyyy-MM-dd');
      dailyProfitMap.set(dayStr, { 
        date: format(day, 'MMM dd'), 
        profit: 0, 
        revenue: 0,
        orders: 0 
      });
    }

    ordersWithProfitCalc.forEach(order => {
      const orderDate = format(new Date(order.created_at), 'yyyy-MM-dd');
      const existing = dailyProfitMap.get(orderDate);
      if (existing) {
        existing.profit += order.profit;
        existing.revenue += order.revenue;
        existing.orders += 1;
      }
    });

    const dailyProfitData = Array.from(dailyProfitMap.values()).reverse();

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
      .slice(0, 10); // Top 10 categories

    // Profit margin
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return {
      totalProfit,
      totalRevenue,
      totalOrders,
      mtdProfit,
      mtdRevenue,
      mtdOrders: mtdOrders.length,
      dailyProfitData,
      categoryProfitData,
      profitMargin,
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(analytics.totalRevenue)}</div>
            <p className="text-xs text-muted-foreground">
              {analytics.totalOrders} orders with pricing
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MTD Profit</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${analytics.mtdProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(analytics.mtdProfit)}
            </div>
            <p className="text-xs text-muted-foreground">
              {analytics.mtdOrders} orders this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MTD Revenue</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(analytics.mtdRevenue)}</div>
            <p className="text-xs text-muted-foreground">
              Month to date
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
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
                <BarChart data={analytics.dailyProfitData}>
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
    </div>
  );
}
