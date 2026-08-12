import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, RefreshCw, Search } from "lucide-react";
import { format } from "date-fns";
import { useManychatLeads, useManychatSync } from "@/hooks/useManychatLeads";

export function ManychatLeadsPanel() {
  const { data: leads = [], isLoading, refetch, isFetching } = useManychatLeads();
  const sync = useManychatSync();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) =>
      [l.customer_name, l.phone_number, l.email, l.city, l.company, l.product_name, l.assigned_to_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [leads, search]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-primary" />
          <CardTitle className="text-base">ManyChat Leads</CardTitle>
          <Badge variant="secondary">{filtered.length}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, email…"
              className="pl-8 w-full sm:w-64"
            />
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${sync.isPending ? "animate-spin" : ""}`} />
            Sync ManyChat
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading ManyChat leads…</div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No ManyChat leads yet. Connect your ManyChat flow in Admin → Integrations.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-xs uppercase text-muted-foreground">
                  <th className="text-left py-2 px-2">Name</th>
                  <th className="text-left py-2 px-2">Phone</th>
                  <th className="text-left py-2 px-2">Email</th>
                  <th className="text-left py-2 px-2">Interest</th>
                  <th className="text-left py-2 px-2">Channel</th>
                  <th className="text-left py-2 px-2">Assigned to</th>
                  <th className="text-left py-2 px-2">Received</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id} className="border-b hover:bg-muted/30">
                    <td className="py-2 px-2 font-medium">{l.customer_name || "—"}</td>
                    <td className="py-2 px-2">{l.phone_number || "—"}</td>
                    <td className="py-2 px-2 text-muted-foreground">{l.email || "—"}</td>
                    <td className="py-2 px-2">{l.product_name || l.notes || "—"}</td>
                    <td className="py-2 px-2 capitalize">{l.channel || "manychat"}</td>
                    <td className="py-2 px-2">{l.assigned_to_name || "Unassigned"}</td>
                    <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">
                      {format(new Date(l.created_at), "dd MMM yyyy, HH:mm")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
