import { useEffect, useMemo, useState } from "react";
import {
  Loader2, Plus, Pencil, Trash2, Search, Download, Mail, UserCheck, UserX,
  Building2, User as UserIcon, ShieldCheck, ShieldAlert, Shield, ShieldQuestion,
  Phone, MessageCircle, RotateCw,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Header } from "@/components/Header";
import AdminTabsNav from "@/components/admin/AdminTabsNav";
import { kycStatusMeta, type KycStatus } from "@/hooks/useKyc";
import { useSalesUsers } from "@/hooks/useSalesUsers";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ---------- types ----------
interface AccountRow {
  id: string;
  company_name: string;
  status: string;
  industry: string | null;
  gstin: string | null;
  billing_address: string | null;
  shipping_address: string | null;
  assigned_rep_id: string | null;
  kyc_status: KycStatus;
  kyc_submitted_at: string | null;
  kyc_rejection_reason: string | null;
  primary_contact_name: string | null;
  created_at: string;
}
interface ContactRow {
  id: string;
  account_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  whatsapp_number: string | null;
  role: string;
  is_active: boolean;
  invited_at: string | null;
  last_login_at: string | null;
  auth_user_id: string | null;
  created_at: string;
}
interface EnrichedRow extends AccountRow {
  primary: ContactRow | null;
  contacts: ContactRow[];
  accountType: "business" | "individual";
}

type StatusFilter = "all" | "active" | "pending" | "suspended" | "archived";
type KycFilter = "all" | KycStatus;
type TypeFilter = "all" | "business" | "individual";
type RepFilter = "all" | "unassigned" | string;

// ---------- helpers ----------
function accountTypeOf(account: AccountRow, primary: ContactRow | null): "business" | "individual" {
  if (account.gstin && account.gstin.trim()) return "business";
  const co = (account.company_name || "").trim().toLowerCase();
  const name = (primary?.full_name || account.primary_contact_name || "").trim().toLowerCase();
  if (co && name && co !== name) return "business";
  return "individual";
}

/** Display company name only for real businesses; "—" otherwise. */
function displayCompany(row: { accountType: "business" | "individual"; company_name: string }): string {
  return row.accountType === "business" ? (row.company_name || "—") : "—";
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-800 border-emerald-200",
    pending: "bg-amber-100 text-amber-800 border-amber-200",
    suspended: "bg-red-100 text-red-800 border-red-200",
    archived: "bg-slate-100 text-slate-700 border-slate-200",
  };
  return (
    <Badge variant="outline" className={`${map[status] ?? map.archived} capitalize`}>{status || "unknown"}</Badge>
  );
}

function KycBadge({ status }: { status: KycStatus }) {
  const meta = kycStatusMeta(status);
  const Icon =
    status === "approved" ? ShieldCheck :
    status === "rejected" || status === "resubmission_required" ? ShieldAlert :
    status === "pending_verification" ? ShieldQuestion :
    Shield;
  return (
    <Badge variant="outline" className={`${meta.className} gap-1 font-medium`}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </Badge>
  );
}

function AccountTypeBadge({ type }: { type: "business" | "individual" }) {
  return type === "business" ? (
    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 gap-1">
      <Building2 className="h-3 w-3" /> Business
    </Badge>
  ) : (
    <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 gap-1">
      <UserIcon className="h-3 w-3" /> Individual
    </Badge>
  );
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(rows: EnrichedRow[]) {
  const header = ["Company","Type","Contact","Email","Phone","KYC","Status","Last Login","Created"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([
      displayCompany(r),
      r.accountType,
      r.primary?.full_name ?? "",
      r.primary?.email ?? "",
      r.primary?.phone ?? r.primary?.whatsapp_number ?? "",
      r.kyc_status,
      r.status,
      r.primary?.last_login_at ?? "",
      r.created_at,
    ].map(csvEscape).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `portal-customers-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- main component ----------
const PAGE_SIZE = 20;

export default function PortalCustomers() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const { salesUsers } = useSalesUsers();
  const repMap = useMemo(() => {
    const m = new Map<string, string>();
    salesUsers.forEach((u) => m.set(u.user_id, u.name));
    return m;
  }, [salesUsers]);

  const [rows, setRows] = useState<EnrichedRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [kycFilter, setKycFilter] = useState<KycFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [repFilter, setRepFilter] = useState<RepFilter>("all");
  const [neverLoginOnly, setNeverLoginOnly] = useState(false);
  const [newThisMonthOnly, setNewThisMonthOnly] = useState(false);
  const [page, setPage] = useState(1);

  // Invite dialog
  const [open, setOpen] = useState(false);
  const [inviteType, setInviteType] = useState<"individual" | "business">("individual");
  const [companyName, setCompanyName] = useState("");
  const [gstin, setGstin] = useState("");
  const [industry, setIndustry] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [contactRole, setContactRole] = useState<"buyer" | "admin" | "technician" | "finance">("buyer");
  const [submitting, setSubmitting] = useState(false);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<AccountRow | null>(null);
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editGstin, setEditGstin] = useState("");
  const [editIndustry, setEditIndustry] = useState("");
  const [editStatus, setEditStatus] = useState<string>("active");
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete
  const [deleteRow, setDeleteRow] = useState<EnrichedRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteBlockers, setDeleteBlockers] = useState<string | null>(null);

  // Drawer
  const [drawerId, setDrawerId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: accts, error } = await supabase
      .from("portal_accounts")
      .select(
        "id, company_name, status, industry, gstin, billing_address, shipping_address, assigned_rep_id, kyc_status, kyc_submitted_at, kyc_rejection_reason, primary_contact_name, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Failed to load accounts", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    const accountRows = (accts ?? []) as AccountRow[];
    const ids = accountRows.map((a) => a.id);
    let contacts: ContactRow[] = [];
    if (ids.length) {
      const { data: cs, error: cErr } = await supabase
        .from("portal_contacts")
        .select("id, account_id, full_name, email, phone, whatsapp_number, role, is_active, invited_at, last_login_at, auth_user_id, created_at")
        .in("account_id", ids)
        .order("created_at", { ascending: true });
      if (cErr) {
        toast({ title: "Failed to load contacts", description: cErr.message, variant: "destructive" });
      } else {
        contacts = (cs ?? []) as ContactRow[];
      }
    }
    const byAccount = new Map<string, ContactRow[]>();
    contacts.forEach((c) => {
      const arr = byAccount.get(c.account_id) ?? [];
      arr.push(c);
      byAccount.set(c.account_id, arr);
    });
    const enriched: EnrichedRow[] = accountRows.map((a) => {
      const all = byAccount.get(a.id) ?? [];
      const primary = all.find((c) => c.is_active) ?? all[0] ?? null;
      return { ...a, primary, contacts: all, accountType: accountTypeOf(a, primary) };
    });
    setRows(enriched);
    setLoading(false);
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  // ----- filtering -----
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (kycFilter !== "all" && r.kyc_status !== kycFilter) return false;
      if (typeFilter !== "all" && r.accountType !== typeFilter) return false;
      if (repFilter !== "all") {
        if (repFilter === "unassigned") { if (r.assigned_rep_id) return false; }
        else if (r.assigned_rep_id !== repFilter) return false;
      }
      if (neverLoginOnly) {
        const hasLogin = r.contacts.some((c) => c.last_login_at && c.auth_user_id);
        if (hasLogin) return false;
      }
      if (newThisMonthOnly && r.created_at < monthStart) return false;
      if (q) {
        const hay = [
          r.company_name, r.primary?.full_name, r.primary?.email,
          r.primary?.phone, r.primary?.whatsapp_number,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, statusFilter, kycFilter, typeFilter, repFilter, neverLoginOnly, newThisMonthOnly, monthStart]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, statusFilter, kycFilter, typeFilter, repFilter, neverLoginOnly, newThisMonthOnly]);

  // ----- stats -----
  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => r.status === "active").length;
    const kycPending = rows.filter((r) => r.kyc_status === "pending_verification").length;
    const neverLogin = rows.filter((r) => !r.contacts.some((c) => c.last_login_at && c.auth_user_id)).length;
    const newThisMonth = rows.filter((r) => r.created_at >= monthStart).length;
    return { total, active, kycPending, neverLogin, newThisMonth };
  }, [rows, monthStart]);

  // ----- invite -----
  const resetInvite = () => {
    setInviteType("individual");
    setCompanyName(""); setGstin(""); setIndustry("");
    setFullName(""); setEmail(""); setPhone(""); setWhatsappNumber(""); setContactRole("buyer");
  };
  const submit = async () => {
    if (!fullName || !email) {
      toast({ title: "Missing fields", description: "Customer name and email are required.", variant: "destructive" });
      return;
    }
    if (inviteType === "business" && !companyName) {
      toast({ title: "Missing fields", description: "Company name is required for business accounts.", variant: "destructive" });
      return;
    }
    // For individuals, use the person's name for company_name (NOT NULL constraint)
    // while still setting primary_contact_name so the display rule identifies them as Individual.
    const effectiveCompanyName = inviteType === "business" ? companyName : fullName;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("portal-invite-customer", {
      body: {
        new_account: {
          company_name: effectiveCompanyName,
          gstin: inviteType === "business" ? (gstin || undefined) : undefined,
          industry: inviteType === "business" ? (industry || undefined) : undefined,
          primary_contact_name: fullName,
        },
        full_name: fullName,
        email,
        phone: phone || undefined,
        whatsapp_number: whatsappNumber || undefined,
        contact_role: contactRole,
      },
    });
    setSubmitting(false);
    if (error || (data as { error?: string })?.error) {
      const msg = (data as { error?: string })?.error || error?.message || "Invite failed";
      toast({ title: "Invite failed", description: msg, variant: "destructive" });
      return;
    }
    toast({ title: "Invite sent", description: `${email} will receive a setup link.` });
    setOpen(false); resetInvite(); load();
  };

  // ----- edit -----
  const openEdit = (r: AccountRow) => {
    setEditRow(r);
    setEditCompanyName(r.company_name);
    setEditGstin(r.gstin ?? "");
    setEditIndustry(r.industry ?? "");
    setEditStatus(r.status || "active");
    setEditOpen(true);
  };
  const saveEdit = async () => {
    if (!editRow) return;
    if (!editCompanyName.trim()) { toast({ title: "Company name required", variant: "destructive" }); return; }
    setSavingEdit(true);
    const { error } = await supabase.from("portal_accounts").update({
      company_name: editCompanyName.trim(),
      gstin: editGstin.trim() || null,
      industry: editIndustry.trim() || null,
      status: editStatus,
    }).eq("id", editRow.id);
    setSavingEdit(false);
    if (error) { toast({ title: "Update failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Customer updated" });
    setEditOpen(false); setEditRow(null); load();
  };

  // ----- suspend/reactivate -----
  const toggleStatus = async (r: EnrichedRow) => {
    const next = r.status === "suspended" ? "active" : "suspended";
    const { error } = await supabase.from("portal_accounts").update({ status: next }).eq("id", r.id);
    if (error) { toast({ title: "Update failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: next === "suspended" ? "Account suspended" : "Account reactivated" });
    load();
  };

  // ----- delete guard -----
  const openDelete = async (r: EnrichedRow) => {
    setDeleteBlockers(null); setDeleteRow(r);
    const [ords, tix, kyc] = await Promise.all([
      supabase.from("portal_orders").select("id", { count: "exact", head: true }).eq("account_id", r.id),
      supabase.from("portal_tickets").select("id", { count: "exact", head: true }).eq("account_id", r.id),
      supabase.from("kyc_documents").select("id", { count: "exact", head: true }).eq("account_id", r.id),
    ]);
    const parts: string[] = [];
    if (ords.count) parts.push(`${ords.count} order${ords.count === 1 ? "" : "s"}`);
    if (tix.count) parts.push(`${tix.count} ticket${tix.count === 1 ? "" : "s"}`);
    if (kyc.count) parts.push(`${kyc.count} KYC document${kyc.count === 1 ? "" : "s"}`);
    setDeleteBlockers(parts.length ? parts.join(", ") : null);
  };
  const confirmDelete = async () => {
    if (!deleteRow || deleteBlockers) return;
    setDeleting(true);
    const { error } = await supabase.from("portal_accounts").delete().eq("id", deleteRow.id);
    setDeleting(false);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Customer deleted" });
    setDeleteRow(null); load();
  };

  // ----- rep assignment -----
  const setAssignedRep = async (accountId: string, repId: string | null) => {
    const { error } = await supabase.from("portal_accounts").update({ assigned_rep_id: repId }).eq("id", accountId);
    if (error) { toast({ title: "Update failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Assigned rep updated" });
    load();
  };

  // ----- resend invite -----
  const resendInvite = async (account: AccountRow, c: ContactRow) => {
    const { data, error } = await supabase.functions.invoke("portal-invite-customer", {
      body: {
        account_id: account.id,
        full_name: c.full_name,
        email: c.email,
        phone: c.phone ?? undefined,
        whatsapp_number: c.whatsapp_number ?? undefined,
        contact_role: c.role,
      },
    });
    if (error || (data as { error?: string })?.error) {
      const msg = (data as { error?: string })?.error || error?.message || "Invite failed";
      toast({ title: "Resend failed", description: msg, variant: "destructive" });
      return;
    }
    toast({ title: "Invite resent", description: `${c.email} will receive a new setup link.` });
    load();
  };

  // ----- toggle contact active -----
  const toggleContact = async (c: ContactRow) => {
    const { error } = await supabase.from("portal_contacts").update({ is_active: !c.is_active }).eq("id", c.id);
    if (error) { toast({ title: "Update failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: c.is_active ? "Contact deactivated" : "Contact activated" });
    load();
  };

  const applyFilterFromStat = (kind: "total" | "active" | "kyc" | "never" | "new") => {
    setStatusFilter("all"); setKycFilter("all"); setTypeFilter("all"); setRepFilter("all");
    setNeverLoginOnly(false); setNewThisMonthOnly(false); setSearch("");
    if (kind === "active") setStatusFilter("active");
    if (kind === "kyc") setKycFilter("pending_verification");
    if (kind === "never") setNeverLoginOnly(true);
    if (kind === "new") setNewThisMonthOnly(true);
  };

  if (!isAdmin) {
    return (
      <div className="min-h-[100dvh] bg-background">
        <Header />
        <div className="max-w-3xl mx-auto px-4 py-12">
          <Card>
            <CardHeader>
              <CardTitle>Admin only</CardTitle>
              <CardDescription>You don't have permission to manage portal customers.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  const drawerRow = drawerId ? rows.find((r) => r.id === drawerId) ?? null : null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-[100dvh] bg-background">
        <Header />
        <AdminTabsNav active="portal-customers" />
        <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
          {/* Title */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">Portal Customers</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Manage customer accounts and portal users.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => downloadCsv(filtered)} disabled={!filtered.length}>
                <Download className="h-4 w-4 mr-2" /> Export CSV
              </Button>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button><Plus className="h-4 w-4 mr-2" /> Invite customer</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Invite a new customer</DialogTitle>
                    <DialogDescription>
                      Creates a portal account, a primary contact, and emails them a setup link.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Company / customer name *</Label>
                      <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Drones Pvt Ltd" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>GSTIN</Label>
                        <Input value={gstin} onChange={(e) => setGstin(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Industry</Label>
                        <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Surveying" />
                      </div>
                    </div>
                    <div className="border-t pt-4 space-y-4">
                      <div className="space-y-2">
                        <Label>Primary contact name *</Label>
                        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>Email *</Label>
                          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Phone</Label>
                          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Select value={contactRole} onValueChange={(v) => setContactRole(v as typeof contactRole)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="buyer">Buyer</SelectItem>
                            <SelectItem value="admin">Customer Admin</SelectItem>
                            <SelectItem value="technician">Technician</SelectItem>
                            <SelectItem value="finance">Finance</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
                    <Button onClick={submit} disabled={submitting}>
                      {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Send invite
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="Total" value={stats.total} onClick={() => applyFilterFromStat("total")} />
            <StatCard label="Active" value={stats.active} onClick={() => applyFilterFromStat("active")} />
            <StatCard label="KYC pending" value={stats.kycPending} tone="amber" onClick={() => applyFilterFromStat("kyc")} />
            <StatCard label="Never logged in" value={stats.neverLogin} tone="amber" onClick={() => applyFilterFromStat("never")} />
            <StatCard label="New this month" value={stats.newThisMonth} tone="emerald" onClick={() => applyFilterFromStat("new")} />
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div className="relative md:col-span-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search name, email, phone, company…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                  <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={kycFilter} onValueChange={(v) => setKycFilter(v as KycFilter)}>
                  <SelectTrigger><SelectValue placeholder="KYC" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All KYC</SelectItem>
                    <SelectItem value="not_submitted">Not submitted</SelectItem>
                    <SelectItem value="pending_verification">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="resubmission_required">Resubmission</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
                  <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="business">Business</SelectItem>
                    <SelectItem value="individual">Individual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 items-center">
                <Select value={repFilter} onValueChange={(v) => setRepFilter(v as RepFilter)}>
                  <SelectTrigger className="w-[240px]"><SelectValue placeholder="Assigned rep" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All reps</SelectItem>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {salesUsers.map((u) => (
                      <SelectItem key={u.user_id} value={u.user_id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(neverLoginOnly || newThisMonthOnly) && (
                  <Button variant="ghost" size="sm" onClick={() => { setNeverLoginOnly(false); setNewThisMonthOnly(false); }}>
                    Clear quick filters
                  </Button>
                )}
                <div className="ml-auto text-xs text-muted-foreground">
                  {filtered.length} of {rows.length}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-sm text-muted-foreground">
                  No portal customers match the current filters.
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>KYC</TableHead>
                        <TableHead>Last login</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((r) => {
                        const c = r.primary;
                        const neverLoggedIn = !c || !c.auth_user_id || !c.last_login_at;
                        return (
                          <TableRow
                            key={r.id}
                            className="cursor-pointer"
                            onClick={() => setDrawerId(r.id)}
                          >
                            <TableCell className="min-w-[220px]">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div>
                                    <div className="font-medium">{c?.full_name || r.primary_contact_name || "—"}</div>
                                    <div className="text-xs text-muted-foreground">{c?.email ?? "no contact"}</div>
                                  </div>
                                </TooltipTrigger>
                                {(c?.phone || c?.whatsapp_number) && (
                                  <TooltipContent side="right">
                                    <div className="space-y-1 text-xs">
                                      {c?.phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" /> {c.phone}</div>}
                                      {c?.whatsapp_number && <div className="flex items-center gap-1"><MessageCircle className="h-3 w-3" /> {c.whatsapp_number}</div>}
                                    </div>
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-medium">{r.company_name}</div>
                                <AccountTypeBadge type={r.accountType} />
                              </div>
                            </TableCell>
                            <TableCell><KycBadge status={r.kyc_status} /></TableCell>
                            <TableCell>
                              {neverLoggedIn ? (
                                <span className="text-xs font-medium text-amber-700">Never</span>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  {new Date(c!.last_login_at!).toLocaleDateString()}
                                </span>
                              )}
                            </TableCell>
                            <TableCell><StatusBadge status={r.status} /></TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(r.created_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex justify-end gap-1">
                                {c && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="sm" onClick={() => resendInvite(r, c)} aria-label="Resend invite">
                                        <Mail className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Resend portal invite</TooltipContent>
                                  </Tooltip>
                                )}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="sm" onClick={() => toggleStatus(r)} aria-label="Toggle status">
                                      {r.status === "suspended" ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{r.status === "suspended" ? "Reactivate" : "Suspend"}</TooltipContent>
                                </Tooltip>
                                <Button variant="ghost" size="sm" onClick={() => openEdit(r)} aria-label="Edit">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost" size="sm"
                                  onClick={() => openDelete(r)}
                                  className="text-destructive hover:text-destructive"
                                  aria-label="Delete"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t">
                      <div className="text-xs text-muted-foreground">
                        Page {page} of {totalPages}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Detail drawer */}
        <Sheet open={!!drawerId} onOpenChange={(o) => !o && setDrawerId(null)}>
          <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
            {drawerRow && (
              <AccountDrawer
                row={drawerRow}
                salesUsers={salesUsers}
                repMap={repMap}
                onAssignRep={(id) => setAssignedRep(drawerRow.id, id)}
                onResend={(c) => resendInvite(drawerRow, c)}
                onToggleContact={toggleContact}
                onEditAccount={() => { openEdit(drawerRow); setDrawerId(null); }}
              />
            )}
          </SheetContent>
        </Sheet>

        {/* Edit dialog */}
        <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (!o) setEditRow(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit customer</DialogTitle>
              <DialogDescription>Update company details and account status.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Company name *</Label>
                <Input value={editCompanyName} onChange={(e) => setEditCompanyName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>GSTIN</Label>
                  <Input value={editGstin} onChange={(e) => setEditGstin(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Industry</Label>
                  <Input value={editIndustry} onChange={(e) => setEditIndustry(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)} disabled={savingEdit}>Cancel</Button>
              <Button onClick={saveEdit} disabled={savingEdit}>
                {savingEdit && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Save changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation w/ guard */}
        <AlertDialog open={!!deleteRow} onOpenChange={(o) => { if (!o) { setDeleteRow(null); setDeleteBlockers(null); } }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete portal customer?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteBlockers ? (
                  <>
                    Cannot delete <strong>{deleteRow?.company_name}</strong> — this account has{" "}
                    <strong>{deleteBlockers}</strong>. Suspend or archive instead.
                  </>
                ) : (
                  <>
                    This will permanently delete <strong>{deleteRow?.company_name}</strong> and all its portal contacts.
                    This action cannot be undone.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              {!deleteBlockers && (
                <AlertDialogAction
                  onClick={(e) => { e.preventDefault(); confirmDelete(); }}
                  disabled={deleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Delete
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

// ---------- stat card ----------
function StatCard({ label, value, tone, onClick }: { label: string; value: number; tone?: "amber" | "emerald"; onClick?: () => void }) {
  const toneClass =
    tone === "amber" ? "text-amber-700" :
    tone === "emerald" ? "text-emerald-700" :
    "text-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors"
    >
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${toneClass}`}>{value}</div>
    </button>
  );
}

// ---------- drawer ----------
interface DrawerProps {
  row: EnrichedRow;
  salesUsers: { user_id: string; name: string }[];
  repMap: Map<string, string>;
  onAssignRep: (id: string | null) => void;
  onResend: (c: ContactRow) => void;
  onToggleContact: (c: ContactRow) => void;
  onEditAccount: () => void;
}

function AccountDrawer({ row, salesUsers, repMap, onAssignRep, onResend, onToggleContact, onEditAccount }: DrawerProps) {
  const [orders, setOrders] = useState<{ id: string; order_number: string; current_state: string; total: number | null; created_at: string }[]>([]);
  const [tickets, setTickets] = useState<{ id: string; ticket_number: string; subject: string; status: string; created_at: string }[]>([]);
  const [kycDocs, setKycDocs] = useState<{ id: string; doc_type: string; file_name: string; file_path: string; status: string; uploaded_at: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [o, t, k] = await Promise.all([
        supabase.from("portal_orders")
          .select("id, order_number, current_state, total, created_at")
          .eq("account_id", row.id).order("created_at", { ascending: false }).limit(5),
        supabase.from("portal_tickets")
          .select("id, ticket_number, subject, status, created_at")
          .eq("account_id", row.id).order("created_at", { ascending: false }).limit(5),
        supabase.from("kyc_documents")
          .select("id, doc_type, file_name, file_path, status, uploaded_at")
          .eq("account_id", row.id).eq("is_current", true).order("uploaded_at", { ascending: false }),
      ]);
      if (cancelled) return;
      setOrders((o.data ?? []) as any);
      setTickets((t.data ?? []) as any);
      setKycDocs((k.data ?? []) as any);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [row.id]);

  const openKycDoc = async (path: string) => {
    const { data, error } = await supabase.storage.from("kyc-documents").createSignedUrl(path, 60);
    if (error || !data?.signedUrl) { toast({ title: "Failed to open doc", description: error?.message, variant: "destructive" }); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle>{row.company_name}</SheetTitle>
        <SheetDescription className="flex items-center gap-2">
          <AccountTypeBadge type={row.accountType} />
          <StatusBadge status={row.status} />
          <KycBadge status={row.kyc_status} />
        </SheetDescription>
      </SheetHeader>

      <div className="mt-6 space-y-6">
        {/* Account details */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase text-muted-foreground">Account details</h3>
            <Button variant="ghost" size="sm" onClick={onEditAccount}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-muted-foreground">GSTIN</dt><dd>{row.gstin || "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Industry</dt><dd>{row.industry || "—"}</dd></div>
            <div className="col-span-2"><dt className="text-xs text-muted-foreground">Billing address</dt><dd className="whitespace-pre-wrap">{row.billing_address || "—"}</dd></div>
            <div className="col-span-2"><dt className="text-xs text-muted-foreground">Shipping address</dt><dd className="whitespace-pre-wrap">{row.shipping_address || "—"}</dd></div>
          </dl>
          <div className="space-y-2">
            <Label className="text-xs">Assigned rep</Label>
            <Select
              value={row.assigned_rep_id ?? "none"}
              onValueChange={(v) => onAssignRep(v === "none" ? null : v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {salesUsers.map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {row.assigned_rep_id && !repMap.get(row.assigned_rep_id) && (
              <p className="text-xs text-muted-foreground">Current rep is outside your visible list.</p>
            )}
          </div>
        </section>

        {/* Contacts */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase text-muted-foreground">Contacts ({row.contacts.length})</h3>
          <div className="space-y-2">
            {row.contacts.length === 0 && <p className="text-sm text-muted-foreground">No contacts.</p>}
            {row.contacts.map((c) => {
              const neverLoggedIn = !c.auth_user_id || !c.last_login_at;
              return (
                <div key={c.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">{c.full_name} <span className="text-xs text-muted-foreground capitalize">· {c.role}</span></div>
                      <div className="text-xs text-muted-foreground">{c.email}</div>
                      {(c.phone || c.whatsapp_number) && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {c.phone && <span className="mr-2">{c.phone}</span>}
                          {c.whatsapp_number && <span>WA: {c.whatsapp_number}</span>}
                        </div>
                      )}
                      <div className="text-xs mt-1">
                        {neverLoggedIn ? (
                          <span className="text-amber-700">Never logged in</span>
                        ) : (
                          <span className="text-muted-foreground">Last login: {new Date(c.last_login_at!).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => onResend(c)} title="Resend invite">
                        <RotateCw className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onToggleContact(c)} title={c.is_active ? "Deactivate" : "Activate"}>
                        {c.is_active ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* KYC */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase text-muted-foreground">KYC</h3>
          <div className="text-sm">
            <div>Status: <KycBadge status={row.kyc_status} /></div>
            {row.kyc_submitted_at && (
              <div className="text-xs text-muted-foreground mt-1">
                Submitted: {new Date(row.kyc_submitted_at).toLocaleString()}
              </div>
            )}
            {row.kyc_rejection_reason && (
              <div className="text-xs text-destructive mt-1">Reason: {row.kyc_rejection_reason}</div>
            )}
          </div>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : kycDocs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No KYC documents submitted.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {kycDocs.map((d) => (
                <li key={d.id} className="flex items-center justify-between border rounded px-2 py-1">
                  <div className="min-w-0">
                    <div className="font-medium capitalize">{d.doc_type.replace(/_/g, " ")}</div>
                    <div className="text-xs text-muted-foreground truncate">{d.file_name}</div>
                  </div>
                  <Button variant="link" size="sm" onClick={() => openKycDoc(d.file_path)}>View</Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent orders */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase text-muted-foreground">Recent portal orders</h3>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : orders.length === 0 ? (
            <p className="text-xs text-muted-foreground">No portal orders.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {orders.map((o) => (
                <li key={o.id} className="flex items-center justify-between border rounded px-2 py-1">
                  <div>
                    <div className="font-medium">{o.order_number}</div>
                    <div className="text-xs text-muted-foreground capitalize">{o.current_state.replace(/_/g, " ")}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent tickets */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase text-muted-foreground">Recent tickets</h3>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : tickets.length === 0 ? (
            <p className="text-xs text-muted-foreground">No tickets.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {tickets.map((t) => (
                <li key={t.id} className="flex items-center justify-between border rounded px-2 py-1">
                  <div className="min-w-0">
                    <div className="font-medium">{t.ticket_number}</div>
                    <div className="text-xs text-muted-foreground truncate">{t.subject}</div>
                  </div>
                  <div className="text-xs text-muted-foreground capitalize ml-2">{t.status}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}