import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Briefcase, FileQuestion, Package, Truck, MessageSquare, Activity, Bell } from "lucide-react";
import { format } from "date-fns";

interface KPI {
  accounts: number;
  contacts: number;
  ordersOpen: number;
  ordersOverdue: number;
  rfqsNew: number;
  rfqsInQuote: number;
  ticketsOpen: number;
  unreadNotifs: number;
}

interface Transition {
  id: string;
  order_id: string;
  from_state: string | null;
  to_state: string;
  actor_name_snapshot: string | null;
  customer_facing_note: string | null;
  internal_note: string | null;
  transitioned_at: string;
  portal_orders?: { order_number: string | null } | null;
}

interface NotifLog {
  id: string;
  channel: string;
  recipient_contact_id: string | null;
  recipient_user_id: string | null;
  template_id: string;
  related_entity_type: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

export default function PortalDashboard() {
  const [loading, setLoading] = useState(true);
  const [kpi, setKpi] = useState<KPI | null>(null);
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [notifs, setNotifs] = useState<NotifLog[]>([]);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [
        accountsRes,
        contactsRes,
        ordersOpenRes,
        ordersDispatchedRes,
        rfqsNewRes,
        rfqsQuoteRes,
        ticketsOpenRes,
        notifPendingRes,
        transitionsRes,
        notifsRes,
      ] = await Promise.all([
        supabase.from("portal_accounts").select("id", { count: "exact", head: true }),
        supabase.from("portal_contacts").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("portal_orders").select("id", { count: "exact", head: true }).not("current_state", "in", "(delivered,cancelled,closed)"),
        supabase.from("portal_orders").select("id", { count: "exact", head: true }).eq("current_state", "dispatched"),
        supabase.from("portal_rfqs").select("id", { count: "exact", head: true }).eq("status", "new"),
        supabase.from("portal_rfqs").select("id", { count: "exact", head: true }).eq("status", "in_quote"),
        supabase.from("portal_tickets").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress", "awaiting_customer"]),
        supabase.from("portal_notifications_log").select("id", { count: "exact", head: true }).eq("status", "failed"),
        supabase
          .from("portal_state_transitions")
          .select("id, order_id, from_state, to_state, actor_name_snapshot, customer_facing_note, internal_note, transitioned_at, portal_orders(order_number)")
          .order("transitioned_at", { ascending: false })
          .limit(50),
        supabase
          .from("portal_notifications_log")
          .select("id, channel, recipient_contact_id, recipient_user_id, template_id, related_entity_type, status, error_message, created_at")
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      setKpi({
        accounts: accountsRes.count ?? 0,
        contacts: contactsRes.count ?? 0,
        ordersOpen: ordersOpenRes.count ?? 0,
        ordersOverdue: ordersDispatchedRes.count ?? 0,
        rfqsNew: rfqsNewRes.count ?? 0,
        rfqsInQuote: rfqsQuoteRes.count ?? 0,
        ticketsOpen: ticketsOpenRes.count ?? 0,
        unreadNotifs: notifPendingRes.count ?? 0,
      });
      setTransitions((transitionsRes.data as any) ?? []);
      setNotifs((notifsRes.data as any) ?? []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Customer Portal Dashboard</h1>
            <p className="text-muted-foreground">Operational overview, audit trail, and notification log</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm"><Link to="/admin/portal-customers"><Briefcase className="w-4 h-4 mr-1" />Customers</Link></Button>
            <Button asChild variant="outline" size="sm"><Link to="/admin/portal-rfqs"><FileQuestion className="w-4 h-4 mr-1" />RFQs</Link></Button>
            <Button asChild variant="outline" size="sm"><Link to="/admin/portal-orders"><Package className="w-4 h-4 mr-1" />Orders</Link></Button>
            <Button asChild variant="outline" size="sm"><Link to="/admin/portal-dispatch"><Truck className="w-4 h-4 mr-1" />Dispatch</Link></Button>
          </div>
        </div>

        {loading || !kpi ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="Accounts" value={kpi.accounts} icon={<Briefcase className="w-4 h-4" />} />
              <KpiCard label="Active Contacts" value={kpi.contacts} icon={<Briefcase className="w-4 h-4" />} />
              <KpiCard label="Open Orders" value={kpi.ordersOpen} icon={<Package className="w-4 h-4" />} />
              <KpiCard label="In Transit" value={kpi.ordersOverdue} icon={<Truck className="w-4 h-4" />} />
              <KpiCard label="New RFQs" value={kpi.rfqsNew} icon={<FileQuestion className="w-4 h-4" />} accent={kpi.rfqsNew > 0 ? "warning" : undefined} />
              <KpiCard label="RFQs In Quote" value={kpi.rfqsInQuote} icon={<FileQuestion className="w-4 h-4" />} />
              <KpiCard label="Open Tickets" value={kpi.ticketsOpen} icon={<MessageSquare className="w-4 h-4" />} />
              <KpiCard label="Failed Notifications" value={kpi.unreadNotifs} icon={<Bell className="w-4 h-4" />} accent={kpi.unreadNotifs > 0 ? "destructive" : undefined} />
            </div>

            <Tabs defaultValue="audit" className="w-full">
              <TabsList>
                <TabsTrigger value="audit"><Activity className="w-4 h-4 mr-1" />State Transitions</TabsTrigger>
                <TabsTrigger value="notifs"><Bell className="w-4 h-4 mr-1" />Notifications Log</TabsTrigger>
              </TabsList>

              <TabsContent value="audit">
                <Card>
                  <CardHeader><CardTitle>Recent Order State Transitions</CardTitle></CardHeader>
                  <CardContent>
                    {transitions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No transitions yet.</p>
                    ) : (
                      <div className="divide-y">
                        {transitions.map((t) => (
                          <div key={t.id} className="py-3 flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-sm">{t.portal_orders?.order_number ?? t.order_id.slice(0, 8)}</span>
                                {t.from_state && <Badge variant="outline">{t.from_state}</Badge>}
                                <span className="text-muted-foreground text-xs">→</span>
                                <Badge>{t.to_state}</Badge>
                                <span className="text-xs text-muted-foreground">by {t.actor_name_snapshot ?? "system"}</span>
                              </div>
                              {t.customer_facing_note && <p className="text-sm mt-1">{t.customer_facing_note}</p>}
                              {t.internal_note && <p className="text-xs text-muted-foreground mt-1 italic">Internal: {t.internal_note}</p>}
                            </div>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">{format(new Date(t.transitioned_at), "dd MMM HH:mm")}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="notifs">
                <Card>
                  <CardHeader><CardTitle>Recent Notifications</CardTitle></CardHeader>
                  <CardContent>
                    {notifs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No notifications yet.</p>
                    ) : (
                      <div className="divide-y">
                        {notifs.map((n) => (
                          <div key={n.id} className="py-3 flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline">{n.channel}</Badge>
                                {n.event_type && <span className="text-xs text-muted-foreground">{n.event_type}</span>}
                                <Badge variant={n.status === "sent" ? "default" : n.status === "failed" ? "destructive" : "secondary"}>{n.status}</Badge>
                              </div>
                              <p className="text-sm mt-1 truncate">
                                {n.recipient_contact_id ? `contact:${n.recipient_contact_id.slice(0,8)}` : n.recipient_user_id ? `user:${n.recipient_user_id.slice(0,8)}` : "—"}
                                {` · ${n.template_id}`}
                                {n.related_entity_type ? ` · ${n.related_entity_type}` : ""}
                              </p>
                              {n.error_message && <p className="text-xs text-destructive mt-1">{n.error_message}</p>}
                            </div>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">{format(new Date(n.created_at), "dd MMM HH:mm")}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon, accent }: { label: string; value: number; icon: React.ReactNode; accent?: "destructive" | "warning" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <div className={`text-3xl font-bold mt-2 ${accent === "destructive" ? "text-destructive" : accent === "warning" ? "text-amber-600" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}