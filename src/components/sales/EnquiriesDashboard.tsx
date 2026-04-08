import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Enquiry } from '@/hooks/useEnquiries';
import {
  Package, Clock, CheckCircle2, AlertTriangle, ArrowRight, XCircle,
  Pause, TrendingUp, Timer, BarChart3
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend
} from 'recharts';
import { format, differenceInMinutes, differenceInHours, parseISO, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from 'date-fns';

interface EnquiriesDashboardProps {
  enquiries: Enquiry[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Package }> = {
  pending: { label: 'Pending', color: '#3b82f6', icon: Clock },
  responded: { label: 'Responded', color: '#8b5cf6', icon: CheckCircle2 },
  on_hold: { label: 'On Hold', color: '#eab308', icon: Pause },
  moved_to_pipeline: { label: 'Pipeline', color: '#6366f1', icon: ArrowRight },
  order_won: { label: 'Won', color: '#22c55e', icon: CheckCircle2 },
  order_lost: { label: 'Lost', color: '#ef4444', icon: XCircle },
};

export function EnquiriesDashboard({ enquiries }: EnquiriesDashboardProps) {
  const stats = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    let totalResponseMinutes = 0;
    let respondedCount = 0;
    let slaMetCount = 0;
    let slaBreachedCount = 0;

    for (const e of enquiries) {
      statusCounts[e.status] = (statusCounts[e.status] || 0) + 1;

      if (e.responded_at && e.created_at) {
        const mins = differenceInMinutes(parseISO(e.responded_at), parseISO(e.created_at));
        if (mins >= 0) {
          totalResponseMinutes += mins;
          respondedCount++;
          // SLA: responded within 24 hours
          if (mins <= 24 * 60) slaMetCount++;
          else slaBreachedCount++;
        }
      }
    }

    const avgResponseMinutes = respondedCount > 0 ? Math.round(totalResponseMinutes / respondedCount) : 0;
    const avgHours = Math.floor(avgResponseMinutes / 60);
    const avgMins = avgResponseMinutes % 60;

    const pendingCount = statusCounts['pending'] || 0;
    const pendingWithUrgency = enquiries.filter(
      e => e.status === 'pending' && (e.urgency === 'high' || e.urgency === 'critical')
    ).length;

    return {
      total: enquiries.length,
      statusCounts,
      avgResponseTime: avgHours > 0 ? `${avgHours}h ${avgMins}m` : `${avgMins}m`,
      avgResponseMinutes,
      respondedCount,
      pendingCount,
      pendingWithUrgency,
      slaMetCount,
      slaBreachedCount,
      conversionRate: enquiries.length > 0
        ? Math.round(((statusCounts['order_won'] || 0) + (statusCounts['moved_to_pipeline'] || 0)) / enquiries.length * 100)
        : 0,
    };
  }, [enquiries]);

  // Pie chart data
  const pieData = useMemo(() => {
    return Object.entries(STATUS_CONFIG).map(([key, cfg]) => ({
      name: cfg.label,
      value: stats.statusCounts[key] || 0,
      color: cfg.color,
    })).filter(d => d.value > 0);
  }, [stats.statusCounts]);

  // Monthly trend data (last 6 months)
  const monthlyData = useMemo(() => {
    const now = new Date();
    const months = eachMonthOfInterval({
      start: subMonths(startOfMonth(now), 5),
      end: startOfMonth(now),
    });

    return months.map(month => {
      const monthEnd = endOfMonth(month);
      const monthEnquiries = enquiries.filter(e => {
        const d = parseISO(e.created_at);
        return d >= month && d <= monthEnd;
      });

      const responded = monthEnquiries.filter(e => e.status !== 'pending');
      const won = monthEnquiries.filter(e => e.status === 'order_won').length;
      const lost = monthEnquiries.filter(e => e.status === 'order_lost').length;

      return {
        month: format(month, 'MMM yy'),
        total: monthEnquiries.length,
        responded: responded.length,
        won,
        lost,
      };
    });
  }, [enquiries]);

  // Avg response time by sales person
  const salesPersonStats = useMemo(() => {
    const map: Record<string, { total: number; responseMinutes: number; responded: number }> = {};

    for (const e of enquiries) {
      const name = e.sales_person_name || 'Unassigned';
      if (!map[name]) map[name] = { total: 0, responseMinutes: 0, responded: 0 };
      map[name].total++;
      if (e.responded_at && e.created_at) {
        const mins = differenceInMinutes(parseISO(e.responded_at), parseISO(e.created_at));
        if (mins >= 0) {
          map[name].responseMinutes += mins;
          map[name].responded++;
        }
      }
    }

    return Object.entries(map)
      .map(([name, data]) => ({
        name: name.split(' ')[0], // first name for chart
        fullName: name,
        total: data.total,
        avgMins: data.responded > 0 ? Math.round(data.responseMinutes / data.responded) : 0,
        avgHours: data.responded > 0 ? Math.round(data.responseMinutes / data.responded / 60 * 10) / 10 : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [enquiries]);

  const kpiCards = [
    {
      label: 'Total Enquiries',
      value: stats.total,
      icon: Package,
      gradient: 'from-primary/10 to-primary/5',
      iconBg: 'bg-primary/20',
      iconColor: 'text-primary',
    },
    {
      label: 'Pending',
      value: stats.pendingCount,
      sub: stats.pendingWithUrgency > 0 ? `${stats.pendingWithUrgency} urgent` : undefined,
      icon: Clock,
      gradient: 'from-amber-500/10 to-amber-500/5',
      iconBg: 'bg-amber-500/20',
      iconColor: 'text-amber-600',
    },
    {
      label: 'Avg Response Time',
      value: stats.avgResponseTime,
      sub: `${stats.respondedCount} responded`,
      icon: Timer,
      gradient: 'from-purple-500/10 to-purple-500/5',
      iconBg: 'bg-purple-500/20',
      iconColor: 'text-purple-600',
    },
    {
      label: 'Conversion Rate',
      value: `${stats.conversionRate}%`,
      sub: `${(stats.statusCounts['order_won'] || 0) + (stats.statusCounts['moved_to_pipeline'] || 0)} converted`,
      icon: TrendingUp,
      gradient: 'from-green-500/10 to-green-500/5',
      iconBg: 'bg-green-500/20',
      iconColor: 'text-green-600',
    },
    {
      label: 'SLA Met',
      value: stats.slaMetCount,
      sub: `${stats.slaBreachedCount} breached`,
      icon: CheckCircle2,
      gradient: 'from-emerald-500/10 to-emerald-500/5',
      iconBg: 'bg-emerald-500/20',
      iconColor: 'text-emerald-600',
    },
    {
      label: 'Orders Won',
      value: stats.statusCounts['order_won'] || 0,
      icon: CheckCircle2,
      gradient: 'from-green-500/10 to-green-500/5',
      iconBg: 'bg-green-500/20',
      iconColor: 'text-green-600',
    },
    {
      label: 'Orders Lost',
      value: stats.statusCounts['order_lost'] || 0,
      icon: XCircle,
      gradient: 'from-red-500/10 to-red-500/5',
      iconBg: 'bg-red-500/20',
      iconColor: 'text-red-600',
    },
    {
      label: 'On Hold',
      value: stats.statusCounts['on_hold'] || 0,
      icon: Pause,
      gradient: 'from-yellow-500/10 to-yellow-500/5',
      iconBg: 'bg-yellow-500/20',
      iconColor: 'text-yellow-600',
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <Card key={card.label} className={`bg-gradient-to-br ${card.gradient} border-border/30`}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${card.iconBg}`}>
                  <card.icon className={`h-5 w-5 ${card.iconColor}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{card.value}</p>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  {card.sub && (
                    <p className="text-[10px] text-muted-foreground/70">{card.sub}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Distribution Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={95}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Monthly Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Monthly Enquiry Flow
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" name="Total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="responded" name="Responded" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="won" name="Won" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="lost" name="Lost" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Sales Person Response Time */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Timer className="h-4 w-4 text-primary" />
            Avg Response Time by Sales Person (hours)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={salesPersonStats} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis type="number" fontSize={12} />
              <YAxis dataKey="name" type="category" fontSize={12} width={80} />
              <Tooltip
                formatter={(value: number) => [`${value}h`, 'Avg Response']}
                labelFormatter={(label) => {
                  const person = salesPersonStats.find(p => p.name === label);
                  return person?.fullName || label;
                }}
              />
              <Bar dataKey="avgHours" name="Avg Hours" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Flow Summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Enquiry Flow Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {Object.entries(STATUS_CONFIG).map(([key, cfg], i, arr) => {
              const count = stats.statusCounts[key] || 0;
              const Icon = cfg.icon;
              return (
                <div key={key} className="flex items-center gap-2">
                  <div className="flex flex-col items-center">
                    <div
                      className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                      style={{ backgroundColor: cfg.color }}
                    >
                      {count}
                    </div>
                    <span className="text-xs text-muted-foreground mt-1">{cfg.label}</span>
                  </div>
                  {i < arr.length - 1 && (
                    <ArrowRight className="h-4 w-4 text-muted-foreground/50 mx-1" />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
