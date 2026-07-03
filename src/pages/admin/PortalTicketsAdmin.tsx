import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import AdminTabsNav from "@/components/admin/AdminTabsNav";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Wrench } from "lucide-react";

type AdminTicketRow = {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
  priority: string;
  ticket_type: "general" | "service_request";
  related_order_number: string | null;
  related_product_name: string | null;
  sla_first_response_due_at: string | null;
  sla_resolution_due_at: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
  created_at: string;
  account: { company_name: string | null } | null;
};

function useAdminTickets(filter: "all" | "general" | "service_request") {
  return useQuery({
    queryKey: ["admin", "portal-tickets", filter],
    queryFn: async (): Promise<AdminTicketRow[]> => {
      let q = supabase
        .from("portal_tickets")
        .select(
          "id, ticket_number, subject, status, priority, ticket_type, related_order_number, related_product_name, sla_first_response_due_at, sla_resolution_due_at, first_response_at, resolved_at, created_at, account:portal_accounts(company_name)",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (filter !== "all") q = q.eq("ticket_type", filter);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as unknown) as AdminTicketRow[];
    },
  });
}

function fmt(dt: string | null) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isBreached(row: AdminTicketRow): "fr" | "res" | null {
  const now = Date.now();
  const active = row.status !== "resolved" && row.status !== "closed";
  if (!active) return null;
  if (
    !row.first_response_at &&
    row.sla_first_response_due_at &&
    new Date(row.sla_first_response_due_at).getTime() < now
  ) return "fr";
  if (
    !row.resolved_at &&
    row.sla_resolution_due_at &&
    new Date(row.sla_resolution_due_at).getTime() < now
  ) return "res";
  return null;
}

export default function PortalTicketsAdmin() {
  const [filter, setFilter] = useState<"all" | "general" | "service_request">("all");
  const { data, isLoading } = useAdminTickets(filter);

  const stats = useMemo(() => {
    const rows = data ?? [];
    return {
      total: rows.length,
      sr: rows.filter((r) => r.ticket_type === "service_request").length,
      breached: rows.filter((r) => isBreached(r) !== null).length,
    };
  }, [data]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <AdminTabsNav active="portal-tickets" />
      <div className="container mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Portal Tickets</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {stats.total} total · {stats.sr} service requests · {stats.breached} SLA breached
            </p>
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ticket types</SelectItem>
              <SelectItem value="service_request">Service requests only</SelectItem>
              <SelectItem value="general">General only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Loading…</CardContent></Card>}

        {!isLoading && (data?.length ?? 0) === 0 && (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No tickets.</CardContent></Card>
        )}

        <div className="space-y-2">
          {(data ?? []).map((t) => {
            const breach = isBreached(t);
            return (
              <Card key={t.id} className={breach ? "border-red-300" : ""}>
                <CardContent className="py-3 px-4 flex items-center gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground">{t.ticket_number}</span>
                      <Badge variant="outline">{t.status}</Badge>
                      <Badge variant="outline">{t.priority}</Badge>
                      {t.ticket_type === "service_request" && (
                        <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                          <Wrench className="h-3 w-3 mr-1" /> Service request · 12h
                        </Badge>
                      )}
                      {breach && (
                        <Badge className="bg-red-100 text-red-800 border-red-300">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          {breach === "fr" ? "First-response breached" : "Resolution breached"}
                        </Badge>
                      )}
                    </div>
                    <div className="font-medium mt-0.5 truncate">{t.subject}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {t.account?.company_name ?? "—"}
                      {t.related_order_number ? ` · Order ${t.related_order_number}` : ""}
                      {t.related_product_name ? ` · ${t.related_product_name}` : ""}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground text-right">
                    <div>First response due: {fmt(t.sla_first_response_due_at)}</div>
                    <div>Resolution due: {fmt(t.sla_resolution_due_at)}</div>
                    <div className="mt-1">
                      <Link to={`/portal/tickets/${t.id}`} className="text-primary hover:underline">
                        Open thread →
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}