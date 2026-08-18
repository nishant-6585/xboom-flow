import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import AdminTabsNav from "@/components/admin/AdminTabsNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Bell,
  Mail,
  MessageSquare,
  MonitorSmartphone,
  Search,
  Slack,
  Users,
} from "lucide-react";

type RecipientRow = {
  user_id: string;
  name: string | null;
  email: string | null;
  slack_user_id: string | null;
  roles: string[];
};

const TEAM_ROLES = ["supply_chain", "sales_manager", "admin"] as const;

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

      // profiles.user_id is the auth uid that user_roles references —
      // profiles.id is the row's own uuid. Matching on `id` here returned
      // nothing, which is why this page used to render "(no name)" rows.
      const { data: profs } = await (supabase as any)
        .from("profiles")
        .select("user_id, name, email, slack_user_id")
        .in("user_id", userIds);

      const byUser = new Map<string, RecipientRow>();
      for (const p of ((profs ?? []) as {
        user_id: string;
        name: string | null;
        email: string | null;
        slack_user_id: string | null;
      }[])) {
        byUser.set(p.user_id, {
          user_id: p.user_id,
          name: p.name,
          email: p.email,
          slack_user_id: p.slack_user_id,
          roles: [],
        });
      }
      for (const uid of userIds) {
        if (!byUser.has(uid)) {
          byUser.set(uid, { user_id: uid, name: null, email: null, slack_user_id: null, roles: [] });
        }
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
            {!r.slack_user_id && (
              <Badge
                variant="outline"
                className="text-[10px] border-amber-400 text-amber-700 dark:text-amber-500"
                title="No slack_user_id on the profile — Slack DMs fall back to a users.lookupByEmail on this address, which fails if their Slack account uses a different email."
              >
                no Slack id
              </Badge>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

const CHANNELS = [
  {
    icon: Bell,
    name: "Notification bell",
    detail: "Row in public.notifications, written by the ticket triggers.",
  },
  {
    icon: MessageSquare,
    name: "Snackbar toast",
    detail: "Realtime INSERT on notifications → sonner toast; stays until dismissed.",
  },
  {
    icon: MonitorSmartphone,
    name: "Browser push",
    detail: "trg_send_push_on_notification → send-push, for anyone who enabled it.",
  },
  {
    icon: Mail,
    name: "Email",
    detail: "portal-ticket-alert → platform templates (portal-ticket-created / -reply-to-staff / -assigned).",
  },
  {
    icon: Slack,
    name: "Slack DM",
    detail: "portal-ticket-alert → direct message per recipient. No channel broadcast.",
  },
] as const;

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
        .select("user_id, name, email")
        .eq("user_id", id)
        .maybeSingle();
      return data as { user_id: string; name: string | null; email: string | null } | null;
    },
  });

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
              A ticket on this order notifies{" "}
              <span className="font-medium">the whole supply-chain team</span>
              {orderQ.data.sales_person_id ? (
                <>
                  {" "}plus the order's salesperson —{" "}
                  <span className="font-medium">
                    {salesQ.data
                      ? `${salesQ.data.name ?? "(no name)"} <${salesQ.data.email ?? "—"}>`
                      : "loading…"}
                  </span>
                </>
              ) : (
                <> (this order has no salesperson assigned, which no longer suppresses the alert)</>
              )}
              , plus the ticket's assignee once someone takes it.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PortalTicketNotificationConfig() {
  const teamQ = useRecipients(TEAM_ROLES);
  const rows = teamQ.data ?? [];

  const byRole = useMemo(() => {
    const map: Record<string, RecipientRow[]> = {
      supply_chain: [],
      sales_manager: [],
      admin: [],
    };
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
              Read-only view of who gets alerted when a customer raises a portal ticket or
              replies on one, based on the active database triggers.
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
            <CardTitle className="text-base">Channels every ticket alert uses</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CHANNELS.map((c) => (
              <div key={c.name} className="flex gap-2.5">
                <c.icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="text-sm font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.detail}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Every portal ticket and every customer reply → the whole supply-chain team
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Supply chain is alerted on every ticket regardless of type, linked order, or
              whether anyone has been assigned — so a ticket nobody owns is never a ticket
              nobody hears about. The assignee, the related order's salesperson and the
              account rep are added on top. Admins and sales managers keep in-app visibility
              but are deliberately left off the email and Slack fan-out.
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              {TEAM_ROLES.map((role) => (
                <div key={role}>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    {role} ({byRole[role]?.length ?? 0})
                    {role !== "supply_chain" && (
                      <span className="ml-1 normal-case tracking-normal">· in-app only</span>
                    )}
                  </div>
                  {teamQ.isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                  ) : (
                    <RecipientList
                      rows={byRole[role] ?? []}
                      emptyLabel={`No users with the ${role} role.`}
                    />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assignment and escalation</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              Assigning a ticket from the inbox writes{" "}
              <span className="font-mono">portal_tickets.assigned_to</span> and DMs, emails and
              notifies the new owner directly. It does <span className="font-medium">not</span>{" "}
              silence the team — supply chain still gets every subsequent customer reply.
            </p>
            <p>
              <span className="font-mono">portal-sla-monitor</span> runs every 30 minutes and
              alerts on first-response and resolution breaches across all the same channels,
              escalating to sales managers and auto-raising the ticket's priority.
            </p>
          </CardContent>
        </Card>

        <OrderScopeChecker />
      </div>
    </div>
  );
}
