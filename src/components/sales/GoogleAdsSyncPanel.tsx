import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, CheckCircle2, XCircle, Clock, Zap, TrendingUp, AlertTriangle } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

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

export function GoogleAdsSyncPanel() {
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("google_ads_sync_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (!error && data) {
      setSyncLogs(data as unknown as SyncLog[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const triggerSync = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await supabase.functions.invoke("google-ads-sync", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.error) throw res.error;

      const result = res.data;
      toast({
        title: "Sync Complete",
        description: `Fetched: ${result.fetched}, Inserted: ${result.inserted}, Skipped: ${result.skipped}`,
      });
      fetchLogs();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Sync failed";
      toast({ title: "Sync Failed", description: message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const lastSuccess = syncLogs.find((l) => l.status === "success");
  const todayLogs = syncLogs.filter(
    (l) => new Date(l.created_at).toDateString() === new Date().toDateString()
  );
  const todayInserted = todayLogs.reduce((s, l) => s + l.leads_inserted, 0);
  const todayFailed = todayLogs.filter((l) => l.status === "error").length;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Leads Today</p>
                <p className="text-2xl font-bold">{todayInserted}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Syncs Today</p>
                <p className="text-2xl font-bold">{todayLogs.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Failed Syncs</p>
                <p className="text-2xl font-bold">{todayFailed}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Clock className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last Sync</p>
                <p className="text-sm font-medium">
                  {lastSuccess
                    ? formatDistanceToNow(new Date(lastSuccess.last_synced_at), { addSuffix: true })
                    : "Never"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Manual Sync */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Google Ads Lead Sync
          </CardTitle>
          <Button onClick={triggerSync} disabled={syncing} size="sm" className="gap-2">
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync Now"}
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Automatically fetches new leads from Google Ads Lead Form Extensions. Scheduled to run every 5 minutes.
          </p>

          {/* Sync History */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground">Recent Sync History</h4>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : syncLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sync history yet. Click "Sync Now" to start.</p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
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
                        <td className="p-2 text-xs">
                          {format(new Date(log.created_at), "dd MMM, HH:mm:ss")}
                        </td>
                        <td className="p-2">
                          {log.status === "success" ? (
                            <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 text-xs">
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
                        <td className="p-2 text-center font-medium text-green-600">
                          +{log.leads_inserted}
                        </td>
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
