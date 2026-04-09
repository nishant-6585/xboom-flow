import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserCheck } from "lucide-react";
import { useLeadDistribution } from "@/hooks/useLeadDistribution";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const COLORS = [
  "hsl(221, 83%, 53%)",
  "hsl(142, 71%, 45%)",
  "hsl(262, 83%, 58%)",
  "hsl(25, 95%, 53%)",
  "hsl(346, 77%, 50%)",
  "hsl(199, 89%, 48%)",
  "hsl(47, 96%, 53%)",
  "hsl(173, 80%, 40%)",
];

interface Props {
  startDate: string;
  endDate: string;
}

export function LeadDistributionChart({ startDate, endDate }: Props) {
  const { data: result, isLoading } = useLeadDistribution(startDate, endDate);
  const entries = result?.data || [];
  const totalLeads = result?.total || 0;

  const chartData = entries
    .filter((d) => d.leads > 0)
    .map((d) => ({
      ...d,
      percent: totalLeads > 0 ? ((d.leads / totalLeads) * 100).toFixed(1) : "0",
    }));

  const barData = entries.filter((d) => d.leads > 0).map((d) => ({
    name: d.name.split(" ")[0],
    Enquiry: d.sources.enquiry,
    Call: d.sources.call,
    Form: d.sources.form,
    Email: d.sources.email,
    Interakt: d.sources.interakt,
    total: d.leads,
  }));

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center h-[380px]">
          <p className="text-muted-foreground text-sm">Loading lead distribution...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-primary" />
          Lead Distribution by Salesperson
          <span className="ml-auto text-sm font-normal text-muted-foreground">
            Total: {totalLeads} leads
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="chart">
          <TabsList className="mb-4">
            <TabsTrigger value="chart">Chart</TabsTrigger>
            <TabsTrigger value="source">By Source</TabsTrigger>
            <TabsTrigger value="table">Table</TabsTrigger>
          </TabsList>

          <TabsContent value="chart">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={95}
                    paddingAngle={3}
                    dataKey="leads"
                    label={({ name, percent }) => `${name.split(" ")[0]} ${percent}%`}
                  >
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number) => [
                      `${value} (${totalLeads > 0 ? ((value / totalLeads) * 100).toFixed(1) : 0}%)`,
                      "Leads",
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 max-h-[280px] overflow-y-auto">
                <div className="grid grid-cols-3 text-xs font-semibold text-muted-foreground border-b pb-1">
                  <span>Salesperson</span>
                  <span className="text-right">Leads</span>
                  <span className="text-right">%</span>
                </div>
                {chartData.map((d, i) => (
                  <div key={d.name} className="grid grid-cols-3 text-sm items-center py-1">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
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
          </TabsContent>

          <TabsContent value="source">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="Enquiry" stackId="a" fill="hsl(221, 83%, 53%)" />
                <Bar dataKey="Call" stackId="a" fill="hsl(142, 71%, 45%)" />
                <Bar dataKey="Form" stackId="a" fill="hsl(25, 95%, 53%)" />
                <Bar dataKey="Email" stackId="a" fill="hsl(262, 83%, 58%)" />
                <Bar dataKey="Interakt" stackId="a" fill="hsl(173, 80%, 40%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </TabsContent>

          <TabsContent value="table">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 px-2">Salesperson</th>
                    <th className="text-right py-2 px-2">Enquiry</th>
                    <th className="text-right py-2 px-2">Call</th>
                    <th className="text-right py-2 px-2">Form</th>
                    <th className="text-right py-2 px-2">Email</th>
                    <th className="text-right py-2 px-2">Interakt</th>
                    <th className="text-right py-2 px-2 font-bold">Total</th>
                    <th className="text-right py-2 px-2">%</th>
                  </tr>
                </thead>
                <tbody>
                  {chartData.map((d) => (
                    <tr key={d.name} className="border-b border-border/50">
                      <td className="py-2 px-2 font-medium">{d.name}</td>
                      <td className="text-right py-2 px-2">{d.sources.enquiry}</td>
                      <td className="text-right py-2 px-2">{d.sources.call}</td>
                      <td className="text-right py-2 px-2">{d.sources.form}</td>
                      <td className="text-right py-2 px-2">{d.sources.email}</td>
                      <td className="text-right py-2 px-2">{d.sources.interakt}</td>
                      <td className="text-right py-2 px-2 font-bold">{d.leads}</td>
                      <td className="text-right py-2 px-2 text-muted-foreground">{d.percent}%</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold border-t">
                    <td className="py-2 px-2">Total</td>
                    <td className="text-right py-2 px-2">{entries.reduce((s, e) => s + e.sources.enquiry, 0)}</td>
                    <td className="text-right py-2 px-2">{entries.reduce((s, e) => s + e.sources.call, 0)}</td>
                    <td className="text-right py-2 px-2">{entries.reduce((s, e) => s + e.sources.form, 0)}</td>
                    <td className="text-right py-2 px-2">{entries.reduce((s, e) => s + e.sources.email, 0)}</td>
                    <td className="text-right py-2 px-2">{entries.reduce((s, e) => s + e.sources.interakt, 0)}</td>
                    <td className="text-right py-2 px-2">{totalLeads}</td>
                    <td className="text-right py-2 px-2">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
