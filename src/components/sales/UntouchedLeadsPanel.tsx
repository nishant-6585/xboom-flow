import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, LineChart, Line,
} from "recharts";
import {
  AlertTriangle, Clock, Users, TrendingUp, Eye, Timer, Flame, BarChart3,
} from "lucide-react";
import { useUntouchedLeads, useUntouchedStats, type UntouchedLead } from "@/hooks/useUntouchedLeads";
import { formatDistanceToNow } from "date-fns";

const BUCKET_COLORS: Record<string, string> = {
  "T+1": "#eab308",
  "T+2": "#f97316",
  "T+3": "#ef4444",
  "T++": "#991b1b",
};

const TAG_COLORS: Record<string, string> = {
  "Responsive": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  "Delay Risk": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  "Chronic Delayer": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  "Severe Backlog": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

function BucketBadge({ bucket }: { bucket: string }) {
  const colors: Record<string, string> = {
    "T+1": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    "T+2": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    "T+3": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    "T++": "bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-300",
  };
  return <Badge className={`${colors[bucket] || ""} font-mono text-xs`}>{bucket}</Badge>;
}

function SourceBadge({ source }: { source: string }) {
  const colors: Record<string, string> = {
    enquiry: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    call: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    form: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    email: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  };
  return <Badge variant="outline" className={colors[source] || ""}>{source}</Badge>;
}

export function UntouchedLeadsPanel() {
  const { data: leads, isLoading } = useUntouchedLeads();
  const stats = useUntouchedStats(leads);
  const [filterSP, setFilterSP] = useState("all");
  const [filterBucket, setFilterBucket] = useState("all");
  const [filterSource, setFilterSource] = useState("all");

  const salespersons = useMemo(() => {
    if (!leads) return [];
    const set = new Set(leads.map((l) => l.sales_person_name || "Unassigned"));
    return Array.from(set).sort();
  }, [leads]);

  const filteredLeads = useMemo(() => {
    if (!leads) return [];
    return leads.filter((l) => {
      if (filterSP !== "all" && (l.sales_person_name || "Unassigned") !== filterSP) return false;
      if (filterBucket !== "all" && l.bucket !== filterBucket) return false;
      if (filterSource !== "all" && l.source !== filterSource) return false;
      return true;
    });
  }, [leads, filterSP, filterBucket, filterSource]);

  // Chart: stacked bar by salesperson
  const stackedData = useMemo(() => {
    return stats.bySalesperson.map((sp) => ({
      name: sp.name.split(" ")[0],
      "T+1": sp.t1, "T+2": sp.t2, "T+3": sp.t3, "T++": sp.tPlus,
    }));
  }, [stats.bySalesperson]);

  // Heatmap data
  const heatmapData = useMemo(() => {
    return stats.bySalesperson.map((sp) => ({
      name: sp.name,
      buckets: [
        { bucket: "T+1", count: sp.t1 },
        { bucket: "T+2", count: sp.t2 },
        { bucket: "T+3", count: sp.t3 },
        { bucket: "T++", count: sp.tPlus },
      ],
    }));
  }, [stats.bySalesperson]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="w-5 h-5 mx-auto mb-1 text-destructive" />
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total Untouched</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="w-3 h-3 rounded-full bg-yellow-500 mx-auto mb-1" />
            <p className="text-2xl font-bold">{stats.t1}</p>
            <p className="text-xs text-muted-foreground">T+1 (24-48h)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="w-3 h-3 rounded-full bg-orange-500 mx-auto mb-1" />
            <p className="text-2xl font-bold">{stats.t2}</p>
            <p className="text-xs text-muted-foreground">T+2 (48-72h)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="w-3 h-3 rounded-full bg-red-500 mx-auto mb-1" />
            <p className="text-2xl font-bold">{stats.t3}</p>
            <p className="text-xs text-muted-foreground">T+3 (72-96h)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Flame className="w-5 h-5 mx-auto mb-1 text-red-700" />
            <p className="text-2xl font-bold">{stats.tPlus}</p>
            <p className="text-xs text-muted-foreground">T++ (96h+)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Timer className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-2xl font-bold">{stats.avgFirstTouchHours.toFixed(0)}h</p>
            <p className="text-xs text-muted-foreground">Avg Delay</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterSP} onValueChange={setFilterSP}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Salesperson" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Salespersons</SelectItem>
            {salespersons.map((sp) => (
              <SelectItem key={sp} value={sp}>{sp}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterBucket} onValueChange={setFilterBucket}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Bucket" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Buckets</SelectItem>
            <SelectItem value="T+1">T+1</SelectItem>
            <SelectItem value="T+2">T+2</SelectItem>
            <SelectItem value="T+3">T+3</SelectItem>
            <SelectItem value="T++">T++</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterSource} onValueChange={setFilterSource}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="enquiry">Enquiry</SelectItem>
            <SelectItem value="call">Call</SelectItem>
            <SelectItem value="form">Form</SelectItem>
            <SelectItem value="email">Email</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="table" className="space-y-4">
        <TabsList>
          <TabsTrigger value="table"><Eye className="w-4 h-4 mr-1" /> Lead Table</TabsTrigger>
          <TabsTrigger value="charts"><BarChart3 className="w-4 h-4 mr-1" /> Dashboard</TabsTrigger>
          <TabsTrigger value="leaderboard"><Users className="w-4 h-4 mr-1" /> Leaderboard</TabsTrigger>
        </TabsList>

        {/* Lead Table */}
        <TabsContent value="table">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                Untouched Leads ({filteredLeads.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bucket</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead>Salesperson</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Delay</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLeads.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          🎉 No untouched leads! Great work, team.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredLeads.map((lead) => (
                        <TableRow key={`${lead.source}-${lead.id}`} className={lead.bucket === "T++" ? "bg-red-50/50 dark:bg-red-900/10" : ""}>
                          <TableCell><BucketBadge bucket={lead.bucket} /></TableCell>
                          <TableCell className="font-medium">{lead.customer_name}</TableCell>
                          <TableCell><SourceBadge source={lead.source} /></TableCell>
                          <TableCell className="text-sm">{lead.product_name || "—"}</TableCell>
                          <TableCell className="text-sm">{lead.city || "—"}</TableCell>
                          <TableCell className="text-sm">{lead.sales_person_name || "Unassigned"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold">
                            {lead.untouched_hours.toFixed(0)}h
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Dashboard Charts */}
        <TabsContent value="charts">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Stacked Bar: Bucket vs Salesperson */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  Bucket vs Salesperson
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={stackedData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                    <Legend />
                    <Bar dataKey="T+1" stackId="a" fill={BUCKET_COLORS["T+1"]} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="T+2" stackId="a" fill={BUCKET_COLORS["T+2"]} />
                    <Bar dataKey="T+3" stackId="a" fill={BUCKET_COLORS["T+3"]} />
                    <Bar dataKey="T++" stackId="a" fill={BUCKET_COLORS["T++"]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Bucket Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  Bucket Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={stats.bucketTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="bucket" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                    <Bar dataKey="count" name="Leads" radius={[4, 4, 0, 0]}>
                      {stats.bucketTrend.map((entry) => (
                        <rect key={entry.bucket} fill={BUCKET_COLORS[entry.bucket] || "#666"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Heatmap */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Flame className="w-4 h-4 text-red-500" />
                  Salesperson × Bucket Heatmap
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[400px]">
                  <div className="space-y-1">
                    {/* Header */}
                    <div className="grid grid-cols-5 gap-1 text-xs font-semibold text-muted-foreground mb-2">
                      <div>Salesperson</div>
                      <div className="text-center">T+1</div>
                      <div className="text-center">T+2</div>
                      <div className="text-center">T+3</div>
                      <div className="text-center">T++</div>
                    </div>
                    {heatmapData.map((sp) => (
                      <div key={sp.name} className="grid grid-cols-5 gap-1 items-center">
                        <div className="text-sm font-medium truncate">{sp.name}</div>
                        {sp.buckets.map((b) => {
                          const intensity = b.count === 0 ? "bg-muted/30" : b.count <= 2 ? "bg-yellow-200 dark:bg-yellow-900/40" : b.count <= 5 ? "bg-orange-300 dark:bg-orange-900/50" : "bg-red-400 dark:bg-red-900/60";
                          return (
                            <div key={b.bucket} className={`${intensity} rounded text-center py-2 text-sm font-semibold`}>
                              {b.count || "—"}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Leaderboard */}
        <TabsContent value="leaderboard">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                Slowest Performers (by Severity Score)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Salesperson</TableHead>
                      <TableHead>Tag</TableHead>
                      <TableHead className="text-center">Total</TableHead>
                      <TableHead className="text-center">T+1</TableHead>
                      <TableHead className="text-center">T+2</TableHead>
                      <TableHead className="text-center">T+3</TableHead>
                      <TableHead className="text-center">T++</TableHead>
                      <TableHead className="text-center">Avg Delay</TableHead>
                      <TableHead className="text-right">Severity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.bySalesperson.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                          No data available
                        </TableCell>
                      </TableRow>
                    ) : (
                      stats.bySalesperson.map((sp, idx) => (
                        <TableRow key={sp.name}>
                          <TableCell className="font-mono text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="font-medium">{sp.name}</TableCell>
                          <TableCell>
                            <Badge className={`${TAG_COLORS[sp.tag] || ""} text-xs`}>{sp.tag}</Badge>
                          </TableCell>
                          <TableCell className="text-center font-semibold">{sp.total}</TableCell>
                          <TableCell className="text-center">{sp.t1 || "—"}</TableCell>
                          <TableCell className="text-center">{sp.t2 || "—"}</TableCell>
                          <TableCell className="text-center">{sp.t3 || "—"}</TableCell>
                          <TableCell className="text-center font-semibold text-red-600">{sp.tPlus || "—"}</TableCell>
                          <TableCell className="text-center">{sp.avgDelay.toFixed(0)}h</TableCell>
                          <TableCell className="text-right font-mono font-bold text-lg">
                            {sp.severityScore}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
