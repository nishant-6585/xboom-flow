import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LineChart, Line, CartesianGrid, AreaChart, Area } from 'recharts';
import { CreditCard, CCStatement, CCTransaction, CCPayment } from '@/hooks/useCreditCards';
import { getStatementCreditLimit, getStatementOutstanding, getStatementUtilization } from '@/lib/creditCardMetrics';
import { BarChart3, TrendingUp, CreditCard as CardIcon, AlertTriangle, ArrowUpDown, PieChart as PieIcon } from 'lucide-react';

interface Props {
  cards: CreditCard[];
  statements: CCStatement[];
  transactions: CCTransaction[];
  payments: CCPayment[];
}

const COLORS = ['hsl(var(--primary))', '#f97316', '#8b5cf6', '#06b6d4', '#ef4444', '#22c55e', '#f59e0b', '#ec4899'];
const fmt = (n: number) => {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toLocaleString('en-IN')}`;
};

export function CCReports({ cards, statements, transactions, payments }: Props) {
  if (statements.length === 0) return null;

  // ── FINANCIAL HEALTH ──
  const latestByCard = new Map<string, CCStatement>();
  statements.forEach(s => { if (!latestByCard.has(s.card_id)) latestByCard.set(s.card_id, s); });

  const cardHealth = Array.from(latestByCard.entries()).map(([cardId, s]) => {
    const card = cards.find(c => c.id === cardId);
    const limit = getStatementCreditLimit(s, card);
    const outstanding = getStatementOutstanding(s, card);
    const util = Math.round(getStatementUtilization(s, card));
    const cardStmts = statements.filter(st => st.card_id === cardId);
    const totalInterest = cardStmts.reduce((sum, st) => sum + st.interest_charged, 0);
    const totalLateFee = cardStmts.reduce((sum, st) => sum + st.late_fee, 0);
    const unpaidCount = cardStmts.filter(st => st.payment_status === 'UNPAID').length;
    const riskLevel = util >= 90 ? 'CRITICAL' : util >= 80 ? 'HIGH' : util >= 50 ? 'MODERATE' : 'SAFE';
    return {
      name: card?.card_name || 'Unknown',
      bank: card?.bank_name || '',
      limit, outstanding, util, totalInterest, totalLateFee,
      unpaidCount, riskLevel, available: s.available_credit_limit,
      totalDue: s.total_due, paymentStatus: s.payment_status,
    };
  }).sort((a, b) => b.util - a.util);

  // ── MONTHLY TRENDS ──
  const monthMap = new Map<string, { outstanding: number; interest: number; lateFee: number; paid: number }>();
  statements.forEach(s => {
    const card = cards.find(c => c.id === s.card_id);
    const e = monthMap.get(s.billing_month) || { outstanding: 0, interest: 0, lateFee: 0, paid: 0 };
    monthMap.set(s.billing_month, {
      outstanding: e.outstanding + getStatementOutstanding(s, card),
      interest: e.interest + s.interest_charged,
      lateFee: e.lateFee + s.late_fee,
      paid: e.paid + (s.amount_paid || 0),
    });
  });
  const trendData = Array.from(monthMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([month, d]) => ({ month: month.slice(2), ...d }));

  // ── CATEGORY SPENDING ──
  const catMap = new Map<string, number>();
  transactions.filter(t => t.transaction_type === 'debit').forEach(t => {
    catMap.set(t.category, (catMap.get(t.category) || 0) + t.amount);
  });
  const categoryData = Array.from(catMap.entries())
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // ── PAYMENT DISCIPLINE ──
  const paymentDiscipline = Array.from(latestByCard.entries()).map(([cardId]) => {
    const cardStmts = statements.filter(st => st.card_id === cardId);
    const card = cards.find(c => c.id === cardId);
    const fullCount = cardStmts.filter(s => s.payment_status === 'FULL').length;
    const partialCount = cardStmts.filter(s => s.payment_status === 'PARTIAL').length;
    const unpaidCount = cardStmts.filter(s => s.payment_status === 'UNPAID').length;
    const score = cardStmts.length > 0 ? Math.round((fullCount / cardStmts.length) * 100) : 0;
    return { name: card?.card_name || 'Unknown', full: fullCount, partial: partialCount, unpaid: unpaidCount, score, total: cardStmts.length };
  });

  // ── INTEREST LEAKAGE BY CARD ──
  const interestByCard = cards.map(c => {
    const cardStmts = statements.filter(s => s.card_id === c.id);
    const interest = cardStmts.reduce((sum, s) => sum + s.interest_charged, 0);
    const fees = cardStmts.reduce((sum, s) => sum + s.late_fee, 0);
    return { name: c.card_name, interest, fees, total: interest + fees };
  }).filter(d => d.total > 0).sort((a, b) => b.total - a.total);

  // ── TOP MERCHANTS ──
  const merchantMap = new Map<string, number>();
  transactions.filter(t => t.transaction_type === 'debit' && t.merchant_name).forEach(t => {
    const merchant = t.merchant_name || t.description.substring(0, 30);
    merchantMap.set(merchant, (merchantMap.get(merchant) || 0) + t.amount);
  });
  const topMerchants = Array.from(merchantMap.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  const riskColor = (level: string) => {
    switch (level) {
      case 'CRITICAL': return 'bg-red-500/10 text-red-600 border-red-500/30';
      case 'HIGH': return 'bg-orange-500/10 text-orange-600 border-orange-500/30';
      case 'MODERATE': return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30';
      default: return 'bg-green-500/10 text-green-600 border-green-500/30';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <BarChart3 className="h-4 w-4" /> Comprehensive Reports
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="health">
          <TabsList className="h-8 flex-wrap">
            <TabsTrigger value="health" className="text-xs gap-1"><AlertTriangle className="h-3 w-3" /> Health</TabsTrigger>
            <TabsTrigger value="trends" className="text-xs gap-1"><TrendingUp className="h-3 w-3" /> Trends</TabsTrigger>
            <TabsTrigger value="spending" className="text-xs gap-1"><PieIcon className="h-3 w-3" /> Spending</TabsTrigger>
            <TabsTrigger value="comparison" className="text-xs gap-1"><ArrowUpDown className="h-3 w-3" /> Comparison</TabsTrigger>
            <TabsTrigger value="leakage" className="text-xs gap-1"><CardIcon className="h-3 w-3" /> Leakage</TabsTrigger>
          </TabsList>

          {/* FINANCIAL HEALTH */}
          <TabsContent value="health" className="mt-4 space-y-4">
            <div className="rounded-lg border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Card</TableHead>
                    <TableHead className="text-xs">Bank</TableHead>
                    <TableHead className="text-xs text-right">Limit</TableHead>
                    <TableHead className="text-xs text-right">Outstanding</TableHead>
                    <TableHead className="text-xs text-right">Available</TableHead>
                    <TableHead className="text-xs text-right">Utilization</TableHead>
                    <TableHead className="text-xs text-right">Interest</TableHead>
                    <TableHead className="text-xs text-right">Late Fees</TableHead>
                    <TableHead className="text-xs">Risk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cardHealth.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-medium">{c.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.bank}</TableCell>
                      <TableCell className="text-xs text-right">{fmt(c.limit)}</TableCell>
                      <TableCell className="text-xs text-right font-medium">{fmt(c.outstanding)}</TableCell>
                      <TableCell className="text-xs text-right">{fmt(c.available)}</TableCell>
                      <TableCell className="text-xs text-right">
                        <span className={c.util >= 80 ? 'text-red-600 font-bold' : c.util >= 50 ? 'text-yellow-600' : 'text-green-600'}>{c.util}%</span>
                      </TableCell>
                      <TableCell className="text-xs text-right">{c.totalInterest > 0 ? <span className="text-red-600">{fmt(c.totalInterest)}</span> : '—'}</TableCell>
                      <TableCell className="text-xs text-right">{c.totalLateFee > 0 ? <span className="text-red-600">{fmt(c.totalLateFee)}</span> : '—'}</TableCell>
                      <TableCell><Badge className={`text-[9px] ${riskColor(c.riskLevel)}`}>{c.riskLevel}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* MONTHLY TRENDS */}
          <TabsContent value="trends" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-xs">Outstanding & Paid Trends</CardTitle></CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                      <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                      <Tooltip formatter={(v: number) => fmt(v)} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Area type="monotone" dataKey="outstanding" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.1} strokeWidth={2} />
                      <Area type="monotone" dataKey="paid" stroke="#22c55e" fill="#22c55e" fillOpacity={0.1} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-xs">Interest & Late Fee Trend</CardTitle></CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                      <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 9 }} />
                      <Tooltip formatter={(v: number) => fmt(v)} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="interest" fill="#ef4444" name="Interest" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="lateFee" fill="#f97316" name="Late Fee" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* SPENDING BREAKDOWN */}
          <TabsContent value="spending" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-xs">Spending by Category</CardTitle></CardHeader>
                <CardContent className="h-72">
                  {categoryData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={categoryData} cx="50%" cy="50%" outerRadius={90} innerRadius={50} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                          {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => fmt(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-12">No transaction data available</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-xs">Top Merchants / Descriptions</CardTitle></CardHeader>
                <CardContent>
                  {topMerchants.length > 0 ? (
                    <div className="space-y-2">
                      {topMerchants.map((m, i) => (
                        <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b last:border-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-muted-foreground w-4">{i + 1}.</span>
                            <span className="truncate">{m.name}</span>
                          </div>
                          <span className="font-medium shrink-0">{fmt(m.amount)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-12">No transaction data available</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* CARD COMPARISON */}
          <TabsContent value="comparison" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs">Payment Discipline Score</CardTitle></CardHeader>
              <CardContent>
                <div className="rounded-lg border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Card</TableHead>
                        <TableHead className="text-xs text-right">Statements</TableHead>
                        <TableHead className="text-xs text-right">Full Paid</TableHead>
                        <TableHead className="text-xs text-right">Partial</TableHead>
                        <TableHead className="text-xs text-right">Unpaid</TableHead>
                        <TableHead className="text-xs text-right">Score</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paymentDiscipline.map((d, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs font-medium">{d.name}</TableCell>
                          <TableCell className="text-xs text-right">{d.total}</TableCell>
                          <TableCell className="text-xs text-right text-green-600">{d.full}</TableCell>
                          <TableCell className="text-xs text-right text-yellow-600">{d.partial}</TableCell>
                          <TableCell className="text-xs text-right text-red-600">{d.unpaid}</TableCell>
                          <TableCell className="text-xs text-right">
                            <span className={d.score >= 80 ? 'text-green-600 font-bold' : d.score >= 50 ? 'text-yellow-600 font-bold' : 'text-red-600 font-bold'}>{d.score}%</span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* INTEREST LEAKAGE */}
          <TabsContent value="leakage" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-xs">Interest + Fees by Card</CardTitle></CardHeader>
                <CardContent className="h-64">
                  {interestByCard.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={interestByCard} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                        <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={v => fmt(v)} />
                        <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 9 }} />
                        <Tooltip formatter={(v: number) => fmt(v)} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Bar dataKey="interest" fill="#ef4444" name="Interest" stackId="a" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="fees" fill="#f97316" name="Late Fees" stackId="a" radius={[0, 2, 2, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                      <div className="text-center">
                        <span className="text-2xl">✅</span>
                        <p className="mt-2">No interest or late fee charges detected!</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-xs">Cumulative Cost Summary</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3 py-4">
                    {interestByCard.length > 0 ? interestByCard.map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-xs border-b pb-2 last:border-0">
                        <div>
                          <span className="font-medium">{c.name}</span>
                          <div className="text-muted-foreground mt-0.5">
                            Interest: {fmt(c.interest)} | Fees: {fmt(c.fees)}
                          </div>
                        </div>
                        <span className="font-bold text-red-600">{fmt(c.total)}</span>
                      </div>
                    )) : (
                      <p className="text-xs text-muted-foreground text-center">All clear — no leakage detected</p>
                    )}
                    {interestByCard.length > 0 && (
                      <div className="flex items-center justify-between text-xs pt-2 border-t font-bold">
                        <span>Total Leakage</span>
                        <span className="text-red-600">{fmt(interestByCard.reduce((s, c) => s + c.total, 0))}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
