import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MessageCircle, RefreshCw, Copy, ExternalLink, Send, Trash2, Upload } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  useManychatLeads,
  useManychatSyncLog,
  useManychatSync,
  useManychatTestWebhook,
  useRemoveManychatTestLeads,
  useManychatCsvImport,
  type ManychatTestResult,
  type ManychatImportSummary,
} from "@/hooks/useManychatLeads";
import {
  parseCsv,
  mapCsvRows,
  FIELD_LABELS,
  type FieldKey,
  type ManychatCsvRow,
} from "@/lib/manychatCsv";

const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manychat-webhook`;

export function ManychatSettingsPanel() {
  const { data: leads } = useManychatLeads();
  const { data: log } = useManychatSyncLog();
  const sync = useManychatSync();
  const testWebhook = useManychatTestWebhook();
  const removeTests = useRemoveManychatTestLeads();
  const csvImport = useManychatCsvImport();

  const [testResult, setTestResult] = useState<ManychatTestResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<{
    headers: string[];
    mapping: Partial<Record<FieldKey, number>>;
    rows: ManychatCsvRow[];
    usable: ManychatCsvRow[];
    unusable: number;
  } | null>(null);
  const [summary, setSummary] = useState<ManychatImportSummary | null>(null);

  const copy = async () => {
    await navigator.clipboard.writeText(WEBHOOK_URL);
    toast.success("Webhook URL copied");
  };

  const runTest = async () => {
    setTestResult(null);
    try {
      const res = await testWebhook.mutateAsync();
      setTestResult(res);
    } catch {
      /* toast handled in hook */
    }
  };

  const onFile = async (file: File) => {
    setSummary(null);
    setFileName(file.name);
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) {
        setParsed(null);
        toast.error("CSV has no data rows");
        return;
      }
      const [headers, ...dataRows] = rows;
      const mapped = mapCsvRows(headers, dataRows);
      setParsed({ headers, ...mapped });
      if (!mapped.usable.length) {
        toast.error("No rows have a manychat_contact_id or phone_number — nothing can be imported");
      }
    } catch (e) {
      setParsed(null);
      toast.error(`Could not read CSV: ${(e as Error).message}`);
    }
  };

  const runImport = async () => {
    if (!parsed?.usable.length) return;
    setSummary(null);
    try {
      const res = await csvImport.mutateAsync(parsed.usable as unknown as Record<string, unknown>[]);
      setSummary(res);
    } catch {
      /* toast handled in hook */
    }
  };

  const last = log?.[0];
  const previewRows = parsed?.rows.slice(0, 5) ?? [];
  const mappedKeys = parsed
    ? (Object.keys(FIELD_LABELS) as FieldKey[]).filter((k) => parsed.mapping[k] !== undefined)
    : [];
  const unmappedKeys = parsed
    ? (Object.keys(FIELD_LABELS) as FieldKey[]).filter((k) => parsed.mapping[k] === undefined)
    : [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-primary" />
          <CardTitle className="text-base">ManyChat Leads</CardTitle>
          <Badge variant="secondary">{leads?.length ?? 0} leads</Badge>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" asChild>
            <a href="https://app.manychat.com/fb1337316/chat" target="_blank" rel="noreferrer">
              <ExternalLink className="w-3.5 h-3.5 mr-1" /> Open ManyChat
            </a>
          </Button>
          <Button size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${sync.isPending ? "animate-spin" : ""}`} />
            Sync now
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-medium mb-1">Webhook URL (paste into ManyChat → External Request)</p>
          <div className="flex gap-2">
            <Input readOnly value={WEBHOOK_URL} className="font-mono text-xs" />
            <Button size="sm" variant="outline" onClick={copy}>
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Method <strong>POST</strong>, header <code>X-ManyChat-Secret</code> = your ManyChat webhook secret.
            Send fields like <code>name</code>, <code>phone</code>, <code>email</code>, <code>city</code>,
            <code>product_name</code>, <code>message</code>. New leads are auto-assigned to the sales team in
            round-robin order, and the hourly auto-sync refreshes contact details from the ManyChat API.
          </p>
        </div>

        <div className="border-t pt-4">
          <p className="text-sm font-medium mb-2">Verify webhook &amp; secret</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={runTest} disabled={testWebhook.isPending}>
              <Send className={`w-3.5 h-3.5 mr-1 ${testWebhook.isPending ? "animate-pulse" : ""}`} />
              Send test webhook
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => removeTests.mutate()}
              disabled={removeTests.isPending}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove test leads
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Posts a sample payload (name, phone, email, city, product_name, message) to the webhook using the stored
            secret. Test records are saved with source <code>ManyChat (test)</code> so they can be cleaned up.
          </p>
          {testResult ? (
            <div className="mt-2 rounded-md border bg-muted/30 p-3 text-xs space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant={testResult.ok ? "secondary" : "destructive"}>HTTP {testResult.status}</Badge>
                <span className={testResult.ok ? "text-muted-foreground" : "text-destructive"}>
                  {testResult.ok ? "Webhook and secret are working" : "Webhook rejected the request"}
                </span>
              </div>
              <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-muted-foreground">
                {testResult.response || "(empty body)"}
              </pre>
            </div>
          ) : null}
        </div>

        <div className="border-t pt-4">
          <p className="text-sm font-medium mb-2">Backfill historical subscribers (CSV)</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = "";
              }}
            />
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="w-3.5 h-3.5 mr-1" /> Choose ManyChat CSV
            </Button>
            {fileName ? <span className="text-xs text-muted-foreground">{fileName}</span> : null}
            {parsed ? (
              <Button size="sm" onClick={runImport} disabled={csvImport.isPending || !parsed.usable.length}>
                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${csvImport.isPending ? "animate-spin" : ""}`} />
                Import {parsed.usable.length} row(s)
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Rows are matched on <code>manychat_contact_id</code> first, then <code>phone_number</code> — the same rules
            as the live webhook. Rows with neither are skipped, unmapped columns are stored in{" "}
            <code>custom_fields</code>, and new leads still go through round-robin assignment.
          </p>

          {parsed ? (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {mappedKeys.map((k) => (
                  <Badge key={k} variant="secondary" className="font-mono text-[10px]">
                    {FIELD_LABELS[k]} ← {parsed.headers[parsed.mapping[k]!]}
                  </Badge>
                ))}
                {unmappedKeys.map((k) => (
                  <Badge key={k} variant="outline" className="font-mono text-[10px] text-muted-foreground">
                    {FIELD_LABELS[k]} — not found
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {parsed.rows.length} row(s) parsed · {parsed.usable.length} importable · {parsed.unusable} without an
                id/phone
              </p>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-[10px] uppercase text-muted-foreground">
                      <th className="text-left py-1.5 px-2">Contact ID</th>
                      <th className="text-left py-1.5 px-2">Name</th>
                      <th className="text-left py-1.5 px-2">Phone</th>
                      <th className="text-left py-1.5 px-2">Email</th>
                      <th className="text-left py-1.5 px-2">City</th>
                      <th className="text-left py-1.5 px-2">Tags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-1.5 px-2 font-mono">{r.manychat_contact_id || "—"}</td>
                        <td className="py-1.5 px-2">{r.customer_name || "—"}</td>
                        <td className="py-1.5 px-2">{r.phone_number || "—"}</td>
                        <td className="py-1.5 px-2">{r.email || "—"}</td>
                        <td className="py-1.5 px-2">{r.city || "—"}</td>
                        <td className="py-1.5 px-2">{r.tags.join(", ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {summary ? (
            <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
              <Badge variant="secondary">Received {summary.received}</Badge>
              <Badge variant="secondary">Created {summary.created}</Badge>
              <Badge variant="secondary">Updated {summary.updated}</Badge>
              <Badge variant="outline">Skipped {summary.skipped}</Badge>
              <Badge variant={summary.errored ? "destructive" : "outline"}>Errored {summary.errored}</Badge>
              {summary.errors?.length ? (
                <span className="text-destructive w-full">{summary.errors[0]}</span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div>
          <p className="text-sm font-medium mb-2">Recent sync activity</p>
          {!log || log.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sync activity yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-muted-foreground">
                    <th className="text-left py-2 px-2">When</th>
                    <th className="text-left py-2 px-2">Source</th>
                    <th className="text-right py-2 px-2">Received</th>
                    <th className="text-right py-2 px-2">New</th>
                    <th className="text-right py-2 px-2">Updated</th>
                    <th className="text-left py-2 px-2">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((r) => (
                    <tr key={r.id} className="border-b hover:bg-muted/30">
                      <td className="py-2 px-2 text-muted-foreground">
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                      </td>
                      <td className="py-2 px-2 capitalize">{r.trigger_source}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{r.received}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{r.created}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{r.updated}</td>
                      <td className="py-2 px-2 text-xs text-destructive truncate max-w-[240px]">{r.error || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {last?.error ? (
            <p className="text-xs text-destructive mt-2">Last run reported an error — check the secret and API key.</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
