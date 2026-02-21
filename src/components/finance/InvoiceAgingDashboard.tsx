import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Clock, AlertTriangle, IndianRupee, Loader2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface AgingRecord {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_company: string | null;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  invoice_date: string;
  due_date: string | null;
  status: string;
  aging_bucket: string;
  days_overdue: number;
}

const BUCKET_LABELS: Record<string, string> = {
  current: 'Current',
  '1_30': '1-30 Days',
  '31_60': '31-60 Days',
  '61_90': '61-90 Days',
  '90_plus': '90+ Days',
  paid: 'Paid',
  no_due_date: 'No Due Date',
};

const BUCKET_COLORS: Record<string, string> = {
  current: 'hsl(142, 76%, 36%)',
  '1_30': 'hsl(38, 92%, 50%)',
  '31_60': 'hsl(24, 95%, 53%)',
  '61_90': 'hsl(0, 72%, 51%)',
  '90_plus': 'hsl(0, 72%, 35%)',
};

export function InvoiceAgingDashboard() {
  const [records, setRecords] = useState<AgingRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAging = async () => {
      const { data, error } = await supabase
        .from('invoice_aging_view')
        .select('*')
        .neq('aging_bucket', 'paid')
        .order('days_overdue', { ascending: false });

      if (!error) {
        setRecords((data || []) as AgingRecord[]);
      }
      setLoading(false);
    };
    fetchAging();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Aggregate by bucket
  const bucketSummary = records.reduce<Record<string, { count: number; total: number }>>((acc, r) => {
    const bucket = r.aging_bucket;
    if (!acc[bucket]) acc[bucket] = { count: 0, total: 0 };
    acc[bucket].count++;
    acc[bucket].total += r.balance_due;
    return acc;
  }, {});

  const pieData = Object.entries(bucketSummary)
    .filter(([key]) => key !== 'no_due_date')
    .map(([key, val]) => ({
      name: BUCKET_LABELS[key] || key,
      value: val.total,
      count: val.count,
      key,
    }));

  const totalOverdue = records
    .filter(r => ['1_30', '31_60', '61_90', '90_plus'].includes(r.aging_bucket))
    .reduce((sum, r) => sum + r.balance_due, 0);

  const highRiskAccounts = records.filter(r => r.days_overdue > 60);

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
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <IndianRupee className="h-4 w-4 text-destructive" />
              <span className="text-xs text-muted-foreground">Total Overdue</span>
            </div>
            <p className="text-xl font-bold text-destructive">{formatCurrency(totalOverdue)}</p>
          </CardContent>
        </Card>
        {['1_30', '31_60', '61_90', '90_plus'].map(bucket => (
          <Card key={bucket}>
            <CardContent className="pt-4 pb-3">
              <span className="text-xs text-muted-foreground">{BUCKET_LABELS[bucket]}</span>
              <p className="text-lg font-bold mt-1">
                {formatCurrency(bucketSummary[bucket]?.total || 0)}
              </p>
              <p className="text-xs text-muted-foreground">
                {bucketSummary[bucket]?.count || 0} invoices
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pie Chart */}
        {pieData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Aging Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={false}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.key} fill={BUCKET_COLORS[entry.key] || '#888'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* High Risk Accounts */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              High-Risk Accounts (60+ Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[250px] overflow-y-auto">
              {highRiskAccounts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No high-risk accounts 🎉
                </p>
              ) : (
                highRiskAccounts.slice(0, 10).map(record => (
                  <div key={record.id} className="flex items-center justify-between p-2 rounded-lg border border-destructive/20 bg-destructive/5">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{record.invoice_number}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {record.customer_company || record.customer_name}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="font-semibold text-sm text-destructive">
                        {formatCurrency(record.balance_due)}
                      </p>
                      <Badge variant="destructive" className="text-[10px]">
                        {record.days_overdue}d overdue
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
