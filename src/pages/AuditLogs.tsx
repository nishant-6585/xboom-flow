import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import AdminTabsNav from "@/components/admin/AdminTabsNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import {
  Shield, ArrowLeft, Download, Search, Loader2, FileText,
  UserCog, KeyRound, LogIn, ShieldCheck, Trash2, Eye
} from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";

const ACTION_ICONS: Record<string, any> = {
  password_change: KeyRound,
  role_update: UserCog,
  role_added: UserCog,
  role_removed: UserCog,
  login: LogIn,
  mfa_enabled: ShieldCheck,
  mfa_disabled: Shield,
  user_deleted: Trash2,
  session_revoked: LogIn,
  invitation_approved: UserCog,
  profile_update: Eye,
};

const ACTION_LABELS: Record<string, string> = {
  password_change: "Password Change",
  role_update: "Role Update",
  role_added: "Role Added",
  role_removed: "Role Removed",
  login: "Login",
  mfa_enabled: "MFA Enabled",
  mfa_disabled: "MFA Disabled",
  user_deleted: "User Deleted",
  session_revoked: "Session Revoked",
  invitation_approved: "Invitation Approved",
  profile_update: "Profile Update",
};

const AuditLogs = () => {
  const { role, isApproved } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", actionFilter, page],
    queryFn: async () => {
      let query = supabase
        .from("security_audit_log")
        .select("*", { count: "exact" })
        .order("performed_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (actionFilter !== "all") {
        query = query.eq("action", actionFilter);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { logs: data || [], total: count || 0 };
    },
    enabled: role === "admin" && isApproved,
  });

  if (role !== "admin" || !isApproved) {
    return <Navigate to="/" replace />;
  }

  const logs = data?.logs || [];
  const totalPages = Math.ceil((data?.total || 0) / PAGE_SIZE);

  const filteredLogs = search
    ? logs.filter(
        (l: any) =>
          l.user_name?.toLowerCase().includes(search.toLowerCase()) ||
          l.action?.toLowerCase().includes(search.toLowerCase()) ||
          JSON.stringify(l.details)?.toLowerCase().includes(search.toLowerCase())
      )
    : logs;

  const exportCSV = () => {
    const headers = ["Timestamp", "User", "Action", "Target", "IP Address", "Details"];
    const rows = filteredLogs.map((l: any) => [
      format(new Date(l.performed_at), "yyyy-MM-dd HH:mm:ss"),
      l.user_name || "System",
      ACTION_LABELS[l.action] || l.action,
      l.target_user_id || "—",
      l.ip_address || "—",
      l.details ? JSON.stringify(l.details) : "—",
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell: string) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit-logs-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getActionIcon = (action: string) => {
    const Icon = ACTION_ICONS[action] || FileText;
    return <Icon className="w-4 h-4" />;
  };

  const getActionBadgeVariant = (action: string) => {
    if (["user_deleted", "role_removed", "mfa_disabled"].includes(action)) return "destructive";
    if (["role_added", "mfa_enabled", "invitation_approved"].includes(action)) return "default";
    return "secondary";
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <Header />
      <AdminTabsNav active="audit-logs" />
      <main className="container mx-auto px-4 py-6 max-w-5xl">
        <div className="mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="mb-2">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Admin
          </Button>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/10">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Audit Logs</h1>
                <p className="text-sm text-muted-foreground">
                  Immutable record of all security-sensitive actions
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="w-4 h-4 mr-1" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by user, action, or details..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              {Object.entries(ACTION_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Logs */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No audit logs found.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredLogs.map((log: any) => (
              <Card key={log.id}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="p-1.5 rounded-md bg-secondary mt-0.5">
                        {getActionIcon(log.action)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">
                            {log.user_name || "System"}
                          </span>
                          <Badge variant={getActionBadgeVariant(log.action) as any} className="text-xs">
                            {ACTION_LABELS[log.action] || log.action}
                          </Badge>
                        </div>
                        {log.details && (
                          <p className="text-xs text-muted-foreground mt-1 truncate max-w-md">
                            {typeof log.details === "object"
                              ? Object.entries(log.details)
                                  .map(([k, v]) => `${k}: ${v}`)
                                  .join(" • ")
                              : String(log.details)}
                          </p>
                        )}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                          <span>{format(new Date(log.performed_at), "dd MMM yyyy, HH:mm:ss")}</span>
                          {log.ip_address && <span>• {log.ip_address}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">
              Page {page + 1} of {totalPages} ({data?.total} total)
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AuditLogs;
