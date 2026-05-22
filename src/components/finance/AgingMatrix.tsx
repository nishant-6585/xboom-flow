import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  CalendarIcon,
  CheckCircle2,
  Clock,
  Download,
  IndianRupee,
  Search,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { TableSkeleton } from "@/components/data-states/TableSkeleton";
import { EmptyState } from "@/components/data-states/EmptyState";
import { DataErrorState } from "@/components/data-states/DataErrorState";
import { AgingDrillDownSheet } from "./AgingDrillDownSheet";
import type {
  AgingBucket,
  AgingResult,
  AgingRow,
} from "@/hooks/useAgingShared";

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

type SortKey =
  | "name"
  | "current"
  | "bucket_0_30"
  | "bucket_31_60"
  | "bucket_61_90"
  | "bucket_90_plus"
  | "total";

interface Props {
  title: string;
  data: AgingResult | undefined;
  isLoading: boolean;
  error: unknown;
  rowLabel: string;
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (v: string) => void;
  asOfDate: Date;
  onAsOfDateChange: (d: Date) => void;
  onExport: () => void;
  kind: "ar" | "ap";
}

function cellClass(bucket: AgingBucket, empty: boolean) {
  if (empty) return "text-muted-foreground/60";
  switch (bucket) {
    case "current": return "bg-muted/40";
    case "0-30": return "bg-success/10 text-success-foreground";
    case "31-60": return "bg-warning/15 text-warning-foreground";
    case "61-90": return "bg-orange-500/20 dark:bg-orange-500/15";
    case "90+": return "bg-destructive/15 text-destructive-foreground";
  }
}

const fmt = (n: number) => (n > 0 ? INR.format(n) : "—");

export function AgingMatrix({
  title,
  data,
  isLoading,
  error,
  rowLabel,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  asOfDate,
  onAsOfDateChange,
  onExport,
  kind,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [drill, setDrill] = useState<{
    row: AgingRow;
    bucket: AgingBucket | "all";
  } | null>(null);

  const sorted = useMemo(() => {
    if (!data) return [];
    const arr = [...data.matrix];
    arr.sort((a, b) => {
      const av = sortKey === "name" ? a.name : (a[sortKey] as number);
      const bv = sortKey === "name" ? b.name : (b[sortKey] as number);
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc"
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number);
    });
    return arr;
  }, [data, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "name" ? "asc" : "desc");
    }
  };

  const overduePct =
    data && data.kpis.totalOutstanding > 0
      ? (data.kpis.totalOverdue / data.kpis.totalOutstanding) * 100
      : 0;

  return (
    <div className="space-y-4">
      {/* Header strip */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground">
            Outstanding balances bucketed by days past due, as of selected date.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <CalendarIcon className="h-4 w-4" />
                As of {format(asOfDate, "dd MMM yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-0">
              <Calendar
                mode="single"
                selected={asOfDate}
                onSelect={(d) => d && onAsOfDateChange(d)}
                disabled={(d) => d > new Date()}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-8 h-9 w-[220px]"
            />
          </div>
          <Button variant="outline" size="sm" onClick={onExport} disabled={!data || data.matrix.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Export
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard icon={<IndianRupee className="h-4 w-4" />} label="Total Outstanding"
          value={INR.format(data?.kpis.totalOutstanding ?? 0)} />
        <KpiCard icon={<Clock className="h-4 w-4 text-warning" />} label="Total Overdue"
          value={INR.format(data?.kpis.totalOverdue ?? 0)}
          sub={data && data.kpis.totalOutstanding > 0 ? `${overduePct.toFixed(1)}% of outstanding` : undefined} />
        <KpiCard icon={<AlertTriangle className="h-4 w-4 text-destructive" />} label="90+ Days Critical"
          value={INR.format(data?.kpis.overdue90PlusValue ?? 0)}
          sub={`${data?.kpis.overdue90PlusCount ?? 0} item(s)`} valueClass="text-destructive" />
        <KpiCard icon={<Clock className="h-4 w-4" />} label="Avg Days Overdue"
          value={`${Math.round(data?.kpis.averageDaysOverdue ?? 0)}d`}
          sub="weighted by amount" />
        <KpiCard icon={<Users className="h-4 w-4" />} label={`${rowLabel}s with overdue`}
          value={`${data?.kpis.counterpartiesWithOverdue ?? 0}`} />
      </div>

      {/* Matrix table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4">
              <TableSkeleton rows={6} columns={7} />
            </div>
          ) : error ? (
            <DataErrorState message="Could not load aging data." />
          ) : !data || data.totals.grand === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No outstanding balances"
              description={
                searchValue
                  ? `No matches for "${searchValue}".`
                  : "Nothing to age — everything is settled 🎉"
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <SortableHead label={rowLabel} k="name" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="left" sticky />
                    <SortableHead label="Current" k="current" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <SortableHead label="1-30" k="bucket_0_30" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <SortableHead label="31-60" k="bucket_31_60" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <SortableHead label="61-90" k="bucket_61_90" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <SortableHead label="90+" k="bucket_90_plus" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <SortableHead label="Total" k="total" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((row) => (
                    <TableRow key={row.name} className="hover:bg-muted/30">
                      <TableCell
                        className="sticky left-0 bg-background font-medium cursor-pointer hover:underline max-w-[260px] truncate"
                        onClick={() => setDrill({ row, bucket: "all" })}
                      >
                        {row.name}
                      </TableCell>
                      {(
                        [
                          ["current", row.current],
                          ["0-30", row.bucket_0_30],
                          ["31-60", row.bucket_31_60],
                          ["61-90", row.bucket_61_90],
                          ["90+", row.bucket_90_plus],
                        ] as Array<[AgingBucket, number]>
                      ).map(([b, v]) => (
                        <TableCell
                          key={b}
                          className={cn(
                            "text-right tabular-nums cursor-pointer",
                            cellClass(b, v <= 0),
                          )}
                          onClick={() => v > 0 && setDrill({ row, bucket: b })}
                        >
                          {fmt(v)}
                        </TableCell>
                      ))}
                      <TableCell className="text-right tabular-nums font-semibold">
                        {INR.format(row.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter className="sticky bottom-0 bg-background">
                  <TableRow>
                    <TableCell className="sticky left-0 bg-background font-semibold">Total</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmt(data.totals.current)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmt(data.totals.bucket_0_30)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmt(data.totals.bucket_31_60)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmt(data.totals.bucket_61_90)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmt(data.totals.bucket_90_plus)}</TableCell>
                    <TableCell className="text-right tabular-nums font-bold">{INR.format(data.totals.grand)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AgingDrillDownSheet
        open={drill !== null}
        onOpenChange={(o) => !o && setDrill(null)}
        counterpartyName={drill?.row.name ?? null}
        items={drill?.row.items ?? []}
        bucket={drill?.bucket ?? "all"}
        rowLabel={rowLabel}
        kind={kind}
      />
    </div>
  );
}

function KpiCard({
  icon, label, value, sub, valueClass,
}: { icon: React.ReactNode; label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <p className={cn("text-lg font-bold", valueClass)}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function SortableHead({
  label, k, sortKey, sortDir, onClick, align = "right", sticky = false,
}: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: "asc" | "desc";
  onClick: (k: SortKey) => void; align?: "left" | "right"; sticky?: boolean;
}) {
  const active = sortKey === k;
  return (
    <TableHead
      onClick={() => onClick(k)}
      className={cn(
        "cursor-pointer select-none whitespace-nowrap",
        align === "right" ? "text-right" : "text-left",
        sticky && "sticky left-0 bg-background z-10",
      )}
    >
      <span className={cn(active && "text-foreground font-semibold")}>
        {label}{active ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
      </span>
    </TableHead>
  );
}