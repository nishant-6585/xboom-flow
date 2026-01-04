import { ProductQuery } from "@/types/query";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { getSlaStatus } from "@/lib/sla";

interface SlaStatsCardsProps {
  queries: ProductQuery[];
}

export function SlaStatsCards({ queries }: SlaStatsCardsProps) {
  const slaStats = queries.reduce(
    (acc, query) => {
      const isResponded = query.status === "confirmed" || query.status === "rejected";
      const respondedAt = isResponded ? query.updatedAt : null;
      const status = getSlaStatus(query.createdAt, respondedAt, query.urgency, isResponded);

      if (status === "met") acc.met++;
      else if (status === "delayed") acc.delayed++;
      else if (status === "breached") acc.breached++;
      else if (status === "at_risk") acc.atRisk++;
      else acc.onTrack++;

      return acc;
    },
    { met: 0, delayed: 0, breached: 0, atRisk: 0, onTrack: 0 }
  );

  const totalResponded = slaStats.met + slaStats.delayed;
  const slaComplianceRate = totalResponded > 0 
    ? Math.round((slaStats.met / totalResponded) * 100) 
    : 100;

  const cards = [
    {
      label: "SLA Met",
      value: slaStats.met,
      icon: CheckCircle2,
      color: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "Delayed",
      value: slaStats.delayed,
      icon: XCircle,
      color: "text-destructive",
      bg: "bg-destructive/10",
    },
    {
      label: "At Risk",
      value: slaStats.atRisk,
      icon: AlertTriangle,
      color: "text-warning",
      bg: "bg-warning/10",
    },
    {
      label: "SLA Breached",
      value: slaStats.breached,
      icon: XCircle,
      color: "text-destructive",
      bg: "bg-destructive/10",
    },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">SLA Performance</h3>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10">
          <span className="text-sm text-muted-foreground">Compliance Rate:</span>
          <span className={`text-lg font-bold ${slaComplianceRate >= 80 ? 'text-success' : slaComplianceRate >= 50 ? 'text-warning' : 'text-destructive'}`}>
            {slaComplianceRate}%
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.label} className="glass">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className="text-2xl font-bold mt-1">{card.value}</p>
                </div>
                <div className={`p-3 rounded-lg ${card.bg}`}>
                  <card.icon className={`w-5 h-5 ${card.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
