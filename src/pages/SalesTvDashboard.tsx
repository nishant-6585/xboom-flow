import { useEffect, useState } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Trophy, Users, Award, DollarSign, Target, TrendingUp, Phone, Mail, FileText, MessageSquare, Send } from "lucide-react";
import { useSalesLeaderboard } from "@/hooks/useSalesGamification";
import { useLeadDistribution } from "@/hooks/useLeadDistribution";

/**
 * Concise Sales Dashboard, optimized for a 55" TV (1920x1080).
 * Dark, high-contrast, auto-refreshing every 60s. No nav chrome.
 */
export default function SalesTvDashboard() {
  const now = new Date();
  const start = format(startOfMonth(now), "yyyy-MM-dd");
  const end = format(endOfMonth(now), "yyyy-MM-dd");

  const { leaderboard } = useSalesLeaderboard(start, end);
  const { data: distData } = useLeadDistribution(start, end);

  const [clock, setClock] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto refresh entire page every 5 minutes to keep data fresh
  useEffect(() => {
    const t = setInterval(() => window.location.reload(), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const board = leaderboard ?? [];
  const totalLeads = board.reduce((s, e) => s + e.leads_handled, 0);
  const totalOrders = board.reduce((s, e) => s + e.orders_won, 0);
  const totalPipeline = board.reduce((s, e) => s + Number(e.total_pipeline_value), 0);
  const totalPoints = board.reduce((s, e) => s + e.total_points, 0);
  const totalOrderValue = board.reduce((s, e) => s + Number(e.total_order_value || 0), 0);
  const conversionRate = totalLeads > 0 ? Math.round((totalOrders / totalLeads) * 100) : 0;

  const top5 = [...board].sort((a, b) => b.total_points - a.total_points).slice(0, 5);
  const distribution = (distData?.data ?? []).slice(0, 6);
  const grandLeads = distData?.total ?? 0;

  // Aggregated source totals
  const sourceTotals = (distData?.data ?? []).reduce(
    (acc, e) => {
      acc.enquiry += e.sources.enquiry;
      acc.call += e.sources.call;
      acc.form += e.sources.form;
      acc.email += e.sources.email;
      acc.interakt += e.sources.interakt;
      return acc;
    },
    { enquiry: 0, call: 0, form: 0, email: 0, interakt: 0 },
  );

  const fmtCr = (n: number) => `₹${(n / 10000000).toFixed(2)} Cr`;
  const fmtL = (n: number) => `₹${(n / 100000).toFixed(1)} L`;

  return (
    <div className="min-h-screen w-screen bg-[#05060a] text-white overflow-hidden">
      <div className="h-screen w-screen flex flex-col p-6 gap-5">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 shadow-lg shadow-orange-500/30">
              <Trophy className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-amber-300 via-orange-400 to-pink-400 bg-clip-text text-transparent">
                XBoom Sales Arena
              </h1>
              <p className="text-base text-white/60 mt-1 uppercase tracking-[3px]">
                Live Dashboard · {format(now, "MMMM yyyy")}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-5xl font-bold font-mono tabular-nums">
              {format(clock, "HH:mm:ss")}
            </div>
            <div className="text-sm text-white/50 mt-1">{format(clock, "EEEE, dd MMM yyyy")}</div>
          </div>
        </header>

        {/* KPI strip */}
        <div className="grid grid-cols-5 gap-4">
          <KpiTile icon={Users} label="Team Leads" value={totalLeads.toLocaleString()} from="from-blue-500" to="to-cyan-500" />
          <KpiTile icon={Award} label="Orders Won" value={totalOrders.toLocaleString()} from="from-emerald-500" to="to-green-600" sub={`${conversionRate}% conv.`} />
          <KpiTile icon={DollarSign} label="Order Value" value={fmtCr(totalOrderValue)} from="from-purple-500" to="to-fuchsia-600" />
          <KpiTile icon={TrendingUp} label="Pipeline" value={fmtCr(totalPipeline)} from="from-pink-500" to="to-rose-600" />
          <KpiTile icon={Target} label="Team Points" value={totalPoints.toLocaleString()} from="from-amber-500" to="to-orange-600" />
        </div>

        {/* Body grid */}
        <div className="grid grid-cols-3 gap-5 flex-1 min-h-0">
          {/* Leaderboard */}
          <section className="col-span-2 bg-white/[0.04] border border-white/10 rounded-2xl p-5 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Trophy className="w-6 h-6 text-amber-400" />
                Top Performers
              </h2>
              <span className="text-xs uppercase tracking-widest text-white/50">
                {board.length} reps · {format(new Date(start), "dd MMM")} - {format(new Date(end), "dd MMM")}
              </span>
            </div>
            <div className="flex-1 grid grid-rows-5 gap-2 min-h-0">
              {top5.length === 0 && (
                <div className="flex items-center justify-center text-white/40 text-lg">No activity yet this month</div>
              )}
              {top5.map((e, i) => {
                const accents = [
                  "from-amber-400 to-yellow-600 text-black",
                  "from-slate-300 to-slate-500 text-black",
                  "from-orange-400 to-amber-700 text-white",
                  "from-white/10 to-white/5 text-white",
                  "from-white/10 to-white/5 text-white",
                ];
                return (
                  <div
                    key={e.user_id}
                    className="flex items-center gap-4 rounded-xl bg-white/[0.03] border border-white/5 px-4 py-2"
                  >
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${accents[i]} flex items-center justify-center font-black text-2xl shadow-lg`}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xl font-semibold truncate">{e.user_name || "Unknown"}</div>
                      <div className="text-xs text-white/50 mt-0.5">
                        {e.leads_handled} leads · {e.orders_won} won · {fmtL(Number(e.total_order_value || 0))} orders
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black text-amber-300 tabular-nums">{e.total_points.toLocaleString()}</div>
                      <div className="text-[10px] uppercase tracking-widest text-white/40">points</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Right column */}
          <section className="flex flex-col gap-5 min-h-0">
            {/* Lead sources */}
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                <Send className="w-5 h-5 text-cyan-400" />
                Lead Sources ({grandLeads})
              </h2>
              <div className="grid grid-cols-5 gap-2">
                <SourcePill icon={MessageSquare} label="Enquiry" value={sourceTotals.enquiry} color="text-cyan-300" />
                <SourcePill icon={Phone} label="Calls" value={sourceTotals.call} color="text-emerald-300" />
                <SourcePill icon={FileText} label="Forms" value={sourceTotals.form} color="text-purple-300" />
                <SourcePill icon={Mail} label="Email" value={sourceTotals.email} color="text-pink-300" />
                <SourcePill icon={MessageSquare} label="Interakt" value={sourceTotals.interakt} color="text-amber-300" />
              </div>
            </div>

            {/* Distribution by salesperson */}
            <div className="flex-1 bg-white/[0.04] border border-white/10 rounded-2xl p-5 flex flex-col min-h-0">
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-400" />
                Lead Distribution
              </h2>
              <div className="flex-1 flex flex-col gap-2 min-h-0 overflow-hidden">
                {distribution.length === 0 && (
                  <div className="flex items-center justify-center text-white/40 text-sm flex-1">No leads yet</div>
                )}
                {distribution.map((d) => {
                  const pct = grandLeads > 0 ? Math.round((d.leads / grandLeads) * 100) : 0;
                  return (
                    <div key={d.key}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium truncate">{d.name}</span>
                        <span className="text-white/60 tabular-nums">{d.leads} · {pct}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-400 via-cyan-400 to-emerald-400 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        <footer className="text-center text-xs text-white/30 uppercase tracking-[4px]">
          Auto-refresh every 5 min · XBoom Workflow
        </footer>
      </div>
    </div>
  );
}

function KpiTile({
  icon: Icon,
  label,
  value,
  from,
  to,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  from: string;
  to: string;
  sub?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br ${from} ${to} shadow-xl`}>
      <div className="absolute -right-6 -top-6 opacity-20">
        <Icon className="w-24 h-24" />
      </div>
      <div className="flex items-center gap-2 mb-2 text-white/90">
        <Icon className="w-5 h-5" />
        <span className="text-xs uppercase tracking-[2px] font-semibold">{label}</span>
      </div>
      <div className="text-4xl font-black tabular-nums">{value}</div>
      {sub && <div className="text-xs text-white/80 mt-1">{sub}</div>}
    </div>
  );
}

function SourcePill({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3 text-center">
      <Icon className={`w-4 h-4 mx-auto mb-1 ${color}`} />
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-white/50 mt-0.5">{label}</div>
    </div>
  );
}