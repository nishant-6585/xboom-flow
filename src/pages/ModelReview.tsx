import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Activity, TrendingDown, ShieldAlert, RefreshCw, Loader2, AlertTriangle, 
  CheckCircle, Target, BarChart3, Info, Calendar
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, 
  Tooltip as RechartsTooltip, BarChart, Bar, Cell, ScatterChart, Scatter, ZAxis,
  Legend
} from 'recharts';
import { format, startOfWeek, parseISO, differenceInDays } from 'date-fns';
import { toast } from 'sonner';

interface Forecast {
  id: string;
  product_id: string;
  product_name: string;
  product_category: string | null;
  predicted_daily_demand: number;
  days_to_stockout: number | null;
  current_stock: number | null;
  confidence: string;
  historical_data_days: number;
  forecast_date: string;
  avg_consumption_30d: number | null;
  avg_consumption_60d: number | null;
  avg_consumption_90d: number | null;
}

interface ForecastAccuracy {
  id: string;
  product_name: string;
  product_id: string;
  predicted_demand: number;
  actual_demand: number;
  mape_percent: number | null;
  logged_at: string;
  model_version: string;
}

interface RiskScore {
  id: string;
  invoice_id: string;
  customer_company: string | null;
  customer_name: string;
  risk_score: number;
  risk_level: string;
  predicted_days_to_pay: number | null;
  factors: Record<string, any>;
  scored_at: string;
}

interface RiskAccuracy {
  id: string;
  customer_company: string | null;
  predicted_risk_level: string;
  predicted_days_to_pay: number | null;
  actual_days_to_pay: number;
  was_late: boolean;
  logged_at: string;
}

export default function ModelReview() {
  const [loading, setLoading] = useState(true);
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [forecastAccuracy, setForecastAccuracy] = useState<ForecastAccuracy[]>([]);
  const [riskScores, setRiskScores] = useState<RiskScore[]>([]);
  const [riskAccuracy, setRiskAccuracy] = useState<RiskAccuracy[]>([]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [fRes, faRes, rsRes, raRes] = await Promise.all([
        supabase.from('demand_forecasts').select('*').order('forecast_date', { ascending: false }).limit(500) as any,
        supabase.from('forecast_accuracy_log').select('*').order('logged_at', { ascending: false }).limit(200) as any,
        supabase.from('payment_risk_scores').select('*').order('scored_at', { ascending: false }).limit(500) as any,
        supabase.from('payment_risk_accuracy_log').select('*').order('logged_at', { ascending: false }).limit(200) as any,
      ]);
      
      // Dedupe forecasts to latest per product
      const fMap = new Map<string, Forecast>();
      for (const f of (fRes.data || [])) {
        if (!fMap.has(f.product_name)) fMap.set(f.product_name, f);
      }
      setForecasts(Array.from(fMap.values()));
      setForecastAccuracy(faRes.data || []);

      // Dedupe risk scores to latest per invoice
      const rMap = new Map<string, RiskScore>();
      for (const s of (rsRes.data || [])) {
        if (!rMap.has(s.invoice_id)) rMap.set(s.invoice_id, s);
      }
      setRiskScores(Array.from(rMap.values()));
      setRiskAccuracy(raRes.data || []);
    } catch (err) {
      console.error('Error fetching model review data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // === DEMAND FORECAST METRICS ===
  const demandMetrics = useMemo(() => {
    const withMAPE = forecastAccuracy.filter(a => a.mape_percent !== null);
    const overallMAPE = withMAPE.length > 0
      ? withMAPE.reduce((s, a) => s + (a.mape_percent || 0), 0) / withMAPE.length
      : null;

    // MAPE by category (use product grouping from forecasts)
    const categoryMap = new Map<string, string>();
    forecasts.forEach(f => categoryMap.set(f.product_name, f.product_category || 'Uncategorized'));

    const categoryMAPE = new Map<string, number[]>();
    withMAPE.forEach(a => {
      const cat = categoryMap.get(a.product_name) || 'Uncategorized';
      if (!categoryMAPE.has(cat)) categoryMAPE.set(cat, []);
      categoryMAPE.get(cat)!.push(a.mape_percent || 0);
    });
    const perCategory = Array.from(categoryMAPE.entries()).map(([cat, vals]) => ({
      category: cat,
      mape: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
      count: vals.length,
    })).sort((a, b) => b.mape - a.mape);

    // Top error SKUs
    const skuErrors = new Map<string, number[]>();
    withMAPE.forEach(a => {
      if (!skuErrors.has(a.product_name)) skuErrors.set(a.product_name, []);
      skuErrors.get(a.product_name)!.push(a.mape_percent || 0);
    });
    const topErrorSKUs = Array.from(skuErrors.entries())
      .map(([name, vals]) => ({
        name,
        avgMAPE: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
        count: vals.length,
      }))
      .sort((a, b) => b.avgMAPE - a.avgMAPE)
      .slice(0, 10);

    // Weekly MAPE trend
    const weeklyMap = new Map<string, number[]>();
    withMAPE.forEach(a => {
      const week = format(startOfWeek(parseISO(a.logged_at)), 'dd MMM');
      if (!weeklyMap.has(week)) weeklyMap.set(week, []);
      weeklyMap.get(week)!.push(a.mape_percent || 0);
    });
    const weeklyTrend = Array.from(weeklyMap.entries())
      .map(([week, vals]) => ({
        week,
        mape: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
      }))
      .reverse()
      .slice(-8);

    // Insufficient data products
    const lowDataProducts = forecasts.filter(f => f.historical_data_days < 30);

    return { overallMAPE, perCategory, topErrorSKUs, weeklyTrend, lowDataProducts, totalChecks: withMAPE.length };
  }, [forecastAccuracy, forecasts]);

  // === PAYMENT RISK METRICS ===
  const riskMetrics = useMemo(() => {
    const total = riskAccuracy.length;
    const highRiskPredictions = riskAccuracy.filter(a => a.predicted_risk_level === 'high' || a.predicted_risk_level === 'critical');
    const falsePositives = highRiskPredictions.filter(a => !a.was_late);
    const falsePositiveRate = highRiskPredictions.length > 0
      ? Math.round((falsePositives.length / highRiskPredictions.length) * 100) : null;
    
    const correctPredictions = riskAccuracy.filter(a => {
      if (a.predicted_risk_level === 'high' || a.predicted_risk_level === 'critical') return a.was_late;
      return !a.was_late;
    });
    const accuracyRate = total > 0 ? Math.round((correctPredictions.length / total) * 100) : null;

    const latePayments = riskAccuracy.filter(a => a.was_late).length;

    // Scatter data: predicted vs actual days
    const scatterData = riskAccuracy
      .filter(a => a.predicted_days_to_pay !== null)
      .map(a => ({
        predicted: a.predicted_days_to_pay,
        actual: a.actual_days_to_pay,
        customer: a.customer_company || 'Unknown',
        wasLate: a.was_late,
      }));

    // Confusion matrix
    const matrix = {
      truePositive: riskAccuracy.filter(a => (a.predicted_risk_level === 'high' || a.predicted_risk_level === 'critical') && a.was_late).length,
      falsePositive: falsePositives.length,
      trueNegative: riskAccuracy.filter(a => (a.predicted_risk_level === 'low' || a.predicted_risk_level === 'medium') && !a.was_late).length,
      falseNegative: riskAccuracy.filter(a => (a.predicted_risk_level === 'low' || a.predicted_risk_level === 'medium') && a.was_late).length,
    };

    // Distribution
    const distribution = ['low', 'medium', 'high', 'critical'].map(level => ({
      level: level.charAt(0).toUpperCase() + level.slice(1),
      count: riskScores.filter(s => s.risk_level === level).length,
    }));

    return { total, falsePositiveRate, accuracyRate, latePayments, scatterData, matrix, distribution, minDataMet: total >= 30 };
  }, [riskAccuracy, riskScores]);

  // Readiness assessment
  const demandReady = demandMetrics.overallMAPE !== null && demandMetrics.overallMAPE < 30 && demandMetrics.totalChecks >= 4;
  const riskReady = riskMetrics.accuracyRate !== null && riskMetrics.falsePositiveRate !== null && 
    riskMetrics.falsePositiveRate < 25 && riskMetrics.total >= 30;

  const riskBadgeClass = (level: string) => {
    const map: Record<string, string> = {
      Low: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      Medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      High: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
      Critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    };
    return map[level] || '';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              Weekly Model Review
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Calibration lab · Shadow Mode predictions · {format(new Date(), 'EEEE, dd MMM yyyy')}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchAll}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>

        {/* Graduation Readiness */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4" />
              Shadow Mode Exit Criteria
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 rounded-lg border">
                {demandReady ? (
                  <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0" />
                )}
                <div>
                  <p className="font-medium text-sm">Demand Forecast</p>
                  <p className="text-xs text-muted-foreground">
                    MAPE: {demandMetrics.overallMAPE !== null ? `${Math.round(demandMetrics.overallMAPE)}%` : 'N/A'} (target &lt;30%)
                    · {demandMetrics.totalChecks} checks (need 4+)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg border">
                {riskReady ? (
                  <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0" />
                )}
                <div>
                  <p className="font-medium text-sm">Payment Risk</p>
                  <p className="text-xs text-muted-foreground">
                    FP Rate: {riskMetrics.falsePositiveRate !== null ? `${riskMetrics.falsePositiveRate}%` : 'N/A'} (target &lt;25%)
                    · {riskMetrics.total} validated (need 30+)
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="demand" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="demand" className="gap-2">
              <TrendingDown className="h-4 w-4" />
              Demand Forecast
            </TabsTrigger>
            <TabsTrigger value="risk" className="gap-2">
              <ShieldAlert className="h-4 w-4" />
              Payment Risk
            </TabsTrigger>
          </TabsList>

          {/* === DEMAND FORECAST TAB === */}
          <TabsContent value="demand" className="space-y-6">
            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className={`text-3xl font-bold ${demandMetrics.overallMAPE !== null && demandMetrics.overallMAPE <= 30 ? 'text-green-600' : demandMetrics.overallMAPE !== null ? 'text-red-600' : ''}`}>
                    {demandMetrics.overallMAPE !== null ? `${Math.round(demandMetrics.overallMAPE)}%` : '—'}
                  </p>
                  <p className="text-sm text-muted-foreground">Overall MAPE</p>
                  <p className="text-xs text-muted-foreground">Target: &lt; 30%</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl font-bold">{demandMetrics.totalChecks}</p>
                  <p className="text-sm text-muted-foreground">Accuracy Checks</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl font-bold">{forecasts.length}</p>
                  <p className="text-sm text-muted-foreground">Products Tracked</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl font-bold text-yellow-600">{demandMetrics.lowDataProducts.length}</p>
                  <p className="text-sm text-muted-foreground">Insufficient Data</p>
                  <p className="text-xs text-muted-foreground">&lt; 30 days history</p>
                </CardContent>
              </Card>
            </div>

            {/* MAPE Trend */}
            {demandMetrics.weeklyTrend.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">MAPE Trend (Weekly)</CardTitle>
                  <CardDescription>Target line at 30%</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={demandMetrics.weeklyTrend}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                        <YAxis domain={[0, 'auto']} tick={{ fontSize: 12 }} />
                        <RechartsTooltip />
                        <Line type="monotone" dataKey="mape" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} name="MAPE %" />
                        {/* Target reference line at 30% */}
                        <Line type="monotone" dataKey={() => 30} stroke="#ef4444" strokeDasharray="5 5" strokeWidth={1} dot={false} name="Target (30%)" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Top Error SKUs */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Top Forecast Errors by SKU</CardTitle>
                  <CardDescription>SKUs with highest avg MAPE</CardDescription>
                </CardHeader>
                <CardContent>
                  {demandMetrics.topErrorSKUs.length > 0 ? (
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={demandMetrics.topErrorSKUs.slice(0, 8)} layout="vertical" margin={{ left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" tick={{ fontSize: 11 }} />
                          <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                          <RechartsTooltip />
                          <Bar dataKey="avgMAPE" name="Avg MAPE %" radius={[0, 4, 4, 0]}>
                            {demandMetrics.topErrorSKUs.slice(0, 8).map((entry, i) => (
                              <Cell key={i} fill={entry.avgMAPE > 30 ? '#ef4444' : entry.avgMAPE > 20 ? '#f97316' : '#22c55e'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8 text-sm">No accuracy data yet</p>
                  )}
                </CardContent>
              </Card>

              {/* MAPE by Category */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">MAPE by Category</CardTitle>
                  <CardDescription>Accuracy breakdown per product group</CardDescription>
                </CardHeader>
                <CardContent>
                  {demandMetrics.perCategory.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-center">Avg MAPE</TableHead>
                          <TableHead className="text-center">Checks</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {demandMetrics.perCategory.map(c => (
                          <TableRow key={c.category}>
                            <TableCell className="font-medium">{c.category}</TableCell>
                            <TableCell className="text-center">{c.mape}%</TableCell>
                            <TableCell className="text-center">{c.count}</TableCell>
                            <TableCell>
                              <Badge className={c.mape <= 30 ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'}>
                                {c.mape <= 30 ? 'On Track' : 'Needs Review'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-center text-muted-foreground py-8 text-sm">No accuracy data yet</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Low data products */}
            {demandMetrics.lowDataProducts.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    Products with Insufficient History
                  </CardTitle>
                  <CardDescription>Less than 30 days data — forecasts may be unreliable</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-center">History (days)</TableHead>
                        <TableHead className="text-center">Current Stock</TableHead>
                        <TableHead>Confidence</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {demandMetrics.lowDataProducts.map(f => (
                        <TableRow key={f.id}>
                          <TableCell className="font-medium">{f.product_name}</TableCell>
                          <TableCell><Badge variant="outline">{f.product_category || '-'}</Badge></TableCell>
                          <TableCell className="text-center">{f.historical_data_days}</TableCell>
                          <TableCell className="text-center">{f.current_stock}</TableCell>
                          <TableCell><Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">{f.confidence}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Forecast vs Actuals table */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Forecast vs Actuals Log</CardTitle>
                <CardDescription>Most recent accuracy measurements</CardDescription>
              </CardHeader>
              <CardContent>
                {forecastAccuracy.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-center">Predicted</TableHead>
                        <TableHead className="text-center">Actual</TableHead>
                        <TableHead className="text-center">MAPE %</TableHead>
                        <TableHead>Model</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {forecastAccuracy.slice(0, 25).map(a => (
                        <TableRow key={a.id}>
                          <TableCell>{format(parseISO(a.logged_at), 'dd MMM yyyy')}</TableCell>
                          <TableCell className="font-medium">{a.product_name}</TableCell>
                          <TableCell className="text-center">{a.predicted_demand.toFixed(1)}</TableCell>
                          <TableCell className="text-center">{a.actual_demand}</TableCell>
                          <TableCell className="text-center">
                            {a.mape_percent !== null ? (
                              <span className={a.mape_percent <= 30 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                                {a.mape_percent.toFixed(1)}%
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{a.model_version}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center text-muted-foreground py-8 text-sm">
                    No accuracy data yet. Accuracy is measured weekly by comparing past forecasts to actual consumption.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* === PAYMENT RISK TAB === */}
          <TabsContent value="risk" className="space-y-6">
            {/* Minimum data warning */}
            {!riskMetrics.minDataMet && (
              <div className="flex items-center gap-3 p-4 rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-900/10 dark:border-yellow-800">
                <Info className="h-5 w-5 text-yellow-600 shrink-0" />
                <div>
                  <p className="font-medium text-sm">Insufficient validation data</p>
                  <p className="text-xs text-muted-foreground">
                    {riskMetrics.total} of 30 required validated predictions. Metrics below are directional only.
                  </p>
                </div>
              </div>
            )}

            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className={`text-3xl font-bold ${riskMetrics.accuracyRate !== null && riskMetrics.accuracyRate >= 60 ? 'text-green-600' : ''}`}>
                    {riskMetrics.accuracyRate !== null ? `${riskMetrics.accuracyRate}%` : '—'}
                  </p>
                  <p className="text-sm text-muted-foreground">Accuracy Rate</p>
                  <p className="text-xs text-muted-foreground">Target: &gt; 60%</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className={`text-3xl font-bold ${riskMetrics.falsePositiveRate !== null && riskMetrics.falsePositiveRate < 25 ? 'text-green-600' : riskMetrics.falsePositiveRate !== null ? 'text-red-600' : ''}`}>
                    {riskMetrics.falsePositiveRate !== null ? `${riskMetrics.falsePositiveRate}%` : '—'}
                  </p>
                  <p className="text-sm text-muted-foreground">False Positive Rate</p>
                  <p className="text-xs text-muted-foreground">Target: &lt; 25%</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl font-bold">{riskMetrics.total}</p>
                  <p className="text-sm text-muted-foreground">Validated</p>
                  <p className="text-xs text-muted-foreground">Need: 30+</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl font-bold">{riskScores.length}</p>
                  <p className="text-sm text-muted-foreground">Invoices Scored</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Confusion matrix */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Confusion Matrix</CardTitle>
                  <CardDescription>Predicted risk vs actual outcome</CardDescription>
                </CardHeader>
                <CardContent>
                  {riskMetrics.total > 0 ? (
                    <div className="grid grid-cols-3 gap-0 text-center text-sm">
                      <div></div>
                      <div className="p-2 font-medium border-b">Actually Late</div>
                      <div className="p-2 font-medium border-b">Actually On Time</div>
                      <div className="p-2 font-medium border-r">Predicted High Risk</div>
                      <div className="p-3 bg-green-50 dark:bg-green-900/20 border font-bold text-green-700">
                        {riskMetrics.matrix.truePositive}
                        <span className="block text-xs font-normal text-muted-foreground">True Positive</span>
                      </div>
                      <div className="p-3 bg-red-50 dark:bg-red-900/20 border font-bold text-red-700">
                        {riskMetrics.matrix.falsePositive}
                        <span className="block text-xs font-normal text-muted-foreground">False Positive</span>
                      </div>
                      <div className="p-2 font-medium border-r">Predicted Low Risk</div>
                      <div className="p-3 bg-red-50 dark:bg-red-900/20 border font-bold text-red-700">
                        {riskMetrics.matrix.falseNegative}
                        <span className="block text-xs font-normal text-muted-foreground">False Negative</span>
                      </div>
                      <div className="p-3 bg-green-50 dark:bg-green-900/20 border font-bold text-green-700">
                        {riskMetrics.matrix.trueNegative}
                        <span className="block text-xs font-normal text-muted-foreground">True Negative</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8 text-sm">No validated predictions yet</p>
                  )}
                </CardContent>
              </Card>

              {/* Risk distribution */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Current Risk Distribution</CardTitle>
                  <CardDescription>Active invoice risk levels</CardDescription>
                </CardHeader>
                <CardContent>
                  {riskMetrics.distribution.some(d => d.count > 0) ? (
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={riskMetrics.distribution}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="level" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 12 }} />
                          <RechartsTooltip />
                          <Bar dataKey="count" name="Invoices" radius={[4, 4, 0, 0]}>
                            {riskMetrics.distribution.map((entry, i) => (
                              <Cell key={i} fill={
                                entry.level === 'Low' ? '#22c55e' :
                                entry.level === 'Medium' ? '#eab308' :
                                entry.level === 'High' ? '#f97316' : '#ef4444'
                              } />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8 text-sm">No scores yet</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Predicted vs Actual scatter */}
            {riskMetrics.scatterData.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Predicted vs Actual Days to Pay</CardTitle>
                  <CardDescription>Points on diagonal = perfect prediction</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" dataKey="predicted" name="Predicted Days" tick={{ fontSize: 12 }} label={{ value: 'Predicted Days', position: 'bottom', offset: 0 }} />
                        <YAxis type="number" dataKey="actual" name="Actual Days" tick={{ fontSize: 12 }} label={{ value: 'Actual Days', angle: -90, position: 'insideLeft' }} />
                        <RechartsTooltip cursor={{ strokeDasharray: '3 3' }} />
                        <Scatter name="Payments" data={riskMetrics.scatterData} fill="hsl(var(--primary))">
                          {riskMetrics.scatterData.map((entry, i) => (
                            <Cell key={i} fill={entry.wasLate ? '#ef4444' : '#22c55e'} />
                          ))}
                        </Scatter>
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Validation log */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Validation Log</CardTitle>
                <CardDescription>Prediction vs reality when invoices are paid</CardDescription>
              </CardHeader>
              <CardContent>
                {riskAccuracy.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Predicted Risk</TableHead>
                        <TableHead className="text-center">Predicted Days</TableHead>
                        <TableHead className="text-center">Actual Days</TableHead>
                        <TableHead>Outcome</TableHead>
                        <TableHead>Match?</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {riskAccuracy.slice(0, 25).map(a => {
                        const isCorrect = (a.predicted_risk_level === 'high' || a.predicted_risk_level === 'critical') ? a.was_late : !a.was_late;
                        return (
                          <TableRow key={a.id}>
                            <TableCell>{format(parseISO(a.logged_at), 'dd MMM yyyy')}</TableCell>
                            <TableCell>{a.customer_company || '-'}</TableCell>
                            <TableCell>
                              <Badge className={riskBadgeClass(a.predicted_risk_level.charAt(0).toUpperCase() + a.predicted_risk_level.slice(1))}>
                                {a.predicted_risk_level}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">{a.predicted_days_to_pay || '-'}</TableCell>
                            <TableCell className="text-center">{a.actual_days_to_pay}</TableCell>
                            <TableCell>
                              <Badge variant={a.was_late ? 'destructive' : 'secondary'}>
                                {a.was_late ? 'Late' : 'On Time'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {isCorrect ? (
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              ) : (
                                <AlertTriangle className="h-4 w-4 text-red-600" />
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center text-muted-foreground py-8 text-sm">
                    No accuracy data yet. Accuracy is logged when invoices are marked as paid.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
