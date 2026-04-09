import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserCheck } from "lucide-react";

interface LeadDistEntry {
  name: string;
  leads: number;
}

const COLORS = [
  "hsl(221, 83%, 53%)", // blue
  "hsl(142, 71%, 45%)", // green
  "hsl(262, 83%, 58%)", // purple
  "hsl(25, 95%, 53%)",  // orange
  "hsl(346, 77%, 50%)", // rose
  "hsl(199, 89%, 48%)", // sky
  "hsl(47, 96%, 53%)",  // yellow
  "hsl(173, 80%, 40%)", // teal
];

interface Props {
  data: LeadDistEntry[];
  totalLeads: number;
}

export function LeadDistributionChart({ data, totalLeads }: Props) {
  const chartData = data
    .filter(d => d.leads > 0)
    .map(d => ({
      ...d,
      percent: totalLeads > 0 ? ((d.leads / totalLeads) * 100).toFixed(1) : "0",
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-primary" />
          Lead Distribution by Salesperson
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Pie Chart */}
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                paddingAngle={3}
                dataKey="leads"
                label={({ name, percent }) => `${name} ${percent}%`}
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                formatter={(value: number) => [
                  `${value} (${totalLeads > 0 ? ((value / totalLeads) * 100).toFixed(1) : 0}%)`,
                  "Leads",
                ]}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Table */}
          <div className="space-y-2 max-h-[280px] overflow-y-auto">
            <div className="grid grid-cols-3 text-xs font-semibold text-muted-foreground border-b pb-1">
              <span>Salesperson</span>
              <span className="text-right">Leads</span>
              <span className="text-right">%</span>
            </div>
            {chartData.map((d, i) => (
              <div key={d.name} className="grid grid-cols-3 text-sm items-center py-1">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  <span className="truncate">{d.name}</span>
                </div>
                <span className="text-right font-medium">{d.leads}</span>
                <span className="text-right text-muted-foreground">{d.percent}%</span>
              </div>
            ))}
            <div className="grid grid-cols-3 text-sm font-bold border-t pt-1 mt-1">
              <span>Total</span>
              <span className="text-right">{totalLeads}</span>
              <span className="text-right">100%</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
