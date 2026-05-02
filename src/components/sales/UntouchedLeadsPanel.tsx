import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend,
} from "recharts";
import {
  AlertTriangle, Clock, Users, TrendingUp, Eye, Timer, Flame, BarChart3,
  Phone, Mail, MapPin, Package, User, Calendar, Activity, MessageSquare,
} from "lucide-react";
import { PieChart, Pie, Cell } from "recharts";
import { useUntouchedLeads, useUntouchedStats, type UntouchedLead } from "@/hooks/useUntouchedLeads";
import { formatDistanceToNow, format } from "date-fns";
import { AssigneeCell } from "./AssigneeCell";
import { LinkToCompanyButton } from "./LinkToCompanyButton";

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
    interakt: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
  };
  return <Badge variant="outline" className={colors[source] || ""}>{source}</Badge>;
}

function LeadDetailDialog({ lead, open, onClose }: { lead: UntouchedLead | null; open: boolean; onClose: () => void }) {
  if (!lead) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            {lead.customer_name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <BucketBadge bucket={lead.bucket} />
            <SourceBadge source={lead.source} />
            {lead.status && <Badge variant="outline">{lead.status}</Badge>}
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-start gap-2">
              <Package className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-muted-foreground text-xs">Product</p>
                <p className="font-medium">{lead.product_name || "—"}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-muted-foreground text-xs">City</p>
                <p className="font-medium">{lead.city || "—"}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <User className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-muted-foreground text-xs">Salesperson</p>
                <p className="font-medium">{lead.sales_person_name || "Unassigned"}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Activity className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-muted-foreground text-xs">Lead Source</p>
                <p className="font-medium">{lead.lead_source || "—"}</p>
              </div>
            </div>
            {lead.phone && (
              <div className="flex items-start gap-2">
                <Phone className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-muted-foreground text-xs">Phone</p>
                  <p className="font-medium">{lead.phone}</p>
                </div>
              </div>
            )}
            {lead.email && (
              <div className="flex items-start gap-2">
                <Mail className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-muted-foreground text-xs">Email</p>
                  <p className="font-medium">{lead.email}</p>
                </div>
              </div>
            )}
            {lead.company && (
              <div className="flex items-start gap-2">
                <Activity className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-muted-foreground text-xs">Company</p>
                  <p className="font-medium">{lead.company}</p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-2">
              <Calendar className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-muted-foreground text-xs">Created</p>
                <p className="font-medium">{format(new Date(lead.created_at), "dd MMM yyyy, hh:mm a")}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Clock className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-muted-foreground text-xs">Last Updated</p>
                <p className="font-medium">{format(new Date(lead.updated_at), "dd MMM yyyy, hh:mm a")}</p>
              </div>
            </div>
          </div>

          <Separator />

          <div className="bg-destructive/10 rounded-lg p-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Untouched for</p>
              <p className="text-2xl font-bold text-destructive">{lead.untouched_hours.toFixed(0)}h</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Created</p>
              <p className="text-sm font-medium">{formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function UntouchedLeadsPanel() {
  const { data: leads, isLoading } = useUntouchedLeads();
  const stats = useUntouchedStats(leads);
  const [filterSP, setFilterSP] = useState("all");
  const [filterBucket, setFilterBucket] = useState("all");
  const [filterSource, setFilterSource] = useState("all");
  const [selectedLead, setSelectedLead] = useState<UntouchedLead | null>(null);

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

  // Chart: simple horizontal bar — total untouched per salesperson
  const totalsBySalesperson = useMemo(() => {
    return stats.bySalesperson
      .map((sp) => ({ name: sp.name, total: sp.total }))
      .sort((a, b) => b.total - a.total);
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
            <SelectItem value="call">MyOperator</SelectItem>
            <SelectItem value="form">Form</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="interakt">Interakt</SelectItem>
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
                      <TableHead>Company</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead>Assigned To</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Delay</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLeads.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          🎉 No untouched leads! Great work, team.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredLeads.map((lead) => (
                        <TableRow
                          key={`${lead.source}-${lead.id}`}
                          className={`cursor-pointer hover:bg-muted/60 transition-colors ${lead.bucket === "T++" ? "bg-red-50/50 dark:bg-red-900/10" : ""}`}
                          onClick={() => setSelectedLead(lead)}
                        >
                          <TableCell><BucketBadge bucket={lead.bucket} /></TableCell>
                          <TableCell className="font-medium">{lead.customer_name}</TableCell>
                          <TableCell><SourceBadge source={lead.source} /></TableCell>
                          <TableCell className="text-sm">{lead.product_name || "—"}</TableCell>
                          <TableCell className="text-sm">{(lead as any).company || (lead as any).customer_company || "—"}</TableCell>
                          <TableCell className="text-sm">{lead.city || "—"}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <AssigneeCell userId={(lead as any).sales_person_id} name={lead.sales_person_name} />
                              <LinkToCompanyButton lead={{ customer_name: lead.customer_name, company: (lead as any).company || (lead as any).customer_company, phone: (lead as any).phone, email: (lead as any).email, city: lead.city, source_label: lead.source }} />
                            </div>
                          </TableCell>
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
            {/* Total Untouched by Salesperson — horizontal bars */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4 text-destructive" />
                  Total Untouched Leads — by Salesperson
                </CardTitle>
              </CardHeader>
              <CardContent>
                {totalsBySalesperson.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    🎉 No untouched leads — everyone is on top of their queue.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(180, totalsBySalesperson.length * 36)}>
                    <BarChart
                      data={totalsBySalesperson}
                      layout="vertical"
                      margin={{ top: 8, right: 32, left: 8, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} className="text-xs" />
                      <YAxis type="category" dataKey="name" width={160} className="text-xs" />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                      <Bar dataKey="total" name="Untouched" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

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

            {/* Source-wise Bucket Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  Source-wise Bucket Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={stats.bySource}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="source" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                    <Legend />
                    <Bar dataKey="t1" name="T+1" stackId="s" fill={BUCKET_COLORS["T+1"]} />
                    <Bar dataKey="t2" name="T+2" stackId="s" fill={BUCKET_COLORS["T+2"]} />
                    <Bar dataKey="t3" name="T+3" stackId="s" fill={BUCKET_COLORS["T+3"]} />
                    <Bar dataKey="tPlus" name="T++" stackId="s" fill={BUCKET_COLORS["T++"]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

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

      <LeadDetailDialog lead={selectedLead} open={!!selectedLead} onClose={() => setSelectedLead(null)} />
    </div>
  );
}
