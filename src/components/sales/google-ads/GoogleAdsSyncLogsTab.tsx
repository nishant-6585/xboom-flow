import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, CheckCircle2, XCircle, Zap } from "lucide-react";
import { format } from "date-fns";

interface SyncLog {
  id: string;
  last_synced_at: string;
  leads_fetched: number;
  leads_inserted: number;
  leads_skipped: number;
  duplicates_skipped: number;
  errors: string[];
  status: string;
  sync_duration_ms: number;
  created_at: string;
}

export function GoogleAdsSyncLogsTab() {
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("google_ads_sync_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setSyncLogs(data as unknown as SyncLog[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const triggerSync = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const res = await supabase.functions.invoke("google-ads-sync", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.error) throw res.error;
      toast({
        title: "Sync Complete",
        description: `Fetched: ${res.data.fetched}, Inserted: ${res.data.inserted}, Skipped: ${res.data.skipped}`,
      });
      fetchLogs();
    } catch (err: unknown) {
      toast({ title: "Sync Failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          Sync Logs
        </CardTitle>
        <Button onClick={triggerSync} disabled={syncing} size="sm" className="gap-2">
          <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync Now"}
        </Button>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Auto-syncs leads from Google Ads every 5 minutes. Use "Sync Now" for manual trigger.
        </p>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : syncLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sync history yet.</p>
        ) : (
          <div className="border rounded-lg overflow-auto max-h-[500px]">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left p-2 font-medium">Time</th>
                  <th className="text-left p-2 font-medium">Status</th>
                  <th className="text-center p-2 font-medium">Fetched</th>
                  <th className="text-center p-2 font-medium">Inserted</th>
                  <th className="text-center p-2 font-medium">Skipped</th>
                  <th className="text-center p-2 font-medium">Dupes</th>
                  <th className="text-center p-2 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {syncLogs.map((log) => (
                  <tr key={log.id} className="border-t hover:bg-muted/20">
                    <td className="p-2 text-xs">{format(new Date(log.created_at), "dd MMM, HH:mm:ss")}</td>
                    <td className="p-2">
                      {log.status === "success" ? (
                        <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-xs">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Success
                        </Badge>
                      ) : log.status === "running" ? (
                        <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50 text-xs">
                          <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Running
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-xs">
                          <XCircle className="w-3 h-3 mr-1" /> Error
                        </Badge>
                      )}
                    </td>
                    <td className="p-2 text-center">{log.leads_fetched}</td>
                    <td className="p-2 text-center font-medium text-emerald-600">+{log.leads_inserted}</td>
                    <td className="p-2 text-center text-muted-foreground">{log.leads_skipped}</td>
                    <td className="p-2 text-center text-xs text-muted-foreground">{log.duplicates_skipped || 0}</td>
                    <td className="p-2 text-center text-xs text-muted-foreground">
                      {log.sync_duration_ms ? `${(log.sync_duration_ms / 1000).toFixed(1)}s` : "—"}
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
