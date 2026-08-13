import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { FileText, Search, Mail, Phone, Building2, MapPin, Package, User, Calendar, Eye, Trash2, RefreshCw, Pencil, BarChart3, ChevronLeft, ChevronRight, Layers } from "lucide-react";
import { format } from "date-fns";
import { ProspectButton, ACategoryButton } from "./ProspectButton";
import { AttentionButton } from "./AttentionButton";
import { EnquiryConvertButton } from "./EnquiryConvertButton";
import { LinkToCompanyButton } from "./LinkToCompanyButton";
import { LeadActionsCell } from "./LeadActionsCell";
import { useProspects } from "@/hooks/useProspects";
import { useAttentionItems } from "@/hooks/useAttentionItems";
import { FormsLeadsAnalytics } from "./FormsLeadsAnalytics";
import { LeadContactDrawer, LeadContactData } from "./LeadContactDrawer";
import { touchedRowCn, isRowTouched } from "@/lib/touchedRow";
import { useEngagedLeadIds } from "@/hooks/useEngagedLeadIds";
import { applyDispositionFilter } from "@/lib/dispositionFilter";
import { groupDuplicates } from "@/lib/leadDeduplication";
import { DuplicateLeadsHistoryRow } from "./DuplicateLeadsHistoryRow";
import type { LeadDisposition } from "@/lib/leadDispositions";
import { CaptureFormLinkButton } from "./CaptureFormLinkButton";

interface FormLead {
  id: string;
  form_id: string | null;
  form_name: string;
  submission_id: string | null;
  customer_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  city: string | null;
  product_name: string | null;
  notes: string | null;
  status: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
  customer_type: string | null;
  created_at: string;
  updated_at: string;
  disposition?: LeadDisposition | null;
  disposition_reason_code?: string | null;
  disposition_reason_note?: string | null;
  disposition_at?: string | null;
  disposition_by_name?: string | null;
}

const STATUS_OPTIONS = [
  { value: "new", label: "New", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  { value: "contacted", label: "Contacted", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  { value: "qualified", label: "Qualified", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  { value: "converted", label: "Converted", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
  { value: "closed", label: "Closed", color: "bg-muted text-muted-foreground" },
];

export function FormsLeadsPanel() {
  const { user, role, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isManager =
    role === "admin" || role === "sales_manager" || role === "supply_chain";
  const { prospects } = useProspects();
  const { items: attentionItems } = useAttentionItems();
  const { data: engagedIds } = useEngagedLeadIds('form_lead');

  const prospectSourceIds = new Set(prospects.map(p => `${p.source_type}:${p.source_id}`));
  const attentionSourceIds = new Set(attentionItems.map(a => `${a.source_type}:${a.source_id}`));

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [formSourceFilter, setFormSourceFilter] = useState<string>("all");
  const [includeDispositioned, setIncludeDispositioned] = useState(false);
  const [selectedLead, setSelectedLead] = useState<FormLead | null>(null);
  const [drawerLead, setDrawerLead] = useState<FormLead | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [mergeDuplicates, setMergeDuplicates] = useState(true);
  const [expandedDupes, setExpandedDupes] = useState<Set<string>>(new Set());
  const PAGE_SIZE = 20;

  const { data: leads = [], isLoading, refetch } = useQuery({
    queryKey: ["form_leads", isManager ? "all" : user?.id ?? "anon"],
    queryFn: async () => {
      let q = supabase
        .from("form_leads")
        .select("*")
        .order("created_at", { ascending: false });
      // Sales reps can only see leads assigned to them (server-side scope).
      if (!isManager && user) q = q.eq("assigned_to", user.id);
      const { data, error } = await q;
      if (error) throw error;
      return data as FormLead[];
    },
    enabled: isManager || !!user,
  });

  // Fetch sales team + Rohit for assignment dropdown
  const { data: assignableUsers = [] } = useQuery({
    queryKey: ["form_leads_assignable_users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, name")
        .eq("is_approved", true)
        .in("user_id", (await supabase
          .from("user_roles")
          .select("user_id")
          .in("role", ["sales", "sales_manager"])
        ).data?.map(r => r.user_id) || []);
      if (error) throw error;

      const { filterAllowedAssignees } = await import("@/lib/allowedAssignees");
      const all = filterAllowedAssignees([...(data || [])]);
      return all.sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("form_leads").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["form_leads"] });
      toast({ title: "Status updated" });
    },
  });

  const assignLead = useMutation({
    mutationFn: async ({ id, userId, userName }: { id: string; userId: string; userName: string }) => {
      const { error } = await supabase
        .from("form_leads")
        .update({ assigned_to: userId, assigned_to_name: userName })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["form_leads"] });
      toast({ title: "Lead assigned" });
    },
  });

  const deleteLead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("form_leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["form_leads"] });
      setSelectedLead(null);
      toast({ title: "Lead deleted" });
    },
  });

  const updateLead = useMutation({
    mutationFn: async (updates: Partial<FormLead> & { id: string }) => {
      const { id, ...rest } = updates;
      const { error } = await supabase.from("form_leads").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["form_leads"] });
      setSelectedLead(null);
      toast({ title: "Lead updated" });
    },
    onError: (error) => {
      toast({ title: "Error updating lead", description: error.message, variant: "destructive" });
    },
  });

  // Unique form names for filter
  const uniqueFormNames = [...new Set(leads.map(l => l.form_name))].sort();

  const filtered = leads.filter((lead) => {
    const matchesSearch =
      !search ||
      lead.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      lead.email?.toLowerCase().includes(search.toLowerCase()) ||
      lead.phone?.includes(search) ||
      lead.form_name.toLowerCase().includes(search.toLowerCase()) ||
      lead.company?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
    const matchesFormSource = formSourceFilter === "all" || lead.form_name === formSourceFilter;
    return matchesSearch && matchesStatus && matchesFormSource;
  });
  const visible = applyDispositionFilter(filtered, includeDispositioned);

  // Reset page when filters change
  const totalPages = Math.ceil(visible.length / PAGE_SIZE);

  const dedupGroups = useMemo(() => {
    if (!mergeDuplicates) {
      return visible.map((l) => ({ primary: l, duplicates: [] as FormLead[], count: 1, key: `single:${l.id}` }));
    }
    return groupDuplicates<FormLead>(
      visible,
      (l) => ({ phone: l.phone, email: l.email, name: l.customer_name, company: l.company }),
      (l) => l.created_at,
      (l) => l.id,
    );
  }, [visible, mergeDuplicates]);

  const totalGroupPages = Math.ceil(dedupGroups.length / PAGE_SIZE);
  const paginatedGroups = dedupGroups.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const mergedHiddenCount = dedupGroups.reduce((acc, g) => acc + Math.max(0, g.count - 1), 0);

  const toggleDupeGroup = (key: string) => {
    setExpandedDupes((prev) => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  };

  // Reset to page 1 when search/filter changes
  useEffect(() => { setCurrentPage(1); }, [search, statusFilter, formSourceFilter, includeDispositioned]);

  const getStatusBadge = (status: string) => {
    const opt = STATUS_OPTIONS.find((s) => s.value === status);
    return <Badge className={opt?.color || ""}>{opt?.label || status}</Badge>;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Forms Leads
              <Badge variant="secondary">
                {mergeDuplicates
                  ? `${dedupGroups.length} unique · ${mergedHiddenCount} merged · ${visible.length}`
                  : visible.length}
              </Badge>
              <Button
                size="sm"
                variant={mergeDuplicates ? "secondary" : "ghost"}
                className="h-7 px-2 gap-1"
                onClick={() => setMergeDuplicates((v) => !v)}
                title="Merge duplicate leads (same phone / email / company+name)"
              >
                <Layers className="h-3.5 w-3.5" />
                {mergeDuplicates ? "Merged ✓" : "Merge"}
              </Button>
            </CardTitle>
            <div className="flex items-center gap-2">
              <CaptureFormLinkButton />
              <Button
                variant={showAnalytics ? "default" : "outline"}
                size="sm"
                onClick={() => setShowAnalytics(!showAnalytics)}
              >
                <BarChart3 className="w-4 h-4 mr-1" /> Analytics
              </Button>
              <Button variant="outline" size="sm" disabled={isLoading} onClick={async () => {
                await refetch();
                toast({ title: "Refreshed", description: `${leads.length} form leads loaded` });
              }}>
                <RefreshCw className={`w-4 h-4 mr-1 ${isLoading ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {showAnalytics && (
            <>
              <div className="mb-4">
                <Button variant="outline" size="sm" onClick={() => setShowAnalytics(false)}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Back to List
                </Button>
              </div>
              <FormsLeadsAnalytics leads={leads} />
            </>
          )}
          {!showAnalytics && (
          <>
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search name, email, phone, form..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={formSourceFilter} onValueChange={setFormSourceFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Form Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Forms ({uniqueFormNames.length})</SelectItem>
                {uniqueFormNames.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 ml-auto">
              <Switch
                id="form-leads-show-all-dispositions"
                checked={includeDispositioned}
                onCheckedChange={setIncludeDispositioned}
              />
              <Label htmlFor="form-leads-show-all-dispositions" className="text-xs cursor-pointer">
                Show all dispositions
              </Label>
            </div>
          </div>

          {isLoading ? (
            <p className="text-muted-foreground text-center py-8">Loading...</p>
          ) : visible.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No form leads found. Leads will appear here when forms are submitted.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 px-3 font-medium w-[200px]">Actions</th>
                    <th className="py-2 px-3 font-medium">Name</th>
                    <th className="py-2 px-3 font-medium">Contact</th>
                    <th className="py-2 px-3 font-medium">Company</th>
                    <th className="py-2 px-3 font-medium">Form Source</th>
                    <th className="py-2 px-3 font-medium">Product</th>
                    <th className="py-2 px-3 font-medium">Cust. Type</th>
                    <th className="py-2 px-3 font-medium">Status</th>
                    <th className="py-2 px-3 font-medium">Assigned</th>
                    <th className="py-2 px-3 font-medium">Created</th>
                    <th className="py-2 px-3 font-medium">Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedGroups.map((group) => {
                    const lead = group.primary;
                    const dupCount = group.count;
                    const isMerged = dupCount > 1;
                    const dupeOpen = expandedDupes.has(group.key);
                    return (
                    <React.Fragment key={`g-${group.key}`}>
                    <tr className={touchedRowCn(isRowTouched('form-leads', lead, engagedIds), `border-b transition-colors cursor-pointer ${isMerged ? "border-l-2 border-l-amber-500/70 bg-amber-500/5" : ""}`)} onClick={() => setDrawerLead(lead)}>
                      <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                        <LeadActionsCell
                          sourceType="form_lead"
                          sourceId={lead.id}
                          customerName={lead.customer_name}
                          phone={lead.phone}
                          email={lead.email}
                          company={lead.company}
                          city={lead.city}
                          productName={lead.product_name}
                          notes={lead.notes}
                          isAlreadyProspect={prospectSourceIds.has(`form_lead:${lead.id}`)}
                          isAlreadyAttention={attentionSourceIds.has(`form_lead:${lead.id}`)}
                          customerType={lead.customer_type}
                          sourceLabel="Form"
                          currentDisposition={lead.disposition}
                          dispositionReasonCode={lead.disposition_reason_code}
                          dispositionReasonNote={lead.disposition_reason_note}
                          dispositionAt={lead.disposition_at}
                          dispositionByName={lead.disposition_by_name}
                          onDispositionChanged={() => refetch()}
                        />
                      </td>
                      <td className="py-2.5 px-3 font-medium">
                        <div className="flex items-center gap-1.5">
                          <span>{lead.customer_name}</span>
                          {isMerged && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); toggleDupeGroup(group.key); }}
                              className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
                              title={`${dupCount} entries merged`}
                            >
                              <Layers className="h-3 w-3" />×{dupCount} {dupeOpen ? "hide" : "history"}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="space-y-0.5">
                          {lead.email && <div className="flex items-center gap-1 text-xs"><Mail className="w-3 h-3" />{lead.email}</div>}
                          {lead.phone && <div className="flex items-center gap-1 text-xs"><Phone className="w-3 h-3" />{lead.phone}</div>}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">{lead.company || "-"}</td>
                      <td className="py-2.5 px-3">
                        <Badge variant="outline" className="text-xs">{lead.form_name}</Badge>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">{lead.product_name || "-"}</td>
                      <td className="py-2.5 px-3">
                        {lead.customer_type ? (
                          <Badge variant="outline" className="text-xs">{lead.customer_type}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                        <Select value={lead.status} onValueChange={(val) => updateStatus.mutate({ id: lead.id, status: val })}>
                          <SelectTrigger className="h-7 w-[110px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((s) => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={lead.assigned_to || "unassigned"}
                          onValueChange={(val) => {
                            if (val === "unassigned") {
                              assignLead.mutate({ id: lead.id, userId: "", userName: "" });
                            } else {
                              const u = assignableUsers.find(u => u.user_id === val);
                              if (u) assignLead.mutate({ id: lead.id, userId: u.user_id, userName: u.name });
                            }
                          }}
                        >
                          <SelectTrigger className="h-7 w-[130px] text-xs">
                            <SelectValue placeholder="Assign..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">Unassigned</SelectItem>
                            {assignableUsers.map((u) => (
                              <SelectItem key={u.user_id} value={u.user_id}>{u.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-xs text-muted-foreground">
                          <div>{format(new Date(lead.created_at), "MMM d, yyyy")}</div>
                          <div className="text-[10px]">{format(new Date(lead.created_at), "h:mm a")}</div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1 items-center">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedLead(lead)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          {isManager && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteLead.mutate(lead.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isMerged && dupeOpen && (
                      <DuplicateLeadsHistoryRow
                        colSpan={11}
                        headerLabel={lead.phone || lead.email || lead.customer_name || "this contact"}
                        count={group.duplicates.length}
                        entries={group.duplicates.map((d) => ({
                          id: d.id,
                          createdAt: d.created_at,
                          name: d.customer_name,
                          phone: d.phone,
                          email: d.email,
                          company: d.company,
                          city: d.city,
                          product: d.product_name,
                          source: d.form_name,
                          status: d.status,
                          assignedTo: d.assigned_to_name,
                        }))}
                        onSelect={(e) => {
                          const dup = group.duplicates.find((x) => x.id === e.id);
                          if (dup) setDrawerLead(dup);
                        }}
                      />
                    )}
                    </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {/* Pagination */}
          {totalGroupPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t">
              <span className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, dedupGroups.length)} of {dedupGroups.length}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                </Button>
                <span className="text-sm font-medium">Page {currentPage} of {totalGroupPages}</span>
                <Button variant="outline" size="sm" disabled={currentPage === totalGroupPages} onClick={() => setCurrentPage(p => p + 1)}>
                  Next <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
          </>
          )}
        </CardContent>
      </Card>

      {/* Lead Contact Drawer */}
      <LeadContactDrawer
        open={!!drawerLead}
        onOpenChange={(open) => { if (!open) setDrawerLead(null); }}
        lead={drawerLead ? {
          id: drawerLead.id,
          source_type: 'form_lead',
          customer_name: drawerLead.customer_name,
          phone: drawerLead.phone,
          email: drawerLead.email,
          company: drawerLead.company,
          city: drawerLead.city,
          product_name: drawerLead.product_name,
          notes: drawerLead.notes,
          status: drawerLead.status,
          assigned_to_name: drawerLead.assigned_to_name,
          created_at: drawerLead.created_at,
          extras: {
            form_source: drawerLead.form_name,
            customer_type: drawerLead.customer_type,
          },
        } satisfies LeadContactData : null}
        onSave={(updates) => {
          if (!drawerLead) return;
          updateLead.mutate({ id: drawerLead.id, ...updates } as Partial<FormLead> & { id: string });
          setDrawerLead(null);
        }}
        saving={updateLead.isPending}
      />
    </div>
  );
}

