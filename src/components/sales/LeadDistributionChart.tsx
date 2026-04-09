import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserCheck } from "lucide-react";
import { useLeadDistribution } from "@/hooks/useLeadDistribution";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const COLORS = [
  "hsl(221 83% 53%)",
  "hsl(142 71% 45%)",
  "hsl(262 83% 58%)",
  "hsl(25 95% 53%)",
  "hsl(346 77% 50%)",
  "hsl(199 89% 48%)",
  "hsl(47 96% 53%)",
  "hsl(173 80% 40%)",
];

interface Props {
  startDate: string;
  endDate: string;
}

export function LeadDistributionChart({ startDate, endDate }: Props) {
  const { data: result, isLoading } = useLeadDistribution(startDate, endDate);
  const entries = result?.data || [];
  const totalLeads = result?.total || 0;
  const totalProspects = result?.totalProspects || 0;
  const totalPipeline = result?.totalPipeline || 0;

  const chartData = entries
    .filter((entry) => entry.leads > 0)
    .map((entry) => ({
      ...entry,
      percent: totalLeads > 0 ? ((entry.leads / totalLeads) * 100).toFixed(1) : "0",
    }));

  const barData = entries
    .filter((entry) => entry.leads > 0)
    .map((entry) => ({
      name: entry.name.split(" ")[0],
      Enquiry: entry.sources.enquiry,
      Call: entry.sources.call,
      Form: entry.sources.form,
      Email: entry.sources.email,
      Interakt: entry.sources.interakt,
      total: entry.leads,
    }));

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex h-[380px] items-center justify-center p-6">
          <p className="text-sm text-muted-foreground">Loading lead distribution...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <UserCheck className="h-5 w-5 text-primary" />
          Lead Distribution by Salesperson
          <div className="ml-auto flex flex-wrap items-center gap-4 text-sm font-normal text-muted-foreground">
            <span>Total Leads: {totalLeads}</span>
            <span>Prospects: {totalProspects}</span>
            <span>Pipeline: {totalPipeline}</span>
          </div>
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
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_1.35fr]">
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={64}
                    outerRadius={108}
                    paddingAngle={3}
                    dataKey="leads"
                    label={({ name, percent }) => `${name.split(" ")[0]} ${((percent || 0) * 100).toFixed(1)}%`}
                  >
                    {chartData.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number, _name, item: { payload?: { prospects?: number; pipeline?: number } }) => [
                      `${value} leads • ${item?.payload?.prospects || 0} prospects • ${item?.payload?.pipeline || 0} pipeline`,
                      "Assigned",
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>

              <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                <div className="grid grid-cols-[minmax(0,1.6fr)_0.8fr_0.8fr_0.8fr_0.7fr] gap-2 border-b pb-2 text-xs font-semibold text-muted-foreground">
                  <span>Salesperson</span>
                  <span className="text-right">Leads</span>
                  <span className="text-right">Prospects</span>
                  <span className="text-right">Pipeline</span>
                  <span className="text-right">%</span>
                </div>
                {chartData.map((entry, index) => (
                  <div key={entry.key} className="grid grid-cols-[minmax(0,1.6fr)_0.8fr_0.8fr_0.8fr_0.7fr] items-center gap-2 py-1 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="truncate">{entry.name}</span>
                    </div>
                    <span className="text-right font-medium">{entry.leads}</span>
                    <span className="text-right">{entry.prospects}</span>
                    <span className="text-right">{entry.pipeline}</span>
                    <span className="text-right text-muted-foreground">{entry.percent}%</span>
                  </div>
                ))}
                <div className="grid grid-cols-[minmax(0,1.6fr)_0.8fr_0.8fr_0.8fr_0.7fr] gap-2 border-t pt-2 text-sm font-bold">
                  <span>Total</span>
                  <span className="text-right">{totalLeads}</span>
                  <span className="text-right">{totalProspects}</span>
                  <span className="text-right">{totalPipeline}</span>
                  <span className="text-right">100%</span>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="source">
            <ResponsiveContainer width="100%" height={320}>
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
                <Bar dataKey="Enquiry" stackId="a" fill="hsl(221 83% 53%)" />
                <Bar dataKey="Call" stackId="a" fill="hsl(142 71% 45%)" />
                <Bar dataKey="Form" stackId="a" fill="hsl(25 95% 53%)" />
                <Bar dataKey="Email" stackId="a" fill="hsl(262 83% 58%)" />
                <Bar dataKey="Interakt" stackId="a" fill="hsl(173 80% 40%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </TabsContent>

          <TabsContent value="table">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="px-2 py-2 text-left">Salesperson</th>
                    <th className="px-2 py-2 text-right">Enquiry</th>
                    <th className="px-2 py-2 text-right">Call</th>
                    <th className="px-2 py-2 text-right">Form</th>
                    <th className="px-2 py-2 text-right">Email</th>
                    <th className="px-2 py-2 text-right">Interakt</th>
                    <th className="px-2 py-2 text-right">Prospects</th>
                    <th className="px-2 py-2 text-right">Pipeline</th>
                    <th className="px-2 py-2 text-right font-bold">Total</th>
                    <th className="px-2 py-2 text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {chartData.map((entry) => (
                    <tr key={entry.key} className="border-b border-border/50">
                      <td className="px-2 py-2 font-medium">{entry.name}</td>
                      <td className="px-2 py-2 text-right">{entry.sources.enquiry}</td>
                      <td className="px-2 py-2 text-right">{entry.sources.call}</td>
                      <td className="px-2 py-2 text-right">{entry.sources.form}</td>
                      <td className="px-2 py-2 text-right">{entry.sources.email}</td>
                      <td className="px-2 py-2 text-right">{entry.sources.interakt}</td>
                      <td className="px-2 py-2 text-right">{entry.prospects}</td>
                      <td className="px-2 py-2 text-right">{entry.pipeline}</td>
                      <td className="px-2 py-2 text-right font-bold">{entry.leads}</td>
                      <td className="px-2 py-2 text-right text-muted-foreground">{entry.percent}%</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-bold">
                    <td className="px-2 py-2">Total</td>
                    <td className="px-2 py-2 text-right">{entries.reduce((sum, entry) => sum + entry.sources.enquiry, 0)}</td>
                    <td className="px-2 py-2 text-right">{entries.reduce((sum, entry) => sum + entry.sources.call, 0)}</td>
                    <td className="px-2 py-2 text-right">{entries.reduce((sum, entry) => sum + entry.sources.form, 0)}</td>
                    <td className="px-2 py-2 text-right">{entries.reduce((sum, entry) => sum + entry.sources.email, 0)}</td>
                    <td className="px-2 py-2 text-right">{entries.reduce((sum, entry) => sum + entry.sources.interakt, 0)}</td>
                    <td className="px-2 py-2 text-right">{totalProspects}</td>
                    <td className="px-2 py-2 text-right">{totalPipeline}</td>
                    <td className="px-2 py-2 text-right">{totalLeads}</td>
                    <td className="px-2 py-2 text-right">100%</td>
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
