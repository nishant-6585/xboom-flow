import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { Activity, CheckCircle2, AlertCircle, CalendarIcon } from "lucide-react";
import { useTouchedStats, type TouchedSource, type DateRange as TouchedDateRange } from "@/hooks/useTouchedStats";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

interface Props {
  source: TouchedSource;
  title?: string;
}

/**
 * Shows touched vs untouched leads for the given source, plus a per-salesperson
 * stacked bar chart and table. "Touched" = the assigned salesperson has updated
 * any meaningful field (status moved off default, notes/remark added, or an
 * outcome recorded).
 */
export function TouchedDashboard({ source, title }: Props) {
  type Preset = "all" | "today" | "week" | "month" | "custom";
  const [preset, setPreset] = useState<Preset>("all");
  const [customFrom, setCustomFrom] = useState<Date | undefined>(undefined);
  const [customTo, setCustomTo] = useState<Date | undefined>(undefined);

  const range: TouchedDateRange | null = useMemo(() => {
    const now = new Date();
    if (preset === "today") return { from: startOfDay(now), to: endOfDay(now) };
    if (preset === "week") return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
    if (preset === "month") return { from: startOfMonth(now), to: endOfMonth(now) };
    if (preset === "custom" && (customFrom || customTo)) {
      return {
        from: customFrom ? startOfDay(customFrom) : null,
        to: customTo ? endOfDay(customTo) : null,
      };
    }
    return null;
  }, [preset, customFrom, customTo]);

  const { data, isLoading } = useTouchedStats(source, range);
  const [drill, setDrill] = useState<{ name: string; status: "touched" | "untouched" | "all" } | null>(null);

  const drillRows = useMemo(() => {
    if (!data || !drill) return [];
    return data.rows.filter((r) => {
      const name = r.sales_person_name?.trim() || "Unassigned";
      if (drill.name !== "__ALL__" && name !== drill.name) return false;
      if (drill.status === "touched") return r.touched;
      if (drill.status === "untouched") return !r.touched;
      return true;
    });
  }, [data, drill]);

  if (isLoading) {
    return (
      <Card className="glass">
        <CardHeader><CardTitle className="text-base">Touched vs Untouched</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-64 w-full" /></CardContent>
      </Card>
    );
  }
  const presets: { key: Preset; label: string }[] = [
    { key: "all", label: "All time" },
    { key: "today", label: "Today" },
    { key: "week", label: "This week" },
    { key: "month", label: "This month" },
    { key: "custom", label: "Custom" },
  ];
  const FilterBar = (
    <div className="flex items-center gap-1 flex-wrap">
      {presets.map((p) => (
        <Button
          key={p.key}
          size="sm"
          variant={preset === p.key ? "default" : "outline"}
          className="h-7 px-2 text-xs"
          onClick={() => setPreset(p.key)}
        >
          {p.label}
        </Button>
      ))}
      {preset === "custom" && (
        <>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className={cn("h-7 px-2 text-xs", !customFrom && "text-muted-foreground")}>
                <CalendarIcon className="h-3 w-3 mr-1" />
                {customFrom ? format(customFrom, "dd MMM") : "From"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className={cn("h-7 px-2 text-xs", !customTo && "text-muted-foreground")}>
                <CalendarIcon className="h-3 w-3 mr-1" />
                {customTo ? format(customTo, "dd MMM") : "To"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={customTo} onSelect={setCustomTo} initialFocus className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
        </>
      )}
    </div>
  );

  if (!data || data.total === 0) {
    return (
      <Card className="glass">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">{title ?? "Touched vs Untouched"}</CardTitle>
            {FilterBar}
          </div>
        </CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">No leads in this range.</p></CardContent>
      </Card>
    );
  }

  const chartData = data.bySalesperson.map((s) => ({
    name: s.name,
    Touched: s.touched,
    Untouched: s.untouched,
  }));

  const fmtMoney = (n: number) =>
    n >= 10000000
      ? `₹${(n / 10000000).toFixed(2)}Cr`
      : n >= 100000
      ? `₹${(n / 100000).toFixed(2)}L`
      : n >= 1000
      ? `₹${(n / 1000).toFixed(1)}k`
      : `₹${Math.round(n)}`;

  return (
    <Card className="glass">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            {title ?? "Touched vs Untouched by Salesperson"}
          </CardTitle>
          {FilterBar}
        </div>
        <div className="flex items-center justify-end flex-wrap gap-2 mt-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">Total: <span className="ml-1 font-semibold">{data.total}</span></Badge>
            <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Touched: {data.touched} ({data.touchedPct}%)
            </Badge>
            <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30">
              <AlertCircle className="h-3 w-3 mr-1" />
              Untouched: {data.untouched}
            </Badge>
            <Badge variant="outline" className="border-blue-500/40 text-blue-700">
              Follow-ups: {data.followupsTotal}
            </Badge>
            <Badge variant="outline" className="border-violet-500/40 text-violet-700">
              Prospects: {data.prospectsTotal} ({fmtMoney(data.prospectsValueTotal)})
            </Badge>
            <Badge variant="outline" className="border-indigo-500/40 text-indigo-700">
              Pipeline: {data.pipelineTotal} ({fmtMoney(data.pipelineValueTotal)})
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 16, left: 0, bottom: 40 }}
              onClick={(e: any) => {
                const name = e?.activeLabel as string | undefined;
                if (!name) return;
                const key = e?.activePayload?.[0]?.dataKey as string | undefined;
                setDrill({
                  name,
                  status: key === "Touched" ? "touched" : key === "Untouched" ? "untouched" : "all",
                });
              }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="name" angle={-25} textAnchor="end" height={60} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Touched" stackId="a" fill="hsl(142 71% 45%)" radius={[0, 0, 0, 0]} cursor="pointer" />
              <Bar dataKey="Untouched" stackId="a" fill="hsl(38 92% 50%)" radius={[4, 4, 0, 0]} cursor="pointer">
                {chartData.map((_, i) => <Cell key={i} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-muted-foreground -mt-3">
          💡 Click any bar segment or table cell below to see the underlying leads.
        </p>

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Salesperson</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Touched</TableHead>
                <TableHead className="text-right">Untouched</TableHead>
                <TableHead className="text-right">Touched %</TableHead>
                <TableHead className="text-right">Follow-ups</TableHead>
                <TableHead className="text-right">Prospects</TableHead>
                <TableHead className="text-right">Prospect ₹</TableHead>
                <TableHead className="text-right">Pipeline</TableHead>
                <TableHead className="text-right">Pipeline ₹</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.bySalesperson.map((s) => (
                <TableRow key={s.name} className="hover:bg-muted/40">
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell
                    className="text-right cursor-pointer hover:underline"
                    onClick={() => setDrill({ name: s.name, status: "all" })}
                  >
                    {s.total}
                  </TableCell>
                  <TableCell
                    className="text-right text-emerald-600 font-medium cursor-pointer hover:underline"
                    onClick={() => setDrill({ name: s.name, status: "touched" })}
                  >
                    {s.touched}
                  </TableCell>
                  <TableCell
                    className="text-right text-amber-600 font-medium cursor-pointer hover:underline"
                    onClick={() => setDrill({ name: s.name, status: "untouched" })}
                  >
                    {s.untouched}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant="outline"
                      className={
                        s.touchedPct >= 75
                          ? "border-emerald-500/40 text-emerald-700"
                          : s.touchedPct >= 40
                          ? "border-amber-500/40 text-amber-700"
                          : "border-destructive/40 text-destructive"
                      }
                    >
                      {s.touchedPct}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-blue-600">{s.followups}</TableCell>
                  <TableCell className="text-right text-violet-600">{s.prospects}</TableCell>
                  <TableCell className="text-right text-violet-600 text-xs">{fmtMoney(s.prospectsValue)}</TableCell>
                  <TableCell className="text-right text-indigo-600">{s.pipeline}</TableCell>
                  <TableCell className="text-right text-indigo-600 text-xs">{fmtMoney(s.pipelineValue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {drill?.status === "touched" ? "Touched" : drill?.status === "untouched" ? "Untouched" : "All"} leads
              {drill && drill.name !== "__ALL__" ? ` — ${drill.name}` : ""}
            </DialogTitle>
            <DialogDescription>
              {drillRows.length} lead{drillRows.length === 1 ? "" : "s"}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Salesperson</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Touched</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drillRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.customer_name || "—"}</TableCell>
                    <TableCell>{r.sales_person_name || "Unassigned"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{r.status || "—"}</Badge>
                    </TableCell>
                    <TableCell>
                      {r.touched ? (
                        <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">Touched</Badge>
                      ) : (
                        <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30">Untouched</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.created_at ? format(new Date(r.created_at), "dd MMM yyyy") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {drillRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No leads</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}