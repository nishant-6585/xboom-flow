import { useState, useMemo } from "react";
import { useMyLeads, MyLead } from "@/hooks/useMyLeads";
import { format, subDays, startOfMonth, endOfMonth, isAfter, isBefore, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Search, Phone, Mail, Building2, MapPin, Calendar, Bell, BellOff, Package, TrendingUp, Clock, AlertTriangle } from "lucide-react";
import { CallButton } from "@/components/calls/CallButton";
import type { CallEntityType } from "@/hooks/useInitiateCall";
import { LogCallDialog } from "./LogCallDialog";
import { PhoneCall } from "lucide-react";

const SOURCE_TO_ENTITY: Record<string, CallEntityType> = {
  "Google Ads": "lead",
  "ElevenLabs": "lead",
  "Email": "lead",
  "Interakt": "lead",
  "MyOperator": "lead",
  "IndiaMART": "lead",
  "Form": "lead",
  "Q-Form": "lead",
  "Enquiry": "enquiry",
  "Prospect": "prospect",
};
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import { AttentionButton } from "./AttentionButton";
import { ProspectButton } from "./ProspectButton";
import { EnquiryConvertButton } from "./EnquiryConvertButton";
import { AssigneeCell } from "./AssigneeCell";
import { LinkToCompanyButton } from "./LinkToCompanyButton";

// Map MyLead.source -> sourceType used by action buttons
const SOURCE_TYPE_MAP: Record<string, 'interakt' | 'myoperator' | 'email' | 'form_lead' | 'google_ads' | 'lead' | 'enquiry'> = {
  "Enquiry": "enquiry",
  "MyOperator": "myoperator",
  "ElevenLabs": "myoperator",
  "Form": "form_lead",
  "Email": "email",
  "Interakt": "interakt",
  "Google Ads": "google_ads",
  "Q-Form": "lead",
  "Prospect": "enquiry",
};

// Map MyLead.source → outbound_call_logs.lead_source enum
const SOURCE_TO_LOG_CALL: Record<string, 'myoperator' | 'interakt' | 'prospect' | 'pipeline' | 'enquiry' | 'form' | 'email' | 'google_ads' | 'q_form' | 'elevenlabs'> = {
  "Enquiry": "enquiry",
  "MyOperator": "myoperator",
  "ElevenLabs": "elevenlabs",
  "Form": "form",
  "Email": "email",
  "Interakt": "interakt",
  "Google Ads": "google_ads",
  "Q-Form": "q_form",
  "Prospect": "prospect",
};

// Untouched bucket helpers — mirror useUntouchedLeads logic
function getUntouchedBucket(createdAt: string): { label: "T+1" | "T+2" | "T+3" | "T++" | null; hours: number } {
  const hours = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
  if (hours <= 24) return { label: null, hours };
  if (hours <= 48) return { label: "T+1", hours };
  if (hours <= 72) return { label: "T+2", hours };
  if (hours <= 96) return { label: "T+3", hours };
  return { label: "T++", hours };
}
const BUCKET_COLORS: Record<string, string> = {
  "T+1": "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  "T+2": "bg-orange-500/15 text-orange-600 border-orange-500/30",
  "T+3": "bg-red-500/15 text-red-600 border-red-500/30",
  "T++": "bg-red-700/20 text-red-700 border-red-700/40",
};

const SOURCE_COLORS: Record<string, string> = {
  "Enquiry": "#3B82F6",
  "MyOperator": "#10B981",
  "ElevenLabs": "#A855F7",
  "Form": "#8B5CF6",
  "Email": "#F59E0B",
  "Interakt": "#06B6D4",
  "Google Ads": "#EF4444",
  "Q-Form": "#EC4899",
  "Prospect": "#14B8A6",
};

// Mirror every source label that `useMyLeads` can emit. Keep this in
// sync with the labelling logic in src/hooks/useMyLeads.ts.
const SOURCES = [
  "All",
  "Enquiry",
  "MyOperator",
  "ElevenLabs",
  "Interakt",
  "Form",
  "Q-Form",
  "Email",
  "Google Ads",
  "Prospect",
];
const FOLLOWUP_FILTERS = ["All", "With Follow-up", "Without Follow-up", "Overdue"];
const UNTOUCHED_FILTERS = ["All", "Untouched (T+1)", "Untouched (T+2)", "Untouched (T+3)", "Untouched (T++)", "Any Untouched"];
const PERIODS = [
  { label: "All Time", value: "all" },
  { label: "Today", value: "today" },
  { label: "Last 7 Days", value: "7d" },
  { label: "This Month", value: "month" },
  { label: "Last 30 Days", value: "30d" },
];

export function MyLeadsPanel() {
  const { data: leads = [], isLoading } = useMyLeads();
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [followupFilter, setFollowupFilter] = useState("All");
  const [period, setPeriod] = useState("all");
  const [customerTypeFilter, setCustomerTypeFilter] = useState("All");
  const [untouchedFilter, setUntouchedFilter] = useState("All");
  const [selectedLead, setSelectedLead] = useState<MyLead | null>(null);
  const [logCallLead, setLogCallLead] = useState<MyLead | null>(null);

  const now = new Date();

  const filtered = useMemo(() => {
    let list = leads;

    // Period filter
    if (period !== "all") {
      let start: Date;
      if (period === "today") start = new Date(format(now, "yyyy-MM-dd"));
      else if (period === "7d") start = subDays(now, 7);
      else if (period === "month") start = startOfMonth(now);
      else start = subDays(now, 30);
      list = list.filter(l => isAfter(parseISO(l.created_at), start));
    }

    // Source
    if (sourceFilter !== "All") list = list.filter(l => l.source === sourceFilter);

    // Follow-up
    if (followupFilter === "With Follow-up") list = list.filter(l => l.has_followup);
    else if (followupFilter === "Without Follow-up") list = list.filter(l => !l.has_followup);
    else if (followupFilter === "Overdue") list = list.filter(l => l.has_followup && l.followup_status === "pending" && l.next_followup_at && isBefore(parseISO(l.next_followup_at), now));

    // Customer type
    if (customerTypeFilter === "B2B") list = list.filter(l => (l.customer_type || 'b2b') === 'b2b');
    else if (customerTypeFilter === "B2C") list = list.filter(l => l.customer_type === 'b2c');

    // Untouched bucket filter
    if (untouchedFilter !== "All") {
      list = list.filter(l => {
        const b = getUntouchedBucket(l.created_at).label;
        if (untouchedFilter === "Any Untouched") return b !== null;
        return `Untouched (${b})` === untouchedFilter;
      });
    }

    // Search
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(l =>
        l.customer_name.toLowerCase().includes(s) ||
        l.product_name?.toLowerCase().includes(s) ||
        l.company?.toLowerCase().includes(s) ||
        l.email?.toLowerCase().includes(s) ||
        l.phone?.toLowerCase().includes(s)
      );
    }

    return list;
  }, [leads, search, sourceFilter, followupFilter, period, customerTypeFilter, untouchedFilter]);

  // Analytics
  const sourceStats = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(l => { map[l.source] = (map[l.source] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value, fill: SOURCE_COLORS[name] || "#94A3B8" }));
  }, [filtered]);

  const followupStats = useMemo(() => {
    const withFu = filtered.filter(l => l.has_followup).length;
    const withoutFu = filtered.filter(l => !l.has_followup).length;
    const overdue = filtered.filter(l => l.has_followup && l.followup_status === "pending" && l.next_followup_at && isBefore(parseISO(l.next_followup_at), now)).length;
    return { withFu, withoutFu, overdue, total: filtered.length };
  }, [filtered]);

  const dailyTrend = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    const last14 = subDays(now, 14);
    filtered
      .filter(l => isAfter(parseISO(l.created_at), last14))
      .forEach(l => {
        const day = format(parseISO(l.created_at), "MMM dd");
        if (!map[day]) map[day] = {};
        map[day][l.source] = (map[day][l.source] || 0) + 1;
      });
    return Object.entries(map)
      .map(([day, sources]) => ({ day, ...sources }))
      .sort((a, b) => a.day.localeCompare(b.day));
  }, [filtered]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-primary mb-1">
              <Package className="w-4 h-4" />
              <span className="text-xs font-medium">Total Leads</span>
            </div>
            <p className="text-2xl font-bold">{filtered.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-green-600 mb-1">
              <Bell className="w-4 h-4" />
              <span className="text-xs font-medium">With Follow-up</span>
            </div>
            <p className="text-2xl font-bold">{followupStats.withFu}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-amber-600 mb-1">
              <BellOff className="w-4 h-4" />
              <span className="text-xs font-medium">No Follow-up</span>
            </div>
            <p className="text-2xl font-bold">{followupStats.withoutFu}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-red-600 mb-1">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-xs font-medium">Overdue</span>
            </div>
            <p className="text-2xl font-bold">{followupStats.overdue}</p>
          </CardContent>
        </Card>
      </div>

      {/* Analytics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Source Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Leads by Source</CardTitle>
          </CardHeader>
          <CardContent>
            {sourceStats.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={sourceStats} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                    {sourceStats.map((s, i) => <Cell key={i} fill={s.fill} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-10">No data</p>
            )}
          </CardContent>
        </Card>

        {/* Daily Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Daily Lead Inflow (Last 14 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            {dailyTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dailyTrend}>
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {Object.keys(SOURCE_COLORS).map(src => (
                    <Bar key={src} dataKey={src} stackId="a" fill={SOURCE_COLORS[src]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-10">No recent data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search name, product, company, email, phone…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[180px]">
                <span className="text-muted-foreground mr-1.5 text-xs font-medium">Source:</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={followupFilter} onValueChange={setFollowupFilter}>
              <SelectTrigger className="w-[210px]">
                <span className="text-muted-foreground mr-1.5 text-xs font-medium">Follow-up:</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FOLLOWUP_FILTERS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[190px]">
                <span className="text-muted-foreground mr-1.5 text-xs font-medium">Period:</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={customerTypeFilter} onValueChange={setCustomerTypeFilter}>
              <SelectTrigger className="w-[160px]">
                <span className="text-muted-foreground mr-1.5 text-xs font-medium">Type:</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Types</SelectItem>
                <SelectItem value="B2B">B2B</SelectItem>
                <SelectItem value="B2C">B2C</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Follow-up</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={12} className="text-center py-10 text-muted-foreground">No leads found</TableCell></TableRow>
                ) : (
                  filtered.slice(0, 500).map(lead => {
                    const isOverdue = lead.has_followup && lead.followup_status === "pending" && lead.next_followup_at && isBefore(parseISO(lead.next_followup_at), now);
                    const sourceType = SOURCE_TYPE_MAP[lead.source] || 'lead';
                    return (
                      <TableRow key={`${lead.source}-${lead.id}`} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedLead(lead)}>
                        <TableCell className="font-medium">{lead.customer_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" style={{ borderColor: SOURCE_COLORS[lead.source], color: SOURCE_COLORS[lead.source] }}>
                            {lead.source}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">{lead.product_name || "—"}</TableCell>
                        <TableCell>{lead.company || "—"}</TableCell>
                        <TableCell className="text-xs">{lead.city || "—"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{lead.phone || "—"}</TableCell>
                        <TableCell className="text-xs max-w-[180px] truncate">{lead.email || "—"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <AssigneeCell userId={lead.assigned_user_id} />
                            <LinkToCompanyButton lead={{ customer_name: lead.customer_name, company: lead.company, phone: lead.phone, email: lead.email, city: lead.city, source_label: lead.source }} />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">{lead.status || "—"}</Badge>
                        </TableCell>
                        <TableCell>
                          {lead.has_followup ? (
                            <div className="flex items-center gap-1">
                              <Bell className={`w-3.5 h-3.5 ${isOverdue ? "text-red-500" : "text-green-500"}`} />
                              <span className={`text-xs ${isOverdue ? "text-red-500 font-semibold" : "text-muted-foreground"}`}>
                                {isOverdue ? "Overdue" : format(parseISO(lead.next_followup_at!), "dd MMM")}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <BellOff className="w-3.5 h-3.5" /> None
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{format(parseISO(lead.created_at), "dd MMM yyyy")}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()} className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {lead.phone && (
                              <CallButton
                                phoneNumber={lead.phone}
                                entityType={SOURCE_TO_ENTITY[lead.source] ?? "lead"}
                                entityId={lead.id}
                                iconOnly
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-orange-500 hover:text-orange-600"
                              />
                            )}
                            {lead.phone && (
                              <Button asChild size="sm" variant="ghost" className="h-7 w-7 p-0" title="WhatsApp">
                                <a
                                  href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <MessageCircle className="h-3.5 w-3.5 text-green-600" />
                                </a>
                              </Button>
                            )}
                            {lead.email && (
                              <Button asChild size="sm" variant="ghost" className="h-7 w-7 p-0" title="Email">
                                <a href={`mailto:${lead.email}`}>
                                  <Mail className="h-3.5 w-3.5 text-amber-600" />
                                </a>
                              </Button>
                            )}
                            <ProspectButton
                              sourceType={sourceType}
                              sourceId={String(lead.id)}
                              customerName={lead.customer_name}
                              phoneNumber={lead.phone}
                              email={lead.email}
                              company={lead.company}
                              city={lead.city}
                              productName={lead.product_name}
                            />
                            <AttentionButton
                              sourceType={sourceType === 'enquiry' ? 'enquiry' : sourceType}
                              sourceId={String(lead.id)}
                              customerName={lead.customer_name}
                              phoneNumber={lead.phone}
                              email={lead.email}
                              company={lead.company}
                              city={lead.city}
                              productName={lead.product_name}
                            />
                            {sourceType !== 'enquiry' && (
                              <EnquiryConvertButton
                                sourceType={sourceType}
                                sourceId={String(lead.id)}
                                customerName={lead.customer_name}
                                phoneNumber={lead.phone}
                                email={lead.email}
                                company={lead.company}
                                city={lead.city}
                                productName={lead.product_name}
                              />
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {filtered.length > 500 && (
            <p className="text-xs text-muted-foreground text-center py-2">Showing 500 of {filtered.length} leads</p>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedLead} onOpenChange={open => !open && setSelectedLead(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedLead?.customer_name}</DialogTitle>
          </DialogHeader>
          {selectedLead && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge style={{ backgroundColor: SOURCE_COLORS[selectedLead.source], color: "#fff" }}>{selectedLead.source}</Badge>
                <Badge variant="secondary">{selectedLead.status || "N/A"}</Badge>
              </div>
              <div className="grid grid-cols-1 gap-3 text-sm">
                {selectedLead.product_name && (
                  <div className="flex items-center gap-2"><Package className="w-4 h-4 text-muted-foreground" /><span>{selectedLead.product_name}</span></div>
                )}
                {selectedLead.company && (
                  <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" /><span>{selectedLead.company}</span></div>
                )}
                {selectedLead.city && (
                  <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" /><span>{selectedLead.city}</span></div>
                )}
                {selectedLead.email && (
                  <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" /><span>{selectedLead.email}</span></div>
                )}
                {selectedLead.phone && (
                  <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" /><span>{selectedLead.phone}</span></div>
                )}
                <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-muted-foreground" /><span>Created: {format(parseISO(selectedLead.created_at), "dd MMM yyyy, hh:mm a")}</span></div>
              </div>
              <div className="border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Follow-up Status</p>
                {selectedLead.has_followup ? (
                  <div className="flex items-center gap-2">
                    <Bell className={`w-4 h-4 ${selectedLead.followup_status === "pending" && selectedLead.next_followup_at && isBefore(parseISO(selectedLead.next_followup_at), now) ? "text-red-500" : "text-green-500"}`} />
                    <span className="text-sm">
                      {selectedLead.followup_status === "completed" ? "Completed" : format(parseISO(selectedLead.next_followup_at!), "dd MMM yyyy, hh:mm a")}
                    </span>
                    <Badge variant={selectedLead.followup_status === "completed" ? "default" : "outline"} className="text-xs">{selectedLead.followup_status}</Badge>
                  </div>
                ) : (
                  <p className="text-sm text-amber-600 flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> No follow-up scheduled</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
