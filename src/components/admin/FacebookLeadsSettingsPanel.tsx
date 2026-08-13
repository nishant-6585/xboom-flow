import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Facebook, CheckCircle2, RefreshCw, Download } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const FB_FORM_TYPE = "Facebook Leads";
const FB_PAGE_ID = "1585587728331561";

export function FacebookLeadsSettingsPanel() {
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["facebook-leads-stats"],
    queryFn: async () => {
      const [{ data: latest }, { count }] = await Promise.all([
        supabase
          .from("leads")
          .select("submitted_at, name")
          .eq("form_type", FB_FORM_TYPE)
          .order("submitted_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("form_type", FB_FORM_TYPE),
      ]);
      return {
        lastAt: latest?.submitted_at ?? null,
        lastName: latest?.name ?? null,
        total: count ?? 0,
      };
    },
    staleTime: 60 * 1000,
  });

  const runSync = async () => {
    setSyncing(true);
    const toastId = toast.loading("Importing historical Facebook leads…");
    try {
      const { data: res, error } = await supabase.functions.invoke("facebook-leads-sync", {
        body: {},
      });
      if (error) throw error;
      if (res?.error) throw new Error(res.error);
      toast.success(
        `${res?.leads_inserted ?? 0} leads imported from ${res?.forms_found ?? 0} forms`,
        {
          id: toastId,
          description: `Fetched ${res?.leads_fetched ?? 0} · Skipped ${res?.leads_skipped ?? 0} duplicates`,
        },
      );
      refetch();
      queryClient.invalidateQueries({ queryKey: ["unified-lead-feed"] });
      queryClient.invalidateQueries({ queryKey: ["unified-lead-counts"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["lead-sync-health"] });
    } catch (e: any) {
      toast.error(`Sync failed: ${e.message}`, { id: toastId });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Facebook className="w-5 h-5 text-primary" />
          <CardTitle className="text-base">Facebook Leads</CardTitle>
          <Badge
            variant="secondary"
            className="gap-1 bg-green-500/10 text-green-700 dark:text-green-400"
          >
            <CheckCircle2 className="w-3 h-3" /> Connected
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={runSync} disabled={syncing}>
            <Download className={`w-3.5 h-3.5 mr-1 ${syncing ? "animate-pulse" : ""}`} />
            Sync historical leads
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs uppercase text-muted-foreground">Page</p>
            <p className="font-medium">XBoom</p>
            <p className="text-xs text-muted-foreground">ID {FB_PAGE_ID}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs uppercase text-muted-foreground">Last lead received</p>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : data?.lastAt ? (
              <>
                <p className="font-medium">
                  {formatDistanceToNow(new Date(data.lastAt), { addSuffix: true })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(data.lastAt).toLocaleString()}
                  {data.lastName ? ` · ${data.lastName}` : ""}
                </p>
              </>
            ) : (
              <p className="text-sm text-destructive">Never</p>
            )}
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs uppercase text-muted-foreground">Total leads synced</p>
            <p className="font-medium tabular-nums">{(data?.total ?? 0).toLocaleString()}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Live leads arrive instantly via the Facebook lead-form webhook. Use “Sync historical
          leads” once to backfill older submissions — duplicates are skipped automatically.
        </p>
      </CardContent>
    </Card>
  );
}
