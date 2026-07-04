import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, ExternalLink, BookOpen } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";
import { UnmatchedZohoInvoicesPanel } from "./UnmatchedZohoInvoicesPanel";

type Status = {
  connected: boolean;
  organization_id: string | null;
  api_domain: string | null;
  scope: string | null;
  expires_at: string | null;
  connected_at: string | null;
};

type SyncLog = {
  id: string;
  entity: string;
  status: string;
  records_synced: number | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
};

export function ZohoBooksSettingsPanel() {
  const { toast } = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [invoiceCount, setInvoiceCount] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: statusRows }, { data: logRows }, { count }] = await Promise.all([
      supabase.rpc("get_zoho_connection_status", { p_provider: "zoho_books" }),
      supabase
        .from("zoho_sync_log")
        .select("id,entity,status,records_synced,error_message,started_at,completed_at")
        .eq("provider", "zoho_books")
        .order("started_at", { ascending: false })
        .limit(5),
      supabase
        .from("zoho_books_invoices")
        .select("invoice_id", { count: "exact", head: true }),
    ]);
    const row = (statusRows as Status[] | null)?.[0] ?? null;
    setStatus(row);
    setLogs((logRows as SyncLog[]) ?? []);
    setInvoiceCount(count ?? 0);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("zoho-oauth-start");
      if (error) throw error;
      const url = (data as { authorize_url?: string })?.authorize_url;
      if (!url) throw new Error("No authorize URL returned");
      window.open(url, "_blank", "noopener,noreferrer,width=720,height=820");
      toast({
        title: "Zoho authorization opened",
        description: "Complete the consent in the new window, then click Refresh here.",
      });
    } catch (e: any) {
      toast({
        title: "Could not start Zoho OAuth",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setConnecting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("zoho-books-sync");
      if (error) throw error;
      const synced = (data as { records_synced?: number })?.records_synced ?? 0;
      toast({
        title: "Sync complete",
        description: `${synced} invoices pulled from Zoho Books.`,
      });
      await load();
    } catch (e: any) {
      toast({
        title: "Sync failed",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Zoho Books Integration
          {status?.connected ? (
            <Badge variant="default" className="ml-2">Connected</Badge>
          ) : (
            <Badge variant="secondary" className="ml-2">Not connected</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading status…
          </div>
        ) : status?.connected ? (
          <div className="grid gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Organization:</span>{" "}
              <span className="font-mono">{status.organization_id ?? "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">API domain:</span>{" "}
              <span className="font-mono">{status.api_domain}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Scope:</span>{" "}
              <span className="font-mono text-xs">{status.scope ?? "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Connected:</span>{" "}
              {status.connected_at
                ? formatDistanceToNow(new Date(status.connected_at), { addSuffix: true })
                : "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Cached invoices:</span>{" "}
              <span className="font-medium">{invoiceCount ?? 0}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Connect Zoho Books to pull invoices into this workspace. Uses the
            self-client credentials configured in secrets (.com data center).
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleConnect} disabled={connecting} variant={status?.connected ? "outline" : "default"}>
            {connecting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4 mr-2" />
            )}
            {status?.connected ? "Reconnect" : "Connect Zoho Books"}
          </Button>
          {status?.connected && (
            <Button onClick={handleSync} disabled={syncing}>
              {syncing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sync invoices now
            </Button>
          )}
          <Button onClick={load} variant="ghost" size="sm">
            Refresh status
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/zoho-invoices">Browse invoices & reconcile</Link>
          </Button>
        </div>

        {logs.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recent syncs
            </div>
            <div className="divide-y">
              {logs.map((log) => (
                <div key={log.id} className="px-3 py-2 text-sm flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        log.status === "success"
                          ? "default"
                          : log.status === "running"
                            ? "secondary"
                            : "destructive"
                      }
                    >
                      {log.status}
                    </Badge>
                    <span className="text-muted-foreground">{log.entity}</span>
                    {log.records_synced !== null && (
                      <span>· {log.records_synced} records</span>
                    )}
                    {log.error_message && (
                      <span className="text-destructive text-xs truncate max-w-md">
                        {log.error_message}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(log.started_at), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    <div className="mt-4">
      <UnmatchedZohoInvoicesPanel />
    </div>
    </>
  );
}