import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Company } from '@/hooks/useCompanies';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { CompanyDetailDrawer } from './CompanyDetailDrawer';
import { useAllCompanyFollowups } from '@/hooks/useCompanyFollowups';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Clock, AlertCircle, Calendar } from 'lucide-react';
import { format, isPast, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

const COLORS = ['hsl(var(--primary))', 'hsl(142, 76%, 36%)', 'hsl(38, 92%, 50%)', 'hsl(262, 83%, 58%)', 'hsl(0, 84%, 60%)'];

export function CompanyDashboard({ companies }: { companies: Company[] }) {
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [showFollowupsList, setShowFollowupsList] = useState(false);
  const { followups: companyFollowups } = useAllCompanyFollowups();

  const followupStats = useMemo(() => {
    const now = new Date();
    const overdue = companyFollowups.filter(f => f.status === 'pending' && new Date(f.followup_at) < now).length;
    const today = companyFollowups.filter(f => {
      const d = new Date(f.followup_at);
      return f.status === 'pending' && d.toDateString() === now.toDateString();
    }).length;
    const upcoming = companyFollowups.filter(f => f.status === 'pending' && new Date(f.followup_at) >= now).length;
    return { overdue, today, upcoming, total: companyFollowups.length };
  }, [companyFollowups]);

  const companyById = useMemo(() => {
    const m = new Map<string, Company>();
    companies.forEach(c => m.set(c.id, c));
    return m;
  }, [companies]);
  const statusData = useMemo(() => {
    const leads = companies.filter(c => c.status === 'lead').length;
    const customers = companies.filter(c => c.status === 'customer').length;
    return [
      { name: 'Leads', value: leads, fill: 'hsl(217, 91%, 60%)' },
      { name: 'Customers', value: customers, fill: 'hsl(142, 76%, 36%)' },
    ].filter(d => d.value > 0);
  }, [companies]);

  const recurringData = useMemo(() => {
    const recurring = companies.filter(c => c.is_recurring).length;
    const oneTime = companies.filter(c => !c.is_recurring && c.total_orders_count > 0).length;
    const noOrders = companies.filter(c => c.total_orders_count === 0).length;
    return [
      { name: 'Recurring', value: recurring, fill: 'hsl(38, 92%, 50%)' },
      { name: 'One-time', value: oneTime, fill: 'hsl(262, 83%, 58%)' },
      { name: 'No Orders', value: noOrders, fill: 'hsl(var(--muted-foreground))' },
    ].filter(d => d.value > 0);
  }, [companies]);

  const topCompanies = useMemo(() => {
    return [...companies]
      .filter(c => c.total_order_value > 0)
      .sort((a, b) => b.total_order_value - a.total_order_value)
      .slice(0, 10)
      .map(c => ({
        id: c.id,
        fullName: c.name,
        name: c.name.length > 22 ? c.name.substring(0, 22) + '…' : c.name,
        value: Math.round(c.total_order_value / 1000),
        orders: c.total_orders_count,
        recurring: c.is_recurring,
      }));
  }, [companies]);

  const industryData = useMemo(() => {
    const map: Record<string, { count: number; value: number }> = {};
    companies.forEach(c => {
      const ind = c.industry || 'Unknown';
      if (!map[ind]) map[ind] = { count: 0, value: 0 };
      map[ind].count++;
      map[ind].value += c.total_order_value || 0;
    });
    return Object.entries(map)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 6)
      .map(([name, d], i) => ({ name, count: d.count, value: Math.round(d.value / 1000), fill: COLORS[i % COLORS.length] }));
  }, [companies]);

  if (companies.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Lead vs Customer */}
      <Card className="border-border/50">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium text-muted-foreground">Lead vs Customer</CardTitle>
        </CardHeader>
        <CardContent className="pb-4 px-4">
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={statusData} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={4}>
                {statusData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip formatter={(v: number) => v} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Company Follow-ups */}
      <Card className="border-border/50 md:col-span-2">
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" /> Company Follow-ups
          </CardTitle>
          <button
            type="button"
            onClick={() => setShowFollowupsList(true)}
            disabled={followupStats.total === 0}
            className="text-[11px] text-primary hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed"
          >
            View list →
          </button>
        </CardHeader>
        <CardContent className="pb-4 px-4">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => followupStats.overdue > 0 && setShowFollowupsList(true)}
              className={cn('rounded-lg border p-2 text-center transition-colors', followupStats.overdue > 0 ? 'border-red-500/40 bg-red-500/10 hover:bg-red-500/20 cursor-pointer' : 'border-border/40')}
            >
              <div className="text-xl font-bold text-red-600 dark:text-red-400">{followupStats.overdue}</div>
              <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
                <AlertCircle className="h-3 w-3" /> Overdue
              </div>
            </button>
            <button
              type="button"
              onClick={() => followupStats.today > 0 && setShowFollowupsList(true)}
              className={cn('rounded-lg border p-2 text-center transition-colors', followupStats.today > 0 ? 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 cursor-pointer' : 'border-border/40')}
            >
              <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{followupStats.today}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Due Today</div>
            </button>
            <button
              type="button"
              onClick={() => followupStats.upcoming > 0 && setShowFollowupsList(true)}
              className={cn('rounded-lg border p-2 text-center transition-colors', followupStats.upcoming > 0 ? 'border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 cursor-pointer' : 'border-border/40')}
            >
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{followupStats.upcoming}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Upcoming</div>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Recurring Breakdown */}
      <Card className="border-border/50">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium text-muted-foreground">Order Frequency</CardTitle>
        </CardHeader>
        <CardContent className="pb-4 px-4">
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={recurringData} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={4}>
                {recurringData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip formatter={(v: number) => v} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top Companies by Value */}
      <Card className="border-border/50 md:col-span-2">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium text-muted-foreground">Top 10 Companies by Revenue (₹K)</CardTitle>
        </CardHeader>
        <CardContent className="pb-4 px-4">
          {topCompanies.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={topCompanies}
                layout="vertical"
                margin={{ left: 0, right: 10, top: 0, bottom: 0 }}
                onClick={(state: any) => {
                  const idx = state?.activeTooltipIndex;
                  if (idx == null) return;
                  const row = topCompanies[idx];
                  if (!row) return;
                  const full = companies.find(c => c.id === row.id);
                  if (full) setSelectedCompany(full);
                }}
              >
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10 }} interval={0} />
                <Tooltip
                  formatter={(v: number) => [`₹${v}K`, 'Revenue']}
                  labelFormatter={(name) => {
                    const c = topCompanies.find(t => t.name === name);
                    return `${c?.fullName || name}${c?.recurring ? ' 🔄' : ''} (${c?.orders} orders) — click for details`;
                  }}
                />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} cursor="pointer" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[160px] flex items-center justify-center text-xs text-muted-foreground">No order data yet</div>
          )}
        </CardContent>
      </Card>

      <CompanyDetailDrawer
        company={selectedCompany}
        open={!!selectedCompany}
        onClose={() => setSelectedCompany(null)}
      />

      <Dialog open={showFollowupsList} onOpenChange={setShowFollowupsList}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4" /> Pending Company Follow-ups ({companyFollowups.length})
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto -mx-2 px-2 space-y-2">
            {companyFollowups.length === 0 && (
              <div className="text-center py-8 text-xs text-muted-foreground">No pending follow-ups</div>
            )}
            {companyFollowups.map(f => {
              const overdue = isPast(new Date(f.followup_at));
              const comp = companyById.get(f.source_id);
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    if (comp) {
                      setSelectedCompany(comp);
                      setShowFollowupsList(false);
                    }
                  }}
                  className={cn(
                    'w-full text-left rounded-lg border p-3 hover:bg-muted/50 transition-colors',
                    overdue ? 'border-red-500/40' : 'border-border/40'
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="font-medium text-sm truncate">{comp?.name || f.customer_name}</div>
                    <Badge className={cn('text-[10px] border', overdue ? 'bg-red-500/15 text-red-700 border-red-500/30' : 'bg-amber-500/15 text-amber-700 border-amber-500/30')}>
                      {overdue ? 'Overdue' : f.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(f.followup_at), 'd MMM, h:mm a')}</span>
                    <span className={cn(overdue && 'text-red-500 font-medium')}>
                      {overdue ? `Overdue ${formatDistanceToNow(new Date(f.followup_at))}` : `in ${formatDistanceToNow(new Date(f.followup_at))}`}
                    </span>
                    {f.created_by_name && <span className="ml-auto">by {f.created_by_name}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
