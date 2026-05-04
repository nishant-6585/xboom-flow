import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { Activity, CheckCircle2, AlertCircle } from "lucide-react";
import { useTouchedStats, type TouchedSource } from "@/hooks/useTouchedStats";

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
  const { data, isLoading } = useTouchedStats(source);

  if (isLoading) {
    return (
      <Card className="glass">
        <CardHeader><CardTitle className="text-base">Touched vs Untouched</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-64 w-full" /></CardContent>
      </Card>
    );
  }
  if (!data || data.total === 0) {
    return (
      <Card className="glass">
        <CardHeader><CardTitle className="text-base">{title ?? "Touched vs Untouched"}</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">No leads in this source yet.</p></CardContent>
      </Card>
    );
  }

  const chartData = data.bySalesperson.map((s) => ({
    name: s.name,
    Touched: s.touched,
    Untouched: s.untouched,
  }));

  return (
    <Card className="glass">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            {title ?? "Touched vs Untouched by Salesperson"}
          </CardTitle>
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
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 40 }}>
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
              <Bar dataKey="Touched" stackId="a" fill="hsl(142 71% 45%)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Untouched" stackId="a" fill="hsl(38 92% 50%)" radius={[4, 4, 0, 0]}>
                {chartData.map((_, i) => <Cell key={i} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Salesperson</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Touched</TableHead>
                <TableHead className="text-right">Untouched</TableHead>
                <TableHead className="text-right">Touched %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.bySalesperson.map((s) => (
                <TableRow key={s.name}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-right">{s.total}</TableCell>
                  <TableCell className="text-right text-emerald-600 font-medium">{s.touched}</TableCell>
                  <TableCell className="text-right text-amber-600 font-medium">{s.untouched}</TableCell>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}