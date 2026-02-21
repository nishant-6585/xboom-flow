import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, Target, AlertTriangle, IndianRupee, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface ForecastData {
  id: string;
  customer_name: string;
  customer_company: string;
  product_name: string;
  expected_price: number | null;
  probability: number | null;
  weighted_revenue: number;
  deal_stage: string;
  sales_person_name: string;
  expected_closure_date: string | null;
}

export function WeightedForecastWidget() {
  const [data, setData] = useState<ForecastData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchForecast = async () => {
      const { data: forecast, error } = await supabase
        .from('sales_weighted_forecast_view')
        .select('*')
        .order('weighted_revenue', { ascending: false });

      if (!error) {
        setData((forecast || []) as ForecastData[]);
      }
      setLoading(false);
    };
    fetchForecast();
  }, []);

  const totalPipeline = data.reduce((sum, d) => sum + (d.expected_price || 0), 0);
  const weightedForecast = data.reduce((sum, d) => sum + (d.weighted_revenue || 0), 0);
  const activeDeals = data.filter(d => d.deal_stage === 'active').length;
  const overdueDeals = data.filter(d => d.deal_stage === 'overdue').length;

  const formatCurrency = (amount: number) => {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(0)}K`;
    return `₹${amount.toFixed(0)}`;
  };

  // Group by sales person for chart
  const salesPersonData = data.reduce<Record<string, { name: string; pipeline: number; weighted: number }>>((acc, d) => {
    const name = d.sales_person_name || 'Unknown';
    if (!acc[name]) acc[name] = { name, pipeline: 0, weighted: 0 };
    acc[name].pipeline += d.expected_price || 0;
    acc[name].weighted += d.weighted_revenue || 0;
    return acc;
  }, {});

  const chartData = Object.values(salesPersonData)
    .sort((a, b) => b.weighted - a.weighted)
    .slice(0, 8);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <IndianRupee className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Total Pipeline</span>
            </div>
            <p className="text-xl font-bold">{formatCurrency(totalPipeline)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Weighted Forecast</span>
            </div>
            <p className="text-xl font-bold text-primary">{formatCurrency(weightedForecast)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Active Deals</span>
            </div>
            <p className="text-xl font-bold">{activeDeals}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-xs text-muted-foreground">Overdue</span>
            </div>
            <p className="text-xl font-bold text-destructive">{overdueDeals}</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Weighted Forecast by Sales Person</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    formatCurrency(value),
                    name === 'weighted' ? 'Weighted' : 'Pipeline',
                  ]}
                />
                <Bar dataKey="pipeline" fill="hsl(var(--muted-foreground))" opacity={0.3} radius={[4, 4, 0, 0]} />
                <Bar dataKey="weighted" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Top Deals */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Top Weighted Deals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.slice(0, 5).map(deal => (
              <div key={deal.id} className="flex items-center justify-between p-2 rounded-lg border">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{deal.customer_company || deal.customer_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{deal.product_name}</p>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="font-semibold text-sm text-primary">{formatCurrency(deal.weighted_revenue)}</p>
                  <Badge variant={deal.deal_stage === 'overdue' ? 'destructive' : 'secondary'} className="text-[10px]">
                    {deal.probability || 50}%
                  </Badge>
                </div>
              </div>
            ))}
            {data.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No pipeline data yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
