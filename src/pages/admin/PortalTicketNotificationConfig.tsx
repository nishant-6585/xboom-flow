import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import AdminTabsNav from "@/components/admin/AdminTabsNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Search, Users } from "lucide-react";

type RecipientRow = {
  user_id: string;
  name: string | null;
  email: string | null;
  roles: string[];
};

const WEBSITE_ROLES = ["admin", "sales_manager", "supply_chain"] as const;

function useRecipients(roles: readonly string[]) {
  return useQuery({
    queryKey: ["portal-ticket-notif-recipients", roles],
    queryFn: async (): Promise<RecipientRow[]> => {
      const { data: rolesRows, error: rolesErr } = await (supabase as any)
        .from("user_roles")
        .select("user_id, role")
        .in("role", roles as unknown as string[]);
      if (rolesErr) throw rolesErr;

      const userIds = Array.from(
        new Set(((rolesRows ?? []) as { user_id: string }[]).map((r) => r.user_id)),
      );
      if (userIds.length === 0) return [];

      const { data: profs } = await (supabase as any)
        .from("profiles")
        .select("id, name, email")
        .in("id", userIds);

      const byUser = new Map<string, RecipientRow>();
      for (const p of ((profs ?? []) as { id: string; name: string | null; email: string | null }[])) {
        byUser.set(p.id, { user_id: p.id, name: p.name, email: p.email, roles: [] });
      }
      for (const uid of userIds) {
        if (!byUser.has(uid)) byUser.set(uid, { user_id: uid, name: null, email: null, roles: [] });
      }
      for (const r of ((rolesRows ?? []) as { user_id: string; role: string }[])) {
        const row = byUser.get(r.user_id);
        if (row && !row.roles.includes(r.role)) row.roles.push(r.role);
      }
      return Array.from(byUser.values()).sort((a, b) =>
        (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""),
      );
    },
  });
}

function RecipientList({ rows, emptyLabel }: { rows: RecipientRow[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <ul className="divide-y">
      {rows.map((r) => (
        <li key={r.user_id} className="py-2 flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{r.name ?? "(no name)"}</div>
            <div className="text-xs text-muted-foreground truncate">{r.email ?? "—"}</div>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {r.roles.map((role) => (
              <Badge key={role} variant="secondary" className="text-[10px]">
                {role}
              </Badge>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

function OrderScopeChecker() {
  const [orderNumber, setOrderNumber] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);

  const orderQ = useQuery({
    enabled: !!submitted,
    queryKey: ["order-lookup", submitted],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("orders")
        .select("id, order_number, source, sales_person_id")
        .eq("order_number", submitted)
        .maybeSingle();
      if (error) throw error;
      return data as null | {
        id: string;
        order_number: string;
        source: string | null;
        sales_person_id: string | null;
      };
    },
  });

  const salesQ = useQuery({
    enabled: !!orderQ.data?.sales_person_id,
    queryKey: ["profile-lookup", orderQ.data?.sales_person_id],
    queryFn: async () => {
      const id = orderQ.data!.sales_person_id!;
      const { data } = await (supabase as any)
        .from("profiles")
        .select("id, name, email")
        .eq("id", id)
        .maybeSingle();
      return data as { id: string; name: string | null; email: string | null } | null;
    },
  });

  const isWebsite =
    !!orderQ.data &&
    ((orderQ.data.source ?? "manual") === "website" ||
      orderQ.data.sales_person_id === "a8050cc3-7d17-44ac-a083-d8023d505331");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Search className="h-4 w-4" /> Test scope for a specific order
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="flex items-center gap-2 flex-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(orderNumber.trim() || null);
          }}
        >
          <input
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="Order number (e.g. ORD2600434 or W-2024-0099)"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm w-80"
          />
          <Button type="submit" size="sm">Check</Button>
        </form>
        {submitted && orderQ.isLoading && (
          <p className="text-sm text-muted-foreground">Looking up order…</p>
        )}
        {submitted && !orderQ.isLoading && !orderQ.data && (
          <p className="text-sm text-destructive">No order found with that number.</p>
        )}
        {orderQ.data && (
          <div className="text-sm space-y-1">
            <div>
              Order <span className="font-mono">{orderQ.data.order_number}</span> · source{" "}
              <Badge variant="secondary">{orderQ.data.source ?? "manual"}</Badge>
            </div>
            <div>
              Ticket would notify:{" "}
              {isWebsite ? (
                <span className="font-medium">
                  every user with role admin, sales_manager, or supply_chain (website order path)
                </span>
              ) : orderQ.data.sales_person_id ? (
                <span className="font-medium">
                  the assigned salesperson —{" "}
                  {salesQ.data
                    ? `${salesQ.data.name ?? "(no name)"} <${salesQ.data.email ?? "—"}>`
                    : "loading…"}
                </span>
              ) : (
                <span className="text-destructive">nobody — no salesperson assigned</span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PortalTicketNotificationConfig() {
  const websiteQ = useRecipients(WEBSITE_ROLES);
  const rows = websiteQ.data ?? [];

  const byRole = useMemo(() => {
    const map: Record<string, RecipientRow[]> = { admin: [], sales_manager: [], supply_chain: [] };
    for (const r of rows) {
      for (const role of r.roles) {
        if (map[role]) map[role].push(r);
      }
    }
    return map;
  }, [rows]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <AdminTabsNav active="portal-tickets" />
      <div className="container mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Users className="h-6 w-6" /> Ticket notification config
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Read-only view of who currently gets notified when a customer raises a portal
              ticket, based on the active database trigger.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/portal-tickets">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to inbox
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Website / “Vishal” orders → admin + sales_manager + supply_chain
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            {(["admin", "sales_manager", "supply_chain"] as const).map((role) => (
              <div key={role}>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  {role} ({byRole[role]?.length ?? 0})
                </div>
                {websiteQ.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : (
                  <RecipientList
                    rows={byRole[role] ?? []}
                    emptyLabel={`No users with the ${role} role.`}
                  />
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Manual orders → assigned salesperson</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              For any non-website order, only the salesperson set on the order (
              <span className="font-mono">orders.sales_person_id</span>) is notified. Use the
              scope tester below to verify a specific order.
            </p>
            <p>
              If a manual order has no assigned salesperson, no notification is dispatched —
              reassign the order to fix this.
            </p>
          </CardContent>
        </Card>

        <OrderScopeChecker />
      </div>
    </div>
  );
}