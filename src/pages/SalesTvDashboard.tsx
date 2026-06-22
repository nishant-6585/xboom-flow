import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  subDays, subMonths, subWeeks,
} from "date-fns";
import {
  Trophy, Users, Award, DollarSign, Target, TrendingUp,
  Phone, Mail, FileText, MessageSquare, Send, Pause, Play, Maximize, X, Calendar,
} from "lucide-react";
import { useSalesLeaderboard } from "@/hooks/useSalesGamification";
import { useLeadDistribution } from "@/hooks/useLeadDistribution";
import { useSalesTargets } from "@/hooks/useSalesTargets";

/* ============================================================
   TV View — Auto-rotating Sales Scoreboard
   - 4 screens, 30s each
   - Alternates Today ↔ MTD each cycle
   - Dark stadium look, optimized for 55" TV (1920x1080)
   ============================================================ */

const ROTATE_MS = 30_000;
const REFRESH_MS = 5 * 60_000;
const SCREEN_COUNT = 10;

type RangePreset =
  | "today" | "yesterday"
  | "this_week" | "last_week"
  | "this_month" | "last_month";

const RANGE_OPTIONS: { value: RangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "last_week", label: "Last Week" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
];

function computeRange(preset: RangePreset): { start: string; end: string; label: string } {
  const now = new Date();
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");
  switch (preset) {
    case "today":
      return { start: fmt(now), end: fmt(now), label: "Today" };
    case "yesterday": {
      const y = subDays(now, 1);
      return { start: fmt(y), end: fmt(y), label: "Yesterday" };
    }
    case "this_week": {
      const s = startOfWeek(now, { weekStartsOn: 1 });
      const e = endOfWeek(now, { weekStartsOn: 1 });
      return { start: fmt(s), end: fmt(e), label: "This Week" };
    }
    case "last_week": {
      const lw = subWeeks(now, 1);
      const s = startOfWeek(lw, { weekStartsOn: 1 });
      const e = endOfWeek(lw, { weekStartsOn: 1 });
      return { start: fmt(s), end: fmt(e), label: "Last Week" };
    }
    case "this_month":
      return { start: fmt(startOfMonth(now)), end: fmt(endOfMonth(now)), label: "This Month" };
    case "last_month": {
      const lm = subMonths(now, 1);
      return { start: fmt(startOfMonth(lm)), end: fmt(endOfMonth(lm)), label: "Last Month" };
    }
  }
}

export default function SalesTvDashboard() {
  const navigate = useNavigate();
  const [rangePreset, setRangePreset] = useState<RangePreset>("this_month");
  const [screen, setScreen] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0); // forces refetch every REFRESH_MS
  const [clock, setClock] = useState(new Date());
  const [progress, setProgress] = useState(0); // 0..1 within current screen
  const startRef = useRef<number>(Date.now());

  // Date range from explicit preset
  const { start, end, label: rangeLabel } = useMemo(
    () => computeRange(rangePreset),
    // include tick so RPCs refresh on REFRESH_MS even if preset didn't change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rangePreset, tick],
  );

  // Force include website-sourced data so TV totals match the Sales Arena dashboard
  const { leaderboard } = useSalesLeaderboard(start, end, true);
  const { data: distData } = useLeadDistribution(start, end);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Data refresh
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  // Rotation + progress
  useEffect(() => {
    if (paused) return;
    startRef.current = Date.now();
    setProgress(0);
    const progT = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      setProgress(Math.min(1, elapsed / ROTATE_MS));
    }, 200);
    const rotT = setTimeout(() => {
      advance(1);
    }, ROTATE_MS);
    return () => {
      clearInterval(progT);
      clearTimeout(rotT);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, rangePreset, paused]);

  const advance = (dir: 1 | -1) => {
    setScreen((s) => {
      const next = s + dir;
      if (next >= SCREEN_COUNT) {
        // Completed all screens for this date range → advance to next range
        setRangePreset((rp) => {
          const idx = RANGE_OPTIONS.findIndex((o) => o.value === rp);
          const nextIdx = (idx + 1) % RANGE_OPTIONS.length;
          return RANGE_OPTIONS[nextIdx].value;
        });
        return 0;
      }
      if (next < 0) {
        setRangePreset((rp) => {
          const idx = RANGE_OPTIONS.findIndex((o) => o.value === rp);
          const prevIdx = (idx - 1 + RANGE_OPTIONS.length) % RANGE_OPTIONS.length;
          return RANGE_OPTIONS[prevIdx].value;
        });
        return SCREEN_COUNT - 1;
      }
      return next;
    });
  };

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") advance(1);
      else if (e.key === "ArrowLeft") advance(-1);
      else if (e.code === "Space") {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      } else if (e.key === "Escape") {
        if (!document.fullscreenElement) navigate('/sales');
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  const EXCLUDED_NAME_FRAGMENTS = [
    "vishal",
    "fanad baig",
    "charles",
    "test user",
    "baig umer saad ahmed",
    "amit kumar",
    "mohammad ijrail ali",
  ];
  const filteredLeaderboard = (leaderboard ?? []).filter((e) => {
    const n = (e.user_name ?? "").toLowerCase();
    return !EXCLUDED_NAME_FRAGMENTS.some((frag) => n.includes(frag));
  });
  const board = filteredLeaderboard;
  const dist = distData?.data ?? [];

  return (
    <div
      className="min-h-screen w-screen bg-[#05060a] text-white overflow-hidden select-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Exit button — always visible top-right */}
      <button
        onClick={() => {
          if (document.fullscreenElement) document.exitFullscreen?.();
          navigate('/sales');
        }}
        className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur px-4 py-2 text-sm font-semibold text-white/80 hover:text-white transition border border-white/10"
        title="Exit TV View (Esc)"
      >
        <X className="w-4 h-4" /> Exit TV View
      </button>

      <div className="h-screen w-screen flex flex-col p-6 gap-4">
        {/* Header */}
        <header className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 shadow-lg shadow-orange-500/30">
              <Trophy className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-amber-300 via-orange-400 to-pink-400 bg-clip-text text-transparent">
                XBoom Sales Arena
              </h1>
              <p className="text-sm text-white/60 mt-1 uppercase tracking-[3px]">
                Live Scoreboard
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <RangeSelector
              value={rangePreset}
              onChange={setRangePreset}
              label={rangeLabel}
              start={start}
              end={end}
            />
            <div className="text-right">
              <div className="text-4xl font-bold font-mono tabular-nums">
                {format(clock, "HH:mm:ss")}
              </div>
              <div className="text-xs text-white/50 mt-1">{format(clock, "EEEE, dd MMM yyyy")}</div>
            </div>
          </div>
        </header>

        {/* Current Screen */}
        <main className="flex-1 min-h-0 relative">
          <div key={`${rangePreset}-${screen}`} className="absolute inset-0 animate-fade-in">
            {screen === 0 && <KpiScreen board={board} />}
            {screen === 1 && <LeaderboardScreen board={board} />}
            {screen === 2 && <LeadSourcesScreen dist={dist} />}
            {screen === 3 && <LeadDistributionScreen dist={dist} total={distData?.total ?? 0} />}
            {screen === 4 && <FunnelScreen board={board} dist={dist} total={distData?.total ?? 0} />}
            {screen === 5 && <RevenueRaceScreen board={board} />}
            {screen === 6 && <PipelineRaceScreen board={board} />}
            {screen === 7 && <SourceMixScreen dist={dist} />}
            {screen === 8 && <TargetVsAchievementScreen />}
            {screen === 9 && <YtdRaceScreen />}
          </div>
        </main>

        {/* Footer strip */}
        <footer className="shrink-0 flex items-center justify-between gap-6 px-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[3px] text-white/40">
            {paused ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {paused ? "Paused" : "Auto-rotating · 30s"}
            <span className="text-white/20">·</span>
            <button onClick={toggleFullscreen} className="flex items-center gap-1 hover:text-white/80 transition">
              <Maximize className="w-3.5 h-3.5" /> Fullscreen (F)
            </button>
          </div>

          <div className="flex items-center gap-3 flex-1 max-w-2xl">
            <div className="flex items-center gap-2">
              {Array.from({ length: SCREEN_COUNT }).map((_, i) => (
                <span
                  key={i}
                  className={`h-2 rounded-full transition-all ${
                    i === screen
                      ? "w-8 bg-gradient-to-r from-amber-300 to-pink-400 shadow-[0_0_10px_rgba(251,191,36,0.6)]"
                      : "w-2 bg-white/15"
                  }`}
                />
              ))}
            </div>
            <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-300 to-pink-500 transition-[width] duration-200 ease-linear"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>

          <div className="text-xs uppercase tracking-[3px] text-white/40">
            {SCREEN_LABELS[screen]} · {rangeLabel.toUpperCase()}
          </div>
        </footer>
      </div>
    </div>
  );
}

/* ============================================================
   Screen 5 — Conversion Funnel
   ============================================================ */
function FunnelScreen({
  board, dist, total,
}: {
  board: ReturnType<typeof useSalesLeaderboard>["leaderboard"];
  dist: any[]; total: number;
}) {
  const list = board ?? [];
  const leads = total || list.reduce((s, e) => s + e.leads_handled, 0);
  const pipelineCount = (dist ?? []).reduce((s: number, d: any) => s + (d.pipeline || 0), 0);
  const prospectsCount = (dist ?? []).reduce((s: number, d: any) => s + (d.prospects || 0), 0);
  const ordersWon = list.reduce((s, e) => s + e.orders_won, 0);
  const orderValue = list.reduce((s, e) => s + Number(e.total_order_value || 0), 0);

  const stages = [
    { label: "Leads", value: leads, from: "from-blue-500", to: "to-cyan-500" },
    { label: "Prospects", value: prospectsCount, from: "from-indigo-500", to: "to-violet-500" },
    { label: "Pipeline", value: pipelineCount, from: "from-purple-500", to: "to-fuchsia-500" },
    { label: "Orders Won", value: ordersWon, from: "from-emerald-500", to: "to-green-600" },
  ];
  const max = Math.max(...stages.map((s) => s.value), 1);

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white/90 flex items-center justify-center gap-3">
          <Target className="w-7 h-7 text-emerald-400" /> Conversion Funnel
        </h2>
        <p className="text-sm text-white/40 uppercase tracking-[4px] mt-2">
          From first touch to closed-won · {fmtCr(orderValue)} revenue
        </p>
      </div>
      <div className="flex-1 grid grid-cols-4 gap-5 items-end">
        {stages.map((s, i) => {
          const heightPct = Math.max(15, Math.round((s.value / max) * 100));
          const prev = i > 0 ? stages[i - 1].value : leads;
          const dropPct = prev > 0 ? Math.round((s.value / prev) * 100) : 0;
          return (
            <div key={s.label} className="h-full flex flex-col justify-end gap-3">
              <div
                className={`rounded-3xl bg-gradient-to-b ${s.from} ${s.to} shadow-2xl p-6 flex flex-col justify-end`}
                style={{ height: `${heightPct}%` }}
              >
                <div className="text-6xl font-black tabular-nums leading-none">{s.value.toLocaleString()}</div>
                <div className="text-sm uppercase tracking-[3px] font-bold mt-3 text-white/90">{s.label}</div>
                {i > 0 && (
                  <div className="text-xs text-white/70 mt-1">{dropPct}% from prev</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   Screen 6 — Revenue Race
   ============================================================ */
function RevenueRaceScreen({ board }: { board: ReturnType<typeof useSalesLeaderboard>["leaderboard"] }) {
  const rows = [...(board ?? [])]
    .map((e) => ({ name: e.user_name || "Unknown", value: Number(e.total_order_value || 0), orders: e.orders_won }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white/90 flex items-center justify-center gap-3">
          <DollarSign className="w-7 h-7 text-purple-400" /> Revenue Race
        </h2>
        <p className="text-sm text-white/40 uppercase tracking-[4px] mt-2">Order value closed by rep</p>
      </div>
      <div className="flex-1 grid gap-3 min-h-0" style={{ gridTemplateRows: `repeat(${Math.max(rows.length, 1)}, minmax(0, 1fr))` }}>
        {rows.length === 0 && (
          <div className="flex items-center justify-center text-white/40 text-2xl">No revenue yet</div>
        )}
        {rows.map((r) => {
          const pct = Math.round((r.value / max) * 100);
          return (
            <div key={r.name} className="rounded-2xl bg-white/[0.04] border border-white/10 px-6 py-4 flex flex-col justify-center gap-2">
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold truncate">{r.name}</div>
                <div className="flex items-baseline gap-3">
                  <div className="text-4xl font-black tabular-nums text-purple-300">{fmtL(r.value)}</div>
                  <div className="text-sm text-white/50">· {r.orders} won</div>
                </div>
              </div>
              <div className="h-3 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-400 via-fuchsia-400 to-pink-400 rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   Screen 7 — Pipeline Race
   ============================================================ */
function PipelineRaceScreen({ board }: { board: ReturnType<typeof useSalesLeaderboard>["leaderboard"] }) {
  const rows = [...(board ?? [])]
    .map((e) => ({ name: e.user_name || "Unknown", value: Number(e.total_pipeline_value || 0), leads: e.leads_handled }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  const max = Math.max(...rows.map((r) => r.value), 1);
  const grand = rows.reduce((s, r) => s + r.value, 0);

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white/90 flex items-center justify-center gap-3">
          <TrendingUp className="w-7 h-7 text-pink-400" /> Pipeline Race
        </h2>
        <p className="text-sm text-white/40 uppercase tracking-[4px] mt-2">
          {fmtCr(grand)} open pipeline · top 6 reps
        </p>
      </div>
      <div className="flex-1 grid gap-3 min-h-0" style={{ gridTemplateRows: `repeat(${Math.max(rows.length, 1)}, minmax(0, 1fr))` }}>
        {rows.length === 0 && (
          <div className="flex items-center justify-center text-white/40 text-2xl">No pipeline yet</div>
        )}
        {rows.map((r) => {
          const pct = Math.round((r.value / max) * 100);
          return (
            <div key={r.name} className="rounded-2xl bg-white/[0.04] border border-white/10 px-6 py-4 flex flex-col justify-center gap-2">
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold truncate">{r.name}</div>
                <div className="flex items-baseline gap-3">
                  <div className="text-4xl font-black tabular-nums text-pink-300">{fmtL(r.value)}</div>
                  <div className="text-sm text-white/50">· {r.leads} leads</div>
                </div>
              </div>
              <div className="h-3 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-pink-400 via-rose-400 to-amber-400 rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   Screen 8 — Source Mix by Rep
   ============================================================ */
function SourceMixScreen({ dist }: { dist: any[] }) {
  const rows = [...(dist ?? [])].sort((a, b) => b.leads - a.leads).slice(0, 6);
  const colors: Record<string, string> = {
    enquiry: "bg-cyan-400",
    call: "bg-emerald-400",
    form: "bg-violet-400",
    email: "bg-pink-400",
    interakt: "bg-amber-400",
  };
  const labels: Record<string, string> = {
    enquiry: "Enquiry", call: "Calls", form: "QForms", email: "Email", interakt: "WhatsApp",
  };

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white/90 flex items-center justify-center gap-3">
          <MessageSquare className="w-7 h-7 text-cyan-400" /> Source Mix by Rep
        </h2>
        <p className="text-sm text-white/40 uppercase tracking-[4px] mt-2">Where each rep's leads come from</p>
      </div>
      <div className="flex items-center justify-center gap-5 text-xs uppercase tracking-[2px] text-white/60">
        {Object.keys(labels).map((k) => (
          <div key={k} className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-sm ${colors[k]}`} />
            {labels[k]}
          </div>
        ))}
      </div>
      <div className="flex-1 grid gap-3 min-h-0" style={{ gridTemplateRows: `repeat(${Math.max(rows.length, 1)}, minmax(0, 1fr))` }}>
        {rows.length === 0 && (
          <div className="flex items-center justify-center text-white/40 text-2xl">No lead activity</div>
        )}
        {rows.map((d) => {
          const parts = ["enquiry", "call", "form", "email", "interakt"] as const;
          const total = parts.reduce((s, k) => s + (d.sources[k] || 0), 0) || 1;
          return (
            <div key={d.key} className="rounded-2xl bg-white/[0.04] border border-white/10 px-6 py-4 flex flex-col justify-center gap-2">
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold truncate">{d.name}</div>
                <div className="text-3xl font-black tabular-nums text-white/90">{d.leads}</div>
              </div>
              <div className="h-5 rounded-full overflow-hidden flex bg-white/5">
                {parts.map((k) => {
                  const v = d.sources[k] || 0;
                  if (v === 0) return null;
                  return (
                    <div
                      key={k}
                      className={`${colors[k]} h-full`}
                      style={{ width: `${(v / total) * 100}%` }}
                      title={`${labels[k]}: ${v}`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const SCREEN_LABELS = [
  "KPIs",
  "Top Performers",
  "Lead Sources",
  "Lead Distribution",
  "Conversion Funnel",
  "Revenue Race",
  "Pipeline Race",
  "Source Mix by Rep",
  "Target vs Achievement",
];
SCREEN_LABELS.push("YTD Race");

/* ============================================================
   Screen 10 — YTD Race (financial year to date leaderboard)
   ============================================================ */
function YtdRaceScreen() {
  const now = new Date();
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");
  const currentMonth = now.getMonth();
  const fyStartYear = currentMonth >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const ytdStart = `${fyStartYear}-04-01`;
  const ytdEnd = fmt(now);
  const monthsInFy = ((currentMonth - 3 + 12) % 12) + 1;
  const fyLabel = `FY ${String(fyStartYear).slice(2)}-${String(fyStartYear + 1).slice(2)}`;

  const { targets } = useSalesTargets();
  const { leaderboard } = useSalesLeaderboard(ytdStart, ytdEnd, false);

  const ytdTargetByUser = new Map<string, number>();
  for (const t of targets ?? []) {
    if (t.target_period !== "monthly") continue;
    const v = Number(t.revenue_target || 0);
    if (!v) continue;
    const cur = ytdTargetByUser.get(t.user_id) ?? 0;
    // use the latest monthly target as standing monthly target
    if (!cur) ytdTargetByUser.set(t.user_id, v * monthsInFy);
  }

  const rows = (leaderboard ?? [])
    .filter((e) => !(e.name || "").toLowerCase().includes("vishal"))
    .map((e) => {
      const revenue = Number(e.total_order_value || 0);
      const target = ytdTargetByUser.get(e.user_id) || 0;
      const pct = target > 0 ? Math.round((revenue / target) * 100) : 0;
      return {
        userId: e.user_id,
        name: e.name || "Unknown",
        revenue,
        orders: Number(e.orders_won || 0),
        leads: Number(e.leads_handled || 0),
        target,
        pct,
      };
    })
    .filter((r) => r.revenue > 0 || r.target > 0)
    .sort((a, b) => b.revenue - a.revenue);

  const maxRev = Math.max(1, ...rows.map((r) => r.revenue));
  const pctColor = (p: number) =>
    p >= 100 ? "text-emerald-400" : p >= 50 ? "text-amber-400" : "text-rose-400";
  const barColor = (p: number) =>
    p >= 100 ? "from-emerald-400 to-teal-500"
    : p >= 50 ? "from-amber-400 to-orange-500"
    : "from-rose-400 to-pink-500";
  const medal = (i: number) =>
    i === 0 ? "from-yellow-300 to-amber-500" :
    i === 1 ? "from-slate-200 to-slate-400" :
    i === 2 ? "from-orange-400 to-amber-700" :
    "from-white/20 to-white/5";

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white/90 flex items-center justify-center gap-3">
          <Trophy className="w-7 h-7 text-yellow-400" /> YTD Race
        </h2>
        <p className="text-sm text-white/40 uppercase tracking-[4px] mt-2">
          {fyLabel} · Apr → {format(now, "MMM yyyy")} · {monthsInFy} month{monthsInFy > 1 ? "s" : ""} in
        </p>
      </div>
      {rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-white/40 text-2xl">
          No YTD data
        </div>
      ) : (
        <div
          className="flex-1 grid gap-3 min-h-0"
          style={{ gridTemplateRows: `repeat(${rows.length}, minmax(0, 1fr))` }}
        >
          {rows.map((r, i) => {
            const revFill = (r.revenue / maxRev) * 100;
            return (
              <div
                key={r.userId}
                className="rounded-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10 px-5 py-3 flex items-center gap-5 shadow-xl min-h-0"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${medal(i)} flex items-center justify-center font-black text-black text-xl shadow-lg shrink-0`}>
                  {i + 1}
                </div>
                <div className="w-48 shrink-0">
                  <div className="text-xl font-bold truncate">{r.name}</div>
                  <div className="text-[11px] uppercase tracking-[2px] text-white/40">
                    {r.orders} won · {r.leads} leads
                  </div>
                </div>
                <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                  <div className="flex items-baseline justify-between tabular-nums">
                    <span className="text-2xl font-black text-white">{fmtL(r.revenue)}</span>
                    <span className="text-xs text-white/40">
                      target {r.target > 0 ? fmtL(r.target) : "—"}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full"
                      style={{ width: `${revFill}%` }}
                    />
                  </div>
                  {r.target > 0 && (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className={`h-full bg-gradient-to-r ${barColor(r.pct)} rounded-full`}
                          style={{ width: `${Math.min(100, r.pct)}%` }}
                        />
                      </div>
                      <span className={`text-sm font-black tabular-nums ${pctColor(r.pct)} w-12 text-right`}>
                        {r.pct}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Screen 9 — Target vs Achievement (MTD + YTD per salesperson)
   ============================================================ */
function TargetVsAchievementScreen() {
  const now = new Date();
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");

  // MTD window: current calendar month
  const mtdStart = fmt(startOfMonth(now));
  const mtdEnd = fmt(endOfMonth(now));

  // YTD window: financial year starts April 1
  const currentMonth = now.getMonth(); // 0-indexed (Jan=0, Apr=3)
  const fyStartYear = currentMonth >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const ytdStart = `${fyStartYear}-04-01`;
  const ytdEnd = fmt(now);

  // Months elapsed in FY (April -> current, inclusive)
  const monthsInFy = ((currentMonth - 3 + 12) % 12) + 1;

  const { targets } = useSalesTargets();
  const { leaderboard: mtdBoard } = useSalesLeaderboard(mtdStart, mtdEnd, true);
  const { leaderboard: ytdBoard } = useSalesLeaderboard(ytdStart, ytdEnd, true);

  // Pick each user's most recent monthly revenue target as their standing monthly target.
  // Prefer one covering the current month, else fall back to the latest monthly target on file.
  const monthlyTargetByUser = new Map<string, { name: string; target: number; periodStart: string; covers: boolean }>();
  const monthStart = new Date(mtdStart);
  const monthEnd = new Date(mtdEnd);
  for (const t of targets ?? []) {
    if (t.target_period !== "monthly") continue;
    const v = Number(t.revenue_target || 0);
    if (!v) continue;
    const ps = new Date(t.period_start);
    const pe = new Date(t.period_end);
    const covers = ps <= monthEnd && pe >= monthStart;
    const cur = monthlyTargetByUser.get(t.user_id);
    if (!cur || (covers && !cur.covers) || (covers === cur.covers && t.period_start > cur.periodStart)) {
      monthlyTargetByUser.set(t.user_id, {
        name: t.user_name || "Unknown",
        target: v,
        periodStart: t.period_start,
        covers,
      });
    }
  }

  const mtdRevenueByUser = new Map<string, number>();
  for (const e of mtdBoard ?? []) {
    mtdRevenueByUser.set(e.user_id, Number(e.total_order_value || 0));
  }
  const ytdRevenueByUser = new Map<string, number>();
  for (const e of ytdBoard ?? []) {
    ytdRevenueByUser.set(e.user_id, Number(e.total_order_value || 0));
  }

  const cards = Array.from(monthlyTargetByUser.entries())
    .map(([userId, { name, target }]) => {
      const mtdAchieved = mtdRevenueByUser.get(userId) || 0;
      const ytdAchieved = ytdRevenueByUser.get(userId) || 0;
      const ytdTarget = target * monthsInFy;
      return {
        userId,
        name,
        mtdTarget: target,
        mtdAchieved,
        mtdPct: target > 0 ? Math.round((mtdAchieved / target) * 100) : 0,
        ytdTarget,
        ytdAchieved,
        ytdPct: ytdTarget > 0 ? Math.round((ytdAchieved / ytdTarget) * 100) : 0,
      };
    })
    .filter((c) => !c.name?.toLowerCase().includes("vishal"))
    .sort((a, b) => b.ytdPct - a.ytdPct);

  const pctColor = (p: number) =>
    p >= 100 ? "text-emerald-400" : p >= 50 ? "text-amber-400" : "text-rose-400";

  const monthLabel = format(now, "MMM yyyy");
  const fyLabel = `FY ${String(fyStartYear).slice(2)}-${String(fyStartYear + 1).slice(2)}`;

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white/90 flex items-center justify-center gap-3">
          <Target className="w-7 h-7 text-amber-400" /> Target vs Achievement
        </h2>
        <p className="text-sm text-white/40 uppercase tracking-[4px] mt-2">
          MTD · {monthLabel} &nbsp;·&nbsp; YTD · {fyLabel} (Apr → {format(now, "MMM")})
        </p>
      </div>
      {cards.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-white/40 text-2xl">
          No monthly revenue targets set
        </div>
      ) : (
        <div
          className="flex-1 grid gap-3 min-h-0"
          style={{ gridTemplateRows: `repeat(${cards.length}, minmax(0, 1fr))` }}
        >
          {cards.map((c) => (
            <div
              key={c.userId}
              className="rounded-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10 px-5 py-3 flex items-center gap-5 shadow-xl min-h-0"
            >
              <div className="flex items-center gap-3 w-56 shrink-0">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center font-black text-white text-xl shadow-lg shadow-orange-500/30">
                  {(c.name[0] || "?").toUpperCase()}
                </div>
                <div className="text-xl font-bold truncate">{c.name}</div>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-3 min-w-0">
                <TargetBlock
                  label="MTD"
                  target={c.mtdTarget}
                  achieved={c.mtdAchieved}
                  pct={c.mtdPct}
                  pctClass={pctColor(c.mtdPct)}
                />
                <TargetBlock
                  label="YTD"
                  target={c.ytdTarget}
                  achieved={c.ytdAchieved}
                  pct={c.ytdPct}
                  pctClass={pctColor(c.ytdPct)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TargetBlock({
  label, target, achieved, pct, pctClass,
}: {
  label: string;
  target: number;
  achieved: number;
  pct: number;
  pctClass: string;
}) {
  const fillPct = Math.min(100, pct);
  const barColor =
    pct >= 100
      ? "from-emerald-400 to-teal-500"
      : pct >= 50
        ? "from-amber-400 to-orange-500"
        : "from-rose-400 to-pink-500";
  return (
    <div className="rounded-2xl bg-black/30 border border-white/5 px-4 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[3px] font-bold text-white/60">{label}</span>
        <span className={`text-3xl font-black tabular-nums ${pctClass}`}>{pct}%</span>
      </div>
      <div className="flex items-baseline justify-between text-sm text-white/70 tabular-nums">
        <span>{fmtL(achieved)}</span>
        <span className="text-white/40">of {fmtL(target)}</span>
      </div>
      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${barColor} rounded-full transition-all`}
          style={{ width: `${fillPct}%` }}
        />
      </div>
    </div>
  );
}

/* -------------------- helpers -------------------- */
const fmtCr = (n: number) => `₹${(n / 10000000).toFixed(2)} Cr`;
const fmtL = (n: number) => `₹${(n / 100000).toFixed(1)} L`;

function RangeSelector({
  value, onChange, label, start, end,
}: {
  value: RangePreset;
  onChange: (v: RangePreset) => void;
  label: string;
  start: string;
  end: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-white/[0.06] border border-white/10 pl-4 pr-2 py-1.5">
      <Calendar className="w-4 h-4 text-cyan-300" />
      <span className="text-xs uppercase tracking-[3px] font-semibold">{label}</span>
      <span className="text-[11px] text-white/40 ml-1">
        {start === end
          ? format(new Date(start), "dd MMM")
          : `${format(new Date(start), "dd MMM")} – ${format(new Date(end), "dd MMM")}`}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as RangePreset)}
        className="ml-2 rounded-full bg-white/10 hover:bg-white/20 transition text-xs font-semibold px-3 py-1.5 outline-none border border-white/10 text-white cursor-pointer"
        title="Change date range"
      >
        {RANGE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#0b0d14] text-white">
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ============================================================
   Screen 1 — Headline KPIs
   ============================================================ */
function KpiScreen({ board }: { board: ReturnType<typeof useSalesLeaderboard>["leaderboard"] }) {
  const list = board ?? [];
  const totalLeads = list.reduce((s, e) => s + e.leads_handled, 0);
  const totalOrders = list.reduce((s, e) => s + e.orders_won, 0);
  const totalPipeline = list.reduce((s, e) => s + Number(e.total_pipeline_value), 0);
  const totalPoints = list.reduce((s, e) => s + e.total_points, 0);
  const totalOrderValue = list.reduce((s, e) => s + Number(e.total_order_value || 0), 0);
  const conv = totalLeads > 0 ? Math.round((totalOrders / totalLeads) * 100) : 0;

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white/90">Headline Metrics</h2>
        <p className="text-sm text-white/40 uppercase tracking-[4px] mt-2">The numbers that matter, right now</p>
      </div>
      <div className="flex-1 grid grid-cols-5 gap-5">
        <BigKpi icon={Users} label="Team Leads" value={totalLeads.toLocaleString()} from="from-blue-500" to="to-cyan-500" />
        <BigKpi icon={Award} label="Orders Won" value={totalOrders.toLocaleString()} from="from-emerald-500" to="to-green-600" sub={`${conv}% conversion`} />
        <BigKpi icon={DollarSign} label="Order Value" value={fmtCr(totalOrderValue)} from="from-purple-500" to="to-fuchsia-600" />
        <BigKpi icon={TrendingUp} label="Pipeline" value={fmtCr(totalPipeline)} from="from-pink-500" to="to-rose-600" />
        <BigKpi icon={Target} label="Team Points" value={totalPoints.toLocaleString()} from="from-amber-500" to="to-orange-600" />
      </div>
    </div>
  );
}

function BigKpi({
  icon: Icon, label, value, from, to, sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; from: string; to: string; sub?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-3xl p-8 bg-gradient-to-br ${from} ${to} shadow-2xl flex flex-col justify-between`}>
      <div className="absolute -right-8 -top-8 opacity-20">
        <Icon className="w-44 h-44" />
      </div>
      <div className="flex items-center gap-2 text-white/90">
        <Icon className="w-6 h-6" />
        <span className="text-sm uppercase tracking-[3px] font-bold">{label}</span>
      </div>
      <div>
        <div className="text-6xl xl:text-7xl font-black tabular-nums leading-none">{value}</div>
        {sub && <div className="text-sm text-white/80 mt-3 font-semibold">{sub}</div>}
      </div>
    </div>
  );
}

/* ============================================================
   Screen 2 — Leaderboard
   ============================================================ */
function LeaderboardScreen({ board }: { board: ReturnType<typeof useSalesLeaderboard>["leaderboard"] }) {
  const ranked = [...(board ?? [])].sort((a, b) => b.total_points - a.total_points);
  const accentFor = (i: number) => {
    if (i === 0) return "from-amber-300 to-yellow-600 text-black";
    if (i === 1) return "from-slate-200 to-slate-400 text-black";
    if (i === 2) return "from-orange-400 to-amber-700 text-white";
    return "from-white/10 to-white/5 text-white";
  };

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white/90 flex items-center justify-center gap-3">
          <Trophy className="w-8 h-8 text-amber-400" /> Top Performers
        </h2>
        <p className="text-sm text-white/40 uppercase tracking-[4px] mt-2">Ranked by sales points</p>
      </div>
      <div className="flex-1 grid gap-3 min-h-0 overflow-y-auto pr-1" style={{ gridAutoRows: 'minmax(96px, auto)' }}>
        {ranked.length === 0 && (
          <div className="flex items-center justify-center text-white/40 text-2xl">No activity yet</div>
        )}
        {ranked.map((e, i) => (
          <div
            key={e.user_id}
            className="flex items-center gap-6 rounded-2xl bg-white/[0.04] border border-white/10 px-6 py-3"
          >
            <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${accentFor(i)} flex items-center justify-center font-black text-5xl shadow-xl shrink-0`}>
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-3xl font-bold truncate">{e.user_name || "Unknown"}</div>
              <div className="text-sm text-white/50 mt-1">
                {e.leads_handled} leads handled · {e.orders_won} orders won · {fmtL(Number(e.total_order_value || 0))} revenue
              </div>
            </div>
            <div className="text-right">
              <div className="text-5xl font-black text-amber-300 tabular-nums">{e.total_points.toLocaleString()}</div>
              <div className="text-[10px] uppercase tracking-[3px] text-white/40">points</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   Screen 3 — Lead Sources
   ============================================================ */
function LeadSourcesScreen({ dist }: { dist: ReturnType<typeof useLeadDistribution>["data"] extends infer T ? any : any }) {
  const totals = (dist ?? []).reduce(
    (acc: any, e: any) => {
      acc.enquiry += e.sources.enquiry;
      acc.call += e.sources.call;
      acc.form += e.sources.form;
      acc.email += e.sources.email;
      acc.interakt += e.sources.interakt;
      return acc;
    },
    { enquiry: 0, call: 0, form: 0, email: 0, interakt: 0 },
  );
  const grand = totals.enquiry + totals.call + totals.form + totals.email + totals.interakt;

  const cards = [
    { key: "enquiry", label: "Enquiries", icon: MessageSquare, value: totals.enquiry, from: "from-cyan-500", to: "to-blue-600" },
    { key: "call", label: "Calls", icon: Phone, value: totals.call, from: "from-emerald-500", to: "to-teal-600" },
    { key: "form", label: "QForms", icon: FileText, value: totals.form, from: "from-purple-500", to: "to-violet-600" },
    { key: "email", label: "Email", icon: Mail, value: totals.email, from: "from-pink-500", to: "to-rose-600" },
    { key: "interakt", label: "WhatsApp", icon: Send, value: totals.interakt, from: "from-amber-500", to: "to-orange-600" },
  ];

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white/90 flex items-center justify-center gap-3">
          <Send className="w-7 h-7 text-cyan-400" /> Lead Sources
        </h2>
        <p className="text-sm text-white/40 uppercase tracking-[4px] mt-2">
          {grand.toLocaleString()} total leads · channel breakdown
        </p>
      </div>
      <div className="flex-1 grid grid-cols-5 gap-5">
        {cards.map((c) => {
          const pct = grand > 0 ? Math.round((c.value / grand) * 100) : 0;
          const Icon = c.icon;
          return (
            <div
              key={c.key}
              className={`relative overflow-hidden rounded-3xl p-6 bg-gradient-to-br ${c.from} ${c.to} shadow-2xl flex flex-col justify-between`}
            >
              <div className="absolute -right-6 -top-6 opacity-15">
                <Icon className="w-36 h-36" />
              </div>
              <div className="flex items-center gap-2 text-white/90">
                <Icon className="w-5 h-5" />
                <span className="text-xs uppercase tracking-[3px] font-bold">{c.label}</span>
              </div>
              <div>
                <div className="text-7xl font-black tabular-nums leading-none">{c.value.toLocaleString()}</div>
                <div className="text-sm text-white/80 mt-3 font-semibold">{pct}% of total</div>
                <div className="mt-2 h-1.5 rounded-full bg-black/30 overflow-hidden">
                  <div className="h-full bg-white/80 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   Screen 4 — Lead Distribution by Rep
   ============================================================ */
function LeadDistributionScreen({
  dist, total,
}: {
  dist: any[]; total: number;
}) {
  const top = (dist ?? []).slice(0, 6);

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white/90 flex items-center justify-center gap-3">
          <Users className="w-7 h-7 text-blue-400" /> Lead Distribution
        </h2>
        <p className="text-sm text-white/40 uppercase tracking-[4px] mt-2">
          {total.toLocaleString()} leads · share by sales person
        </p>
      </div>
      <div className="flex-1 grid gap-3 min-h-0" style={{ gridTemplateRows: `repeat(${Math.max(top.length, 1)}, minmax(0, 1fr))` }}>
        {top.length === 0 && (
          <div className="flex items-center justify-center text-white/40 text-2xl">No leads yet</div>
        )}
        {top.map((d) => {
          const pct = total > 0 ? Math.round((d.leads / total) * 100) : 0;
          return (
            <div key={d.key} className="rounded-2xl bg-white/[0.04] border border-white/10 px-6 py-4 flex flex-col justify-center gap-2">
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold truncate">{d.name}</div>
                <div className="flex items-baseline gap-3">
                  <div className="text-4xl font-black tabular-nums">{d.leads}</div>
                  <div className="text-lg text-white/50 tabular-nums">{pct}%</div>
                </div>
              </div>
              <div className="h-3 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-400 via-cyan-400 to-emerald-400 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-white/40">
                {d.sources.enquiry > 0 && <span>Enq {d.sources.enquiry}</span>}
                {d.sources.call > 0 && <span>· Calls {d.sources.call}</span>}
                {d.sources.form > 0 && <span>· QForms {d.sources.form}</span>}
                {d.sources.email > 0 && <span>· Email {d.sources.email}</span>}
                {d.sources.interakt > 0 && <span>· WA {d.sources.interakt}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}