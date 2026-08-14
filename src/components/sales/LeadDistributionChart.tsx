import { useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { UserCheck, ExternalLink } from "lucide-react";
import { useLeadDistribution, LeadDistEntry } from "@/hooks/useLeadDistribution";
import { useLeadDistributionDrillDown } from "@/hooks/useLeadDistributionDrillDown";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";

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

const SOURCE_COLORS: Record<string, string> = {
  Enquiry: "hsl(221 83% 53%)",
  Call: "hsl(142 71% 45%)",
  Form: "hsl(25 95% 53%)",
  Email: "hsl(262 83% 58%)",
  Interakt: "hsl(173 80% 40%)",
};

interface Props {
  startDate: string;
  endDate: string;
}

export function LeadDistributionChart({ startDate, endDate }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: result, isLoading } = useLeadDistribution(startDate, endDate);
  const entries = result?.data || [];
  const totalLeads = result?.total || 0;
  const totalProspects = result?.totalProspects || 0;
  const totalPipeline = result?.totalPipeline || 0;

  // Drill-down state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState("");
  const [drillDownPerson, setDrillDownPerson] = useState<{ name: string; id?: string } | null>(null);
  const [drillDownSource, setDrillDownSource] = useState<string | undefined>();

  const { data: drillDownData, isLoading: drillDownLoading } = useLeadDistributionDrillDown(
    startDate,
    endDate,
    drillDownPerson?.name || null,
    drillDownPerson?.id || null,
    drillDownSource,
  );

  const openDrillDown = useCallback((entry: LeadDistEntry, source?: string) => {
    const userId = entry.key.startsWith("user:") ? entry.key.replace("user:", "") : undefined;
    setDrillDownPerson({ name: entry.name, id: userId });
    setDrillDownSource(source);
    const suffix = source ? ` — ${source}` : "";
    setDialogTitle(`${entry.name}${suffix}`);
    setDialogOpen(true);
  }, []);

  const handleItemClick = useCallback((item: { id: string; tab: string }) => {
    setDialogOpen(false);
    setTimeout(() => {
      setSearchParams(prev => {
        const params = new URLSearchParams(prev);
        params.set("tab", item.tab);
        if (item.id) params.set("leadId", item.id);
        return params;
      });
    }, 150);
  }, [setSearchParams]);

  const chartData = entries
    .filter((entry) => entry.leads > 0)
    .map((entry) => ({
      ...entry,
      percent: totalLeads > 0 ? ((entry.leads / totalLeads) * 100).toFixed(1) : "0",
    }));

  const barData = entries
    .filter((entry) => entry.leads > 0)
    .map((entry) => ({
      ...entry,
      displayName: entry.name.split(" ")[0],
      Enquiry: entry.sources.enquiry,
      Call: entry.sources.call,
      Form: entry.sources.form,
      Email: entry.sources.email,
      Interakt: entry.sources.interakt,
      Other: entry.sources.other,
      total: entry.leads,
    }));

  const handlePieClick = useCallback((_: any, index: number) => {
    const entry = chartData[index];
    if (entry) openDrillDown(entry);
  }, [chartData, openDrillDown]);

  const handleBarClick = useCallback((data: any) => {
    if (!data?.activeLabel) return;
    const entry = barData.find(e => e.displayName === data.activeLabel);
    if (entry) openDrillDown(entry);
  }, [barData, openDrillDown]);

  const handleSourceCellClick = useCallback((entry: LeadDistEntry, source: string) => {
    if ((entry.sources as any)[source.toLowerCase()] > 0) {
      openDrillDown(entry, source);
    }
  }, [openDrillDown]);

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
    <>
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
                      label={({ name, payload }: any) =>
                        `${String(name || "").split(" ")[0]} ${payload?.percent ?? "0"}%`
                      }
                      onClick={handlePieClick}
                      className="cursor-pointer"
                    >
                      {chartData.map((_, index) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} className="cursor-pointer" />
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
                    <div
                      key={entry.key}
                      className="grid grid-cols-[minmax(0,1.6fr)_0.8fr_0.8fr_0.8fr_0.7fr] items-center gap-2 py-1 text-sm cursor-pointer rounded-md hover:bg-muted/50 transition-colors px-1"
                      onClick={() => openDrillDown(entry)}
                    >
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
                <BarChart data={barData} onClick={handleBarClick} className="cursor-pointer">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="displayName" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="Enquiry" stackId="a" fill="hsl(221 83% 53%)" className="cursor-pointer" />
                  <Bar dataKey="Call" stackId="a" fill="hsl(142 71% 45%)" className="cursor-pointer" />
                  <Bar dataKey="Form" stackId="a" fill="hsl(25 95% 53%)" className="cursor-pointer" />
                  <Bar dataKey="Email" stackId="a" fill="hsl(262 83% 58%)" className="cursor-pointer" />
                  <Bar dataKey="Interakt" stackId="a" fill="hsl(173 80% 40%)" radius={[4, 4, 0, 0]} className="cursor-pointer" />
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
                      <tr
                        key={entry.key}
                        className="border-b border-border/50 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => openDrillDown(entry)}
                      >
                        <td className="px-2 py-2 font-medium">{entry.name}</td>
                        <td
                          className="px-2 py-2 text-right cursor-pointer hover:text-primary hover:underline"
                          onClick={(e) => { e.stopPropagation(); handleSourceCellClick(entry, "enquiry"); }}
                        >
                          {entry.sources.enquiry}
                        </td>
                        <td
                          className="px-2 py-2 text-right cursor-pointer hover:text-primary hover:underline"
                          onClick={(e) => { e.stopPropagation(); handleSourceCellClick(entry, "call"); }}
                        >
                          {entry.sources.call}
                        </td>
                        <td
                          className="px-2 py-2 text-right cursor-pointer hover:text-primary hover:underline"
                          onClick={(e) => { e.stopPropagation(); handleSourceCellClick(entry, "form"); }}
                        >
                          {entry.sources.form}
                        </td>
                        <td
                          className="px-2 py-2 text-right cursor-pointer hover:text-primary hover:underline"
                          onClick={(e) => { e.stopPropagation(); handleSourceCellClick(entry, "email"); }}
                        >
                          {entry.sources.email}
                        </td>
                        <td
                          className="px-2 py-2 text-right cursor-pointer hover:text-primary hover:underline"
                          onClick={(e) => { e.stopPropagation(); handleSourceCellClick(entry, "interakt"); }}
                        >
                          {entry.sources.interakt}
                        </td>
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

      {/* Drill-Down Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />
              {dialogTitle}
              {drillDownData && (
                <Badge variant="secondary" className="ml-2">
                  {drillDownData.length} records
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {drillDownLoading ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">Loading details...</p>
              </div>
            ) : !drillDownData?.length ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">No records found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {drillDownData.map((item) => (
                  <div
                    key={`${item.source}-${item.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/50 p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => handleItemClick({ id: item.id, tab: item.tab })}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{item.customer_name || "Unknown"}</span>
                        <Badge
                          variant="outline"
                          className="shrink-0 text-xs"
                          style={{ borderColor: SOURCE_COLORS[item.source] || "hsl(var(--border))", color: SOURCE_COLORS[item.source] }}
                        >
                          {item.source}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {item.product_name && <span className="truncate">{item.product_name}</span>}
                        {item.company && <span className="truncate">• {item.company}</span>}
                        {item.date && <span>• {format(new Date(item.date), "dd MMM yyyy")}</span>}
                      </div>
                    </div>
                    <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
