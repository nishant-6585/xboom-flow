import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

type SyncLog = {
  id: string;
  woo_order_id: string | null;
  event_type: string;
  direction: string;
  status: string;
  error_message: string | null;
  woo_status: string | null;
  attempt: number;
  created_at: string;
};

export function WooCommerceSyncPanel() {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const loadLogs = async () => {
    setLoadingLogs(true);
    const { data, error } = await supabase
      .from("woo_sync_logs")
      .select("id, woo_order_id, event_type, direction, status, error_message, woo_status, attempt, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) {
      toast({ title: "Failed to load sync logs", description: error.message, variant: "destructive" });
    } else {
      setLogs((data || []) as SyncLog[]);
    }
    setLoadingLogs(false);
  };

  useEffect(() => { loadLogs(); }, []);

  const runBackfill = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("woocommerce-orders-backfill", {
        body: { days: 2 },
      });
      if (error) throw error;
      toast({
        title: "Backfill complete",
        description: `Processed ${data?.processed ?? 0} orders, ${data?.failed ?? 0} failed`,
      });
      await loadLogs();
    } catch (e) {
      toast({
        title: "Backfill failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  const statusIcon = (s: string) => {
    if (s === "success") return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    if (s === "failed") return <XCircle className="h-4 w-4 text-destructive" />;
    return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>WooCommerce ⇄ Orders Sync</span>
          <Badge variant="outline">Auto · Daily 02:00 UTC</Badge>
        </CardTitle>
        <CardDescription>
          Mirrors WooCommerce <strong>processing</strong> orders into the internal Orders table with
          <code className="mx-1 rounded bg-muted px-1 text-xs">source=website</code>.
          Webhook handles real-time; backfill catches missed events from the last 2 days.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={runBackfill} disabled={running}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Sync now (last 2 days)
          </Button>
          <Button variant="outline" onClick={loadLogs} disabled={loadingLogs}>
            {loadingLogs ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Refresh logs
          </Button>
        </div>

        <div className="rounded-md border">
          <div className="border-b bg-muted/50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Recent sync events (last 20)
          </div>
          <div className="max-h-80 overflow-y-auto divide-y">
            {logs.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">No sync events yet.</div>
            )}
            {logs.map((l) => (
              <div key={l.id} className="flex items-start gap-3 px-3 py-2 text-sm">
                <div className="mt-0.5">{statusIcon(l.status)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {l.event_type} · {l.direction}
                    </span>
                    {l.woo_order_id && (
                      <Badge variant="secondary" className="text-xs">#{l.woo_order_id}</Badge>
                    )}
                    {l.woo_status && (
                      <Badge variant="outline" className="text-xs">{l.woo_status}</Badge>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {format(new Date(l.created_at), "MMM d, HH:mm:ss")}
                    </span>
                  </div>
                  {l.error_message && (
                    <div className="mt-1 text-xs text-destructive break-words">{l.error_message}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <p>• Webhook URL: <code className="rounded bg-muted px-1">/functions/v1/woocommerce-webhook</code> (HMAC SHA256)</p>
          <p>• Reverse sync fires automatically on internal status changes for website orders.</p>
          <p>• Website orders are excluded from sales-person KPIs and gamification by default.</p>
        </div>
      </CardContent>
    </Card>
  );
}