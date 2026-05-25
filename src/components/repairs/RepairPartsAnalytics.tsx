import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { IndianRupee, TrendingUp, Package } from "lucide-react";
import type { Repair } from "@/hooks/useRepairs";

interface Props {
  repairs: Repair[];
}

export function RepairPartsAnalytics({ repairs }: Props) {
  const { totalCost, totalRevenue, profit, margin, topParts } = useMemo(() => {
    let totalCost = 0;
    let totalRevenue = 0;
    const usage = new Map<string, { name: string; code: string | null; qty: number; uses: number }>();

    for (const r of repairs) {
      totalCost += Number(r.total_component_cost ?? 0);
      totalRevenue += Number(r.inspection_charges ?? 0) + Number(r.repair_cost_charged ?? 0);
      for (const c of r.components_replaced ?? []) {
        if (!c.part_id) continue;
        const key = c.part_id;
        const prev = usage.get(key) ?? { name: c.name, code: c.part_code ?? null, qty: 0, uses: 0 };
        prev.qty += c.quantity ?? 1;
        prev.uses += 1;
        usage.set(key, prev);
      }
    }

    const profit = totalRevenue - totalCost;
    const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
    const topParts = Array.from(usage.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    return { totalCost, totalRevenue, profit, margin, topParts };
  }, [repairs]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Parts Cost vs Repair Revenue
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Components Cost" value={`₹${totalCost.toLocaleString("en-IN")}`} icon={Package} />
          <Stat label="Repair Revenue" value={`₹${totalRevenue.toLocaleString("en-IN")}`} icon={IndianRupee} />
          <Stat
            label="Gross Profit"
            value={`₹${profit.toLocaleString("en-IN")}`}
            valueClass={profit >= 0 ? "text-green-600" : "text-red-600"}
          />
          <Stat
            label="Margin"
            value={`${margin.toFixed(1)}%`}
            valueClass={profit >= 0 ? "text-green-600" : "text-red-600"}
          />
        </div>

        {topParts.length > 0 && (
          <div>
            <div className="text-sm font-medium mb-2">Top parts consumed</div>
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Part</TableHead>
                    <TableHead className="text-right">Qty used</TableHead>
                    <TableHead className="text-right">Repairs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topParts.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        {p.code && <div className="text-xs text-muted-foreground font-mono">{p.code}</div>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">{p.qty}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{p.uses}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  valueClass,
  icon: Icon,
}: {
  label: string;
  value: string;
  valueClass?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="p-3 rounded-md border bg-muted/30">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <div className={`text-lg font-semibold mt-1 ${valueClass ?? ""}`}>{value}</div>
    </div>
  );
}