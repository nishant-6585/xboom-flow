import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  ComposedChart,
} from "recharts";
import { BarChart3, ChevronDown, ChevronRight } from "lucide-react";
import { format, subDays, startOfDay, startOfWeek } from "date-fns";
import type { ManychatLead } from "@/hooks/useManychatLeads";

const PALETTE = [
  "hsl(var(--primary))",
  "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(217, 91%, 60%)",
  "hsl(280, 65%, 60%)",
  "hsl(0, 72%, 55%)",
  "hsl(190, 80%, 42%)",
];

const TOUCHED = "hsl(142, 71%, 45%)";
const UNTOUCHED = "hsl(38, 92%, 50%)";

const isTouched = (l: ManychatLead) =>
  Boolean(l.disposition) && l.disposition !== "untouched";

const channelOf = (l: ManychatLead): string => {
  const cf = l.custom_fields?.["channel"];
  return String(l.channel || (cf ?? "") || "manychat").toLowerCase();
};

const axis = { fontSize: 11 } as const;

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent className="h-[240px] pt-0">{children}</CardContent>
    </Card>
  );
}

const Empty = () => (
  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
    No data for the current filters
  </div>
);

interface Props {
  /** Leads already filtered by the panel's search/date/channel filters. */
  leads: ManychatLead[];
}

export function ManychatAnalytics({ leads }: Props) {
  const [open, setOpen] = useState(true);
  const [trendMode, setTrendMode] = useState<"daily" | "weekly">("daily");

  // 1. Touched vs Untouched by salesperson
  const bySalesperson = useMemo(() => {
    const map = new Map<string, { name: string; touched: number; untouched: number; prospects: number; total: number }>();
    for (const l of leads) {
      const name = (l.assigned_to_name || "").trim() || "Unassigned";
      const row =
        map.get(name) || { name, touched: 0, untouched: 0, prospects: 0, total: 0 };
      row.total += 1;
      if (isTouched(l)) row.touched += 1;
      else row.untouched += 1;
      if (l.is_prospect) row.prospects += 1;
      map.set(name, row);
    }
    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 12)
      .map((r) => ({
        ...r,
        touchRate: r.total ? Math.round((r.touched / r.total) * 100) : 0,
        conversionPct: r.total ? Math.round((r.prospects / r.total) * 100) : 0,
      }));
  }, [leads]);

  // 2. Contact trend (new contacts + prospects over time)
  const trend = useMemo(() => {
    const buckets = new Map<string, { label: string; contacts: number; touched: number; prospects: number }>();
    const now = new Date();
    const points = trendMode === "daily" ? 30 : 12;
    for (let i = points - 1; i >= 0; i--) {
      const d =
        trendMode === "daily"
          ? startOfDay(subDays(now, i))
          : startOfWeek(subDays(now, i * 7), { weekStartsOn: 1 });
      const key = format(d, "yyyy-MM-dd");
      buckets.set(key, {
        label: format(d, trendMode === "daily" ? "dd MMM" : "'w' dd MMM"),
        contacts: 0,
        touched: 0,
        prospects: 0,
      });
    }
    for (const l of leads) {
      const d = new Date(l.created_at);
      if (isNaN(d.getTime())) continue;
      const key = format(
        trendMode === "daily" ? startOfDay(d) : startOfWeek(d, { weekStartsOn: 1 }),
        "yyyy-MM-dd",
      );
      const slot = buckets.get(key);
      if (!slot) continue;
      slot.contacts += 1;
      if (isTouched(l)) slot.touched += 1;
      if (l.is_prospect) slot.prospects += 1;
    }
    return Array.from(buckets.values());
  }, [leads, trendMode]);

  // 3. Channel split
  const byChannel = useMemo(() => {
    const map = new Map<string, number>();
    leads.forEach((l) => map.set(channelOf(l), (map.get(channelOf(l)) || 0) + 1));
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [leads]);

  // 4. Disposition mix
  const byDisposition = useMemo(() => {
    const map = new Map<string, number>();
    leads.forEach((l) => {
      const k = l.disposition || "untouched";
      map.set(k, (map.get(k) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [leads]);

  // 5. Top interests
  const topInterests = useMemo(() => {
    const map = new Map<string, number>();
    leads.forEach((l) => {
      const p = (l.product_name || "").trim();
      if (!p) return;
      map.set(p, (map.get(p) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name: name.length > 26 ? `${name.slice(0, 26)}…` : name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [leads]);

  // 6. Hour-of-day arrival pattern
  const byHour = useMemo(() => {
    const arr = Array.from({ length: 24 }, (_, h) => ({ hour: `${String(h).padStart(2, "0")}h`, contacts: 0 }));
    leads.forEach((l) => {
      const d = new Date(l.created_at);
      if (!isNaN(d.getTime())) arr[d.getHours()].contacts += 1;
    });
    return arr;
  }, [leads]);

  const totals = useMemo(() => {
    const total = leads.length;
    const touched = leads.filter(isTouched).length;
    const prospects = leads.filter((l) => l.is_prospect).length;
    const unassigned = leads.filter((l) => !l.assigned_to_name).length;
    return {
      total,
      touched,
      untouched: total - touched,
      prospects,
      unassigned,
      touchRate: total ? Math.round((touched / total) * 100) : 0,
      conversion: total ? Math.round((prospects / total) * 1000) / 10 : 0,
    };
  }, [leads]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between gap-2">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5 px-2">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <BarChart3 className="h-4 w-4 text-primary" />
            ManyChat Analytics
          </Button>
        </CollapsibleTrigger>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Badge variant="secondary">{totals.total} contacts</Badge>
          <Badge variant="outline">{totals.touchRate}% touched</Badge>
          <Badge variant="outline">{totals.conversion}% to prospect</Badge>
          {totals.unassigned > 0 && <Badge variant="outline">{totals.unassigned} unassigned</Badge>}
        </div>
      </div>

      <CollapsibleContent className="pt-3">
        <div className="grid gap-3 lg:grid-cols-2">
          <ChartCard
            title="Touched vs Untouched by Salesperson"
            subtitle="Touched = a disposition has been set on the contact"
          >
            {bySalesperson.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bySalesperson} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                  <XAxis dataKey="name" tick={axis} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="square" iconSize={9} />
                  <Bar dataKey="touched" name="Touched" stackId="a" fill={TOUCHED} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="untouched" name="Untouched" stackId="a" fill={UNTOUCHED} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-sm">ManyChat Contact Trend</CardTitle>
                <p className="text-xs text-muted-foreground">New contacts, touched and prospects over time</p>
              </div>
              <div className="flex gap-1">
                {(["daily", "weekly"] as const).map((m) => (
                  <Button
                    key={m}
                    size="sm"
                    variant={trendMode === m ? "default" : "outline"}
                    className="h-7 px-2 text-xs capitalize"
                    onClick={() => setTrendMode(m)}
                  >
                    {m}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="h-[240px] pt-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="mcContacts" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                  <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="square" iconSize={9} />
                  <Area type="monotone" dataKey="contacts" name="Contacts" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#mcContacts)" />
                  <Area type="monotone" dataKey="touched" name="Touched" stroke={TOUCHED} strokeWidth={2} fillOpacity={0} />
                  <Area type="monotone" dataKey="prospects" name="Prospects" stroke="hsl(280, 65%, 60%)" strokeWidth={2} fillOpacity={0} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <ChartCard
            title="Prospect Conversion from ManyChat"
            subtitle="Contacts vs prospects created, with conversion rate per salesperson"
          >
            {bySalesperson.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={bySalesperson} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                  <XAxis dataKey="name" tick={axis} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis yAxisId="left" tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" tick={axis} tickLine={false} axisLine={false} unit="%" />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="square" iconSize={9} />
                  <Bar yAxisId="left" dataKey="total" name="Contacts" fill="hsl(217, 91%, 60%)" radius={[3, 3, 0, 0]} />
                  <Bar yAxisId="left" dataKey="prospects" name="Prospects" fill="hsl(280, 65%, 60%)" radius={[3, 3, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="conversionPct" name="Conversion %" stroke="hsl(38, 92%, 50%)" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Channel Split" subtitle="Where ManyChat contacts come from">
            {byChannel.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byChannel} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                    {byChannel.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Disposition Mix" subtitle="Quality breakdown of ManyChat contacts">
            {byDisposition.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byDisposition} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={axis} tickLine={false} axisLine={false} width={100} />
                  <Tooltip />
                  <Bar dataKey="value" name="Contacts" radius={[0, 3, 3, 0]}>
                    {byDisposition.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Top Product Interests" subtitle="Most requested products in ManyChat conversations">
            {topInterests.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topInterests} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={axis} tickLine={false} axisLine={false} width={140} />
                  <Tooltip />
                  <Bar dataKey="value" name="Contacts" fill="hsl(var(--primary))" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Contact Arrival by Hour" subtitle="When ManyChat leads come in — plan staffing around peaks">
            {leads.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={byHour} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                  <XAxis dataKey="hour" tick={axis} tickLine={false} axisLine={false} interval={2} />
                  <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="contacts" name="Contacts" stroke="hsl(190, 80%, 42%)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}