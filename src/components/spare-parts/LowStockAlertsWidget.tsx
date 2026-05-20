import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { useSpareParts } from "@/hooks/useSpareParts";

export function LowStockAlertsWidget() {
  const { list } = useSpareParts();
  const alerts = (list.data ?? []).filter(
    (p) => p.stock_status === "LOW_STOCK" || p.stock_status === "SOLD_OUT",
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          Low Stock Alerts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">All spare parts adequately stocked.</p>
        ) : (
          alerts.slice(0, 6).map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0"
            >
              <div>
                <div className="font-medium">{p.part_name}</div>
                <div className="text-xs text-muted-foreground">{p.part_code}</div>
              </div>
              <div
                className={p.stock_status === "SOLD_OUT" ? "text-destructive" : "text-warning"}
              >
                {p.quantity} {p.quantity === 1 ? "unit" : "units"} remaining
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}