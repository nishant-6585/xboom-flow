import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useLeadSyncHealth } from "@/hooks/useLeadSyncHealth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";

export function LeadSyncHealthPanel() {
  const { data: rows, isLoading, refetch, isFetching } = useLeadSyncHealth();
  const [sendingTest, setSendingTest] = useState(false);

  const sendTestAlert = async () => {
    setSendingTest(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-health-check", {
        body: {},
        // alert=1 forces email even on manual call
      });
      if (error) throw error;
      // Re-invoke with query param via fetch since invoke doesn't support query params
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-health-check?alert=1`;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token || ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (json?.email?.sent) {
        toast.success("Alert email sent to Vishal & Nishant");
      } else if (json?.stale_count === 0) {
        toast.info("All sources healthy — no alert needed");
      } else {
        toast.error(`Alert not sent: ${json?.email?.error || "unknown"}`);
      }
    } catch (e: any) {
      toast.error(`Failed: ${e.message}`);
    } finally {
      setSendingTest(false);
    }
  };

  const staleCount = rows?.filter((r) => r.is_stale).length || 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <CardTitle className="text-base">Lead Source Sync Health</CardTitle>
          {staleCount > 0 ? (
            <Badge variant="destructive" className="ml-2">{staleCount} stale</Badge>
          ) : rows ? (
            <Badge variant="secondary" className="ml-2 bg-green-500/10 text-green-700 dark:text-green-400">All healthy</Badge>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={sendTestAlert} disabled={sendingTest}>
            Send test alert
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Checking sync status…</div>
        ) : !rows || rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No data</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-muted-foreground">
                  <th className="text-left py-2 px-2">Source</th>
                  <th className="text-left py-2 px-2">Last Record</th>
                  <th className="text-left py-2 px-2">Idle</th>
                  <th className="text-left py-2 px-2">Threshold</th>
                  <th className="text-right py-2 px-2">Total</th>
                  <th className="text-center py-2 px-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.source} className="border-b hover:bg-muted/30">
                    <td className="py-2 px-2 font-medium">{r.label}</td>
                    <td className="py-2 px-2 text-muted-foreground">
                      {(() => {
                        const d = r.last_record_at ? new Date(r.last_record_at) : null;
                        if (!d || Number.isNaN(d.getTime())) {
                          return <span className="text-destructive">Never</span>;
                        }
                        return (
                          <div>
                            <div>{formatDistanceToNow(d, { addSuffix: true })}</div>
                            <div className="text-xs opacity-60">{d.toLocaleString()}</div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-2 px-2">{r.hours_since === null ? "—" : `${r.hours_since.toFixed(1)} h`}</td>
                    <td className="py-2 px-2 text-muted-foreground">{r.threshold_hours} h</td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.total_records.toLocaleString()}</td>
                    <td className="py-2 px-2 text-center">
                      {r.is_stale ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="w-3 h-3" /> Stale
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1 bg-green-500/10 text-green-700 dark:text-green-400">
                          <CheckCircle2 className="w-3 h-3" /> OK
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground mt-3">
              The system checks each source automatically every hour. If any source goes stale, an alert email is sent to Vishal &amp; Nishant.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}