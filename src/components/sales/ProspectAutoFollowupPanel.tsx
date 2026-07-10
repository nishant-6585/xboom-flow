import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Loader2, Play, Pause, RefreshCw, Send } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Settings {
  enabled: boolean;
  shadow_mode: boolean;
  max_attempts: number;
  cc_emails: string[];
  send_window_start: string;
  send_window_end: string;
  weekdays_only: boolean;
  ai_model: string;
}

export function ProspectAutoFollowupPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [ccInput, setCcInput] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: s }, { data: f }] = await Promise.all([
      supabase.from("prospect_followup_settings").select("*").eq("id", true).maybeSingle(),
      supabase
        .from("prospect_followups")
        .select("id, prospect_id, attempt_no, subject, status, sent_at, created_at, recipient_email, skip_reason, ai_meta, prospects(customer_name, company, product_name)")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (s) {
      setSettings(s as any);
      setCcInput((s.cc_emails || []).join(", "));
    }
    setRows(f || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async (patch: Partial<Settings>) => {
    if (!settings) return;
    setSaving(true);
    const next = { ...settings, ...patch };
    const { error } = await supabase.from("prospect_followup_settings").update(patch).eq("id", true);
    setSaving(false);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    setSettings(next);
    toast({ title: "Settings updated" });
  };

  const saveCc = () => {
    const list = ccInput.split(",").map(x => x.trim()).filter(Boolean);
    save({ cc_emails: list });
  };

  const runNow = async () => {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("prospects-auto-followup", { body: { force: true } });
    setRunning(false);
    if (error) toast({ title: "Run failed", description: error.message, variant: "destructive" });
    else toast({ title: "Worker ran", description: `Processed ${(data as any)?.processed ?? 0}, sent ${(data as any)?.sent ?? 0}` });
    load();
  };

  if (loading || !settings) return <div className="flex items-center gap-2 p-6"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Prospect Auto Follow-up</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
              <Button size="sm" onClick={runNow} disabled={running}>{running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}<span className="ml-2">Run now</span></Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <Label className="font-semibold">Enabled</Label>
                <p className="text-xs text-muted-foreground">Master switch. Off = worker no-ops.</p>
              </div>
              <Switch checked={settings.enabled} onCheckedChange={(v) => save({ enabled: v })} disabled={saving} />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <Label className="font-semibold">Shadow mode</Label>
                <p className="text-xs text-muted-foreground">Draft & log, do NOT send. Flip off to go live.</p>
              </div>
              <Switch checked={settings.shadow_mode} onCheckedChange={(v) => save({ shadow_mode: v })} disabled={saving} />
            </div>
            <div className="p-3 rounded-lg border space-y-2">
              <Label>Max attempts</Label>
              <Input type="number" min={1} max={8} value={settings.max_attempts}
                onChange={(e) => setSettings({ ...settings, max_attempts: Number(e.target.value) })}
                onBlur={(e) => save({ max_attempts: Number(e.target.value) })} />
            </div>
            <div className="p-3 rounded-lg border space-y-2">
              <Label>CC emails (comma-separated)</Label>
              <div className="flex gap-2">
                <Input value={ccInput} onChange={(e) => setCcInput(e.target.value)} placeholder="amit@xboom.in" />
                <Button size="sm" onClick={saveCc} disabled={saving}>Save</Button>
              </div>
            </div>
            <div className="p-3 rounded-lg border space-y-2">
              <Label>Send window (IST)</Label>
              <div className="flex items-center gap-2">
                <Input type="time" value={settings.send_window_start} onChange={(e) => setSettings({ ...settings, send_window_start: e.target.value })} onBlur={(e) => save({ send_window_start: e.target.value })} />
                <span>—</span>
                <Input type="time" value={settings.send_window_end} onChange={(e) => setSettings({ ...settings, send_window_end: e.target.value })} onBlur={(e) => save({ send_window_end: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <Label className="font-semibold">Weekdays only</Label>
                <p className="text-xs text-muted-foreground">Skip Sat/Sun.</p>
              </div>
              <Switch checked={settings.weekdays_only} onCheckedChange={(v) => save({ weekdays_only: v })} disabled={saving} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent activity (last 50)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Prospect</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Attempt</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No follow-ups yet.</TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell>{r.prospects?.customer_name || "—"}<div className="text-xs text-muted-foreground">{r.recipient_email}</div></TableCell>
                  <TableCell className="text-xs">{r.prospects?.product_name || "—"}</TableCell>
                  <TableCell>#{r.attempt_no}</TableCell>
                  <TableCell className="max-w-[280px] truncate" title={r.subject}>{r.subject}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "sent" ? "default" : r.status === "shadow" ? "secondary" : r.status === "failed" ? "destructive" : "outline"}>
                      {r.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}