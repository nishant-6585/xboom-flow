import { Card, CardContent } from "@/components/ui/card";
import { Package, AlertTriangle, XCircle, TrendingUp } from "lucide-react";
import type { SparePart } from "@/hooks/useSpareParts";

export function SparePartsKpiCards({
  parts,
  showProfit = true,
}: {
  parts: SparePart[];
  showProfit?: boolean;
}) {
  const total = parts.length;
  const low = parts.filter((p) => p.stock_status === "LOW_STOCK").length;
  const out = parts.filter((p) => p.stock_status === "SOLD_OUT").length;
  const potentialProfit = parts.reduce(
    (sum, p) => sum + Number(p.profit_per_unit) * Number(p.quantity),
    0,
  );

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Kpi icon={<Package className="h-4 w-4" />} label="Total Spare Parts" value={String(total)} />
      <Kpi
        icon={<AlertTriangle className="h-4 w-4 text-warning" />}
        label="Low Stock Items"
        value={String(low)}
      />
      <Kpi
        icon={<XCircle className="h-4 w-4 text-destructive" />}
        label="Sold Out Items"
        value={String(out)}
      />
      {showProfit && (
        <Kpi
          icon={<TrendingUp className="h-4 w-4 text-success" />}
          label="Potential Profit Value"
          value={`₹${potentialProfit.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
        />
      )}
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          {icon}
          <span>{label}</span>
        </div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}