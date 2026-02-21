import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrendingDown, BarChart3, RefreshCw, Loader2, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell, Tooltip as RechartsTooltip, LineChart, Line } from 'recharts';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface Forecast {
  id: string;
  product_name: string;
  product_category: string | null;
  predicted_daily_demand: number;
  days_to_stockout: number | null;
  recommended_reorder_qty: number | null;
  current_stock: number;
  confidence: string;
  historical_data_days: number;
  forecast_date: string;
  avg_consumption_30d: number;
  avg_consumption_60d: number;
  avg_consumption_90d: number;
}

interface AccuracyLog {
  id: string;
  product_name: string;
  predicted_demand: number;
  actual_demand: number;
  mape_percent: number | null;
  logged_at: string;
}

export function DemandForecastWidget() {
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [accuracyLogs, setAccuracyLogs] = useState<AccuracyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Get latest forecast per product (most recent forecast_date)
      const { data: forecastData } = await supabase
        .from('demand_forecasts')
        .select('*')
        .order('forecast_date', { ascending: false })
        .limit(200) as any;

      // Dedupe to latest per product
      const latestMap = new Map<string, Forecast>();
      for (const f of (forecastData || [])) {
        if (!latestMap.has(f.product_name)) {
          latestMap.set(f.product_name, f);
        }
      }
      setForecasts(Array.from(latestMap.values()));

      const { data: accData } = await supabase
        .from('forecast_accuracy_log')
        .select('*')
        .order('logged_at', { ascending: false })
        .limit(100) as any;

      setAccuracyLogs(accData || []);
    } catch (err) {
      console.error('Error loading forecasts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const runForecast = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('demand-forecast');
      if (error) throw error;
      toast.success(`Forecast complete: ${data?.forecasts || 0} products analyzed`);
      await fetchData();
    } catch (err: any) {
      toast.error('Forecast failed: ' + (err.message || 'Unknown error'));
    } finally {
      setRunning(false);
    }
  };

  const atRiskProducts = forecasts.filter(f => f.days_to_stockout !== null && f.days_to_stockout <= 14);
  const avgMAPE = accuracyLogs.length > 0
    ? Math.round(accuracyLogs.filter(a => a.mape_percent !== null).reduce((sum, a) => sum + (a.mape_percent || 0), 0) / Math.max(1, accuracyLogs.filter(a => a.mape_percent !== null).length))
    : null;

  const confidenceColor = (c: string) => {
    if (c === 'high') return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    if (c === 'medium') return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
    return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
  };

  const stockoutColor = (days: number | null) => {
    if (days === null) return '#94a3b8';
    if (days <= 7) return '#ef4444';
    if (days <= 14) return '#f97316';
    if (days <= 30) return '#eab308';
    return '#22c55e';
  };

  const stockoutChartData = forecasts
    .filter(f => f.days_to_stockout !== null && f.predicted_daily_demand > 0)
    .sort((a, b) => (a.days_to_stockout || 999) - (b.days_to_stockout || 999))
    .slice(0, 15)
    .map(f => ({
      name: f.product_name.length > 20 ? f.product_name.slice(0, 18) + '…' : f.product_name,
      days: f.days_to_stockout,
      color: stockoutColor(f.days_to_stockout),
    }));

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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-primary" />
              Demand Forecast
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="outline" className="text-xs font-normal gap-1">
                      <Info className="h-3 w-3" />
                      Shadow Mode
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs text-sm">Predicted · Not yet validated. Forecasts are informational only and do not trigger any automated actions.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
            <CardDescription>
              Rolling 30-day mean · v1 baseline model
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={runForecast} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Run Forecast
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {forecasts.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No forecasts generated yet. Click "Run Forecast" to start.</p>
        ) : (
          <Tabs defaultValue="risk" className="space-y-4">
            <TabsList>
              <TabsTrigger value="risk">Stockout Risk ({atRiskProducts.length})</TabsTrigger>
              <TabsTrigger value="all">All Forecasts</TabsTrigger>
              <TabsTrigger value="performance">Model Performance</TabsTrigger>
            </TabsList>

            <TabsContent value="risk" className="space-y-4">
              {/* Stockout chart */}
              {stockoutChartData.length > 0 && (
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stockoutChartData} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" label={{ value: 'Days to Stockout', position: 'bottom', offset: -5 }} />
                      <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
                      <RechartsTooltip />
                      <Bar dataKey="days" radius={[0, 4, 4, 0]}>
                        {stockoutChartData.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {atRiskProducts.length === 0 ? (
                <div className="flex items-center gap-2 p-4 bg-green-50 dark:bg-green-900/10 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <p className="text-sm">No products at risk of stockout within 14 days.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-center">Stock</TableHead>
                      <TableHead className="text-center">Daily Demand</TableHead>
                      <TableHead className="text-center">Days to Stockout</TableHead>
                      <TableHead className="text-center">Reorder Qty</TableHead>
                      <TableHead>Confidence</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {atRiskProducts.map(f => (
                      <TableRow key={f.id}>
                        <TableCell className="font-medium">{f.product_name}</TableCell>
                        <TableCell className="text-center">{f.current_stock}</TableCell>
                        <TableCell className="text-center">{f.predicted_daily_demand.toFixed(1)}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {f.days_to_stockout?.toFixed(0)}d
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center font-semibold">{f.recommended_reorder_qty || '-'}</TableCell>
                        <TableCell>
                          <Badge className={confidenceColor(f.confidence)}>{f.confidence}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="all">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-center">Stock</TableHead>
                    <TableHead className="text-center">30d Avg</TableHead>
                    <TableHead className="text-center">60d Avg</TableHead>
                    <TableHead className="text-center">90d Avg</TableHead>
                    <TableHead className="text-center">Stockout</TableHead>
                    <TableHead>Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {forecasts.map(f => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">{f.product_name}</TableCell>
                      <TableCell><Badge variant="outline">{f.product_category || '-'}</Badge></TableCell>
                      <TableCell className="text-center">{f.current_stock}</TableCell>
                      <TableCell className="text-center">{f.avg_consumption_30d?.toFixed(1) || '0'}</TableCell>
                      <TableCell className="text-center">{f.avg_consumption_60d?.toFixed(1) || '0'}</TableCell>
                      <TableCell className="text-center">{f.avg_consumption_90d?.toFixed(1) || '0'}</TableCell>
                      <TableCell className="text-center">
                        {f.days_to_stockout !== null ? (
                          <span style={{ color: stockoutColor(f.days_to_stockout) }} className="font-semibold">
                            {f.days_to_stockout.toFixed(0)}d
                          </span>
                        ) : (
                          <span className="text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={confidenceColor(f.confidence)}>{f.confidence}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="performance" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-3xl font-bold">{avgMAPE !== null ? `${avgMAPE}%` : '—'}</p>
                    <p className="text-sm text-muted-foreground">Avg MAPE</p>
                    <p className="text-xs text-muted-foreground mt-1">Target: &lt; 30%</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-3xl font-bold">{accuracyLogs.length}</p>
                    <p className="text-sm text-muted-foreground">Accuracy Checks</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-3xl font-bold">{forecasts.length}</p>
                    <p className="text-sm text-muted-foreground">Products Tracked</p>
                  </CardContent>
                </Card>
              </div>

              {accuracyLogs.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-center">Predicted</TableHead>
                      <TableHead className="text-center">Actual</TableHead>
                      <TableHead className="text-center">MAPE %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accuracyLogs.slice(0, 20).map(a => (
                      <TableRow key={a.id}>
                        <TableCell>{format(new Date(a.logged_at), 'dd MMM yyyy')}</TableCell>
                        <TableCell className="font-medium">{a.product_name}</TableCell>
                        <TableCell className="text-center">{a.predicted_demand.toFixed(1)}</TableCell>
                        <TableCell className="text-center">{a.actual_demand}</TableCell>
                        <TableCell className="text-center">
                          {a.mape_percent !== null ? (
                            <span className={a.mape_percent <= 30 ? 'text-green-600' : 'text-red-600'}>
                              {a.mape_percent.toFixed(1)}%
                            </span>
                          ) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No accuracy data yet. Accuracy is measured weekly by comparing past forecasts to actual consumption.
                </p>
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
