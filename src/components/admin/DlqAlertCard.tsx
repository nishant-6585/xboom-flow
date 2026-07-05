import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Loader2 } from "lucide-react";

interface DlqRow {
  template_name: string | null;
  error_message: string | null;
}

interface BreakdownRow {
  key: string;
  count: number;
  sampleReason?: string;
}

function summarizeReason(reason: string | null): string {
  if (!reason) return "unknown";
  const r = reason.toLowerCase();
  // First-class buckets — keep in sync with process-email-queue/index.ts
  // notifyDlqBatch normalization so the alert email and this card agree.
  if (r.includes("max retries")) return "Max retries exceeded";
  if (r.includes("ttl exceeded")) return "TTL exceeded";
  if (r.includes("missing_unsubscribe")) return "missing_unsubscribe (400)";
  if (r.includes("suppressed") || r.includes("unsubscribed") || r.includes("suppression"))
    return "Recipient suppressed / unsubscribed";
  if (r.includes("invalid_recipient") || r.includes("invalid email") || r.includes("bounce"))
    return "Invalid recipient / bounce";
  if (r.includes("rate_limited") || r.includes("429")) return "Rate limited (429)";
  if (r.includes("403")) return "Forbidden (403)";
  return reason.split("\n")[0].slice(0, 80);
}

export function DlqAlertCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "email-dlq", "7d"],
    refetchInterval: 60_000,
    queryFn: async (): Promise<DlqRow[]> => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("email_send_log")
        .select("template_name, error_message")
        .eq("status", "dlq")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as DlqRow[];
    },
  });

  const rows = data ?? [];
  const total = rows.length;

  const byTemplate: BreakdownRow[] = (() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = r.template_name || "unknown";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count);
  })();

  const byReason: BreakdownRow[] = (() => {
    const m = new Map<string, { count: number; sample: string }>();
    for (const r of rows) {
      const k = summarizeReason(r.error_message);
      const cur = m.get(k);
      if (cur) {
        cur.count += 1;
      } else {
        m.set(k, { count: 1, sample: r.error_message?.slice(0, 200) || "" });
      }
    }
    return Array.from(m.entries())
      .map(([key, v]) => ({ key, count: v.count, sampleReason: v.sample }))
      .sort((a, b) => b.count - a.count);
  })();

  return (
    <Card className={total > 0 ? "border-red-200 bg-red-50/50" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className={total > 0 ? "h-4 w-4 text-red-600" : "h-4 w-4 text-muted-foreground"} />
          Email dispatcher — DLQ (last 7 days)
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin ml-1" />
          ) : (
            <Badge variant={total > 0 ? "destructive" : "secondary"} className="ml-1">
              {total}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">
            No dead-lettered emails in the last 7 days. 🎉
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                By template
              </h4>
              <ul className="space-y-1 text-sm">
                {byTemplate.map((row) => (
                  <li key={row.key} className="flex justify-between border-b border-red-100 py-1">
                    <span className="truncate mr-2">{row.key}</span>
                    <span className="font-semibold tabular-nums">{row.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                By reason
              </h4>
              <ul className="space-y-1 text-sm">
                {byReason.map((row) => (
                  <li
                    key={row.key}
                    className="flex justify-between border-b border-red-100 py-1"
                    title={row.sampleReason}
                  >
                    <span className="truncate mr-2">{row.key}</span>
                    <span className="font-semibold tabular-nums">{row.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}