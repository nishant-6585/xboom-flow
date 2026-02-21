import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ShieldAlert, RefreshCw, Loader2, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip as RechartsTooltip } from 'recharts';
import { format } from 'date-fns';
import { toast } from 'sonner';

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

interface AccuracyLog {
  id: string;
  customer_company: string | null;
  predicted_risk_level: string;
  actual_days_to_pay: number;
  was_late: boolean;
  logged_at: string;
}

const RISK_COLORS: Record<string, string> = {
  low: '#22c55e',
  medium: '#eab308',
  high: '#f97316',
  critical: '#ef4444',
};

const riskBadgeClass = (level: string) => {
  const map: Record<string, string> = {
    low: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  };
  return map[level] || '';
};

export function PaymentRiskWidget() {
  const [scores, setScores] = useState<RiskScore[]>([]);
  const [accuracyLogs, setAccuracyLogs] = useState<AccuracyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Get latest score per invoice
      const { data: scoreData } = await supabase
        .from('payment_risk_scores')
        .select('*')
        .order('scored_at', { ascending: false })
        .limit(500) as any;

      // Dedupe to latest per invoice
      const latestMap = new Map<string, RiskScore>();
      for (const s of (scoreData || [])) {
        if (!latestMap.has(s.invoice_id)) {
          latestMap.set(s.invoice_id, s);
        }
      }
      setScores(Array.from(latestMap.values()));

      const { data: accData } = await supabase
        .from('payment_risk_accuracy_log')
        .select('*')
        .order('logged_at', { ascending: false })
        .limit(100) as any;

      setAccuracyLogs(accData || []);
    } catch (err) {
      console.error('Error loading risk scores:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const runScoring = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('payment-risk-scoring');
      if (error) throw error;
      toast.success(`Scoring complete: ${data?.scored || 0} invoices analyzed`);
      await fetchData();
    } catch (err: any) {
      toast.error('Scoring failed: ' + (err.message || 'Unknown error'));
    } finally {
      setRunning(false);
    }
  };

  // Distribution data for pie chart
  const distribution = ['low', 'medium', 'high', 'critical'].map(level => ({
    name: level.charAt(0).toUpperCase() + level.slice(1),
    value: scores.filter(s => s.risk_level === level).length,
    color: RISK_COLORS[level],
  })).filter(d => d.value > 0);

  // Accuracy metrics
  const totalAccuracy = accuracyLogs.length;
  const correctPredictions = accuracyLogs.filter(a => {
    if (a.predicted_risk_level === 'high' || a.predicted_risk_level === 'critical') return a.was_late;
    return !a.was_late;
  }).length;
  const accuracyRate = totalAccuracy > 0 ? Math.round((correctPredictions / totalAccuracy) * 100) : null;
  const falsePositiveRate = totalAccuracy > 0
    ? Math.round(
        (accuracyLogs.filter(a =>
          (a.predicted_risk_level === 'high' || a.predicted_risk_level === 'critical') && !a.was_late
        ).length /
        Math.max(1, accuracyLogs.filter(a => a.predicted_risk_level === 'high' || a.predicted_risk_level === 'critical').length)) * 100
      )
    : null;

  const highRiskAccounts = scores.filter(s => s.risk_level === 'high' || s.risk_level === 'critical');

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
              <ShieldAlert className="h-5 w-5 text-primary" />
              Payment Risk Scores
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="outline" className="text-xs font-normal gap-1">
                      <Info className="h-3 w-3" />
                      Shadow Mode
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs text-sm">Predicted · Not yet validated. Risk scores are informational only and do not trigger any automated actions.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
            <CardDescription>
              Heuristic model v1 · Based on payment history patterns
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={runScoring} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Run Scoring
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {scores.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No risk scores generated yet. Click "Run Scoring" to start.</p>
        ) : (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="high-risk">High Risk ({highRiskAccounts.length})</TabsTrigger>
              <TabsTrigger value="performance">Model Performance</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Distribution pie */}
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={distribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {distribution.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Pie>
                      <Legend />
                      <RechartsTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Summary stats */}
                <div className="grid grid-cols-2 gap-3">
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-2xl font-bold">{scores.length}</p>
                      <p className="text-xs text-muted-foreground">Invoices Scored</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-2xl font-bold text-red-600">{highRiskAccounts.length}</p>
                      <p className="text-xs text-muted-foreground">High/Critical Risk</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-2xl font-bold">{accuracyRate !== null ? `${accuracyRate}%` : '—'}</p>
                      <p className="text-xs text-muted-foreground">Accuracy Rate</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-2xl font-bold">{falsePositiveRate !== null ? `${falsePositiveRate}%` : '—'}</p>
                      <p className="text-xs text-muted-foreground">False Positive Rate</p>
                      <p className="text-xs text-muted-foreground">Target: &lt; 25%</p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="high-risk">
              {highRiskAccounts.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No high-risk invoices detected.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead className="text-center">Risk Score</TableHead>
                      <TableHead>Risk Level</TableHead>
                      <TableHead className="text-center">Est. Days to Pay</TableHead>
                      <TableHead>Key Factors</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {highRiskAccounts.map(s => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.customer_name}</TableCell>
                        <TableCell>{s.customer_company || '-'}</TableCell>
                        <TableCell className="text-center font-semibold">{(s.risk_score * 100).toFixed(0)}%</TableCell>
                        <TableCell>
                          <Badge className={riskBadgeClass(s.risk_level)}>{s.risk_level}</Badge>
                        </TableCell>
                        <TableCell className="text-center">{s.predicted_days_to_pay || '-'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {s.factors.days_overdue != null && s.factors.days_overdue > 0 && `${s.factors.days_overdue}d overdue`}
                          {s.factors.historical_late_ratio != null && ` · ${Math.round(s.factors.historical_late_ratio * 100)}% late history`}
                          {s.factors.no_history && 'No payment history'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="performance" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-3xl font-bold">{accuracyRate !== null ? `${accuracyRate}%` : '—'}</p>
                    <p className="text-sm text-muted-foreground">Prediction Accuracy</p>
                    <p className="text-xs text-muted-foreground mt-1">Target: &gt; 60%</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-3xl font-bold">{falsePositiveRate !== null ? `${falsePositiveRate}%` : '—'}</p>
                    <p className="text-sm text-muted-foreground">False Positive Rate</p>
                    <p className="text-xs text-muted-foreground mt-1">Target: &lt; 25%</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-3xl font-bold">{totalAccuracy}</p>
                    <p className="text-sm text-muted-foreground">Validated Predictions</p>
                    <p className="text-xs text-muted-foreground mt-1">Need: 30+ for AUC</p>
                  </CardContent>
                </Card>
              </div>

              {accuracyLogs.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Predicted Risk</TableHead>
                      <TableHead className="text-center">Actual Days</TableHead>
                      <TableHead>Was Late?</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accuracyLogs.slice(0, 20).map(a => (
                      <TableRow key={a.id}>
                        <TableCell>{format(new Date(a.logged_at), 'dd MMM yyyy')}</TableCell>
                        <TableCell>{a.customer_company || '-'}</TableCell>
                        <TableCell>
                          <Badge className={riskBadgeClass(a.predicted_risk_level)}>{a.predicted_risk_level}</Badge>
                        </TableCell>
                        <TableCell className="text-center">{a.actual_days_to_pay}</TableCell>
                        <TableCell>
                          <Badge variant={a.was_late ? 'destructive' : 'secondary'}>
                            {a.was_late ? 'Late' : 'On Time'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No accuracy data yet. Accuracy is logged when invoices are marked as paid.
                </p>
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
