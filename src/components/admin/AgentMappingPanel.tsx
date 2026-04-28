import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useProfileNames } from "@/hooks/useProfileNames";
import { Loader2, Plus, Pencil, Trash2, Search, AlertTriangle } from "lucide-react";

type Mapping = {
  id: string;
  provider: string;
  agent_id: string | null;
  agent_phone: string | null;
  user_id: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type Mismatch = {
  lead_id: string;
  source: string;
  current_user_id: string;
  expected_user_id: string;
  agent_id: string | null;
  agent_phone: string | null;
};

const PROVIDERS = ["myoperator", "exotel", "manual"];

export default function AgentMappingPanel() {
  const { toast } = useToast();
  const { profilesMap, resolveName } = useProfileNames();
  const [loading, setLoading] = useState(true);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [mismatches, setMismatches] = useState<Mismatch[]>([]);
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<Mapping> | null>(null);
  const [saving, setSaving] = useState(false);

  const profileOptions = useMemo(
    () => Array.from(profilesMap.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    [profilesMap]
  );

  const load = async () => {
    setLoading(true);
    const [{ data: maps }, { data: mm }] = await Promise.all([
      supabase.from("agent_user_mapping" as any).select("*").order("provider").order("agent_id"),
      supabase.from("lead_assignment_mismatches" as any).select("*").limit(500),
    ]);
    setMappings((maps as any) ?? []);
    setMismatches((mm as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = mappings.filter((m) => {
    if (providerFilter !== "all" && m.provider !== providerFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        (m.agent_id ?? "").toLowerCase().includes(s) ||
        (m.agent_phone ?? "").toLowerCase().includes(s) ||
        resolveName(m.user_id).toLowerCase().includes(s)
      );
    }
    return true;
  });

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.provider || !editing.user_id) {
      toast({ title: "Provider and user are required", variant: "destructive" });
      return;
    }
    if (!editing.agent_id && !editing.agent_phone) {
      toast({ title: "Provide agent_id or agent_phone", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      provider: editing.provider,
      agent_id: editing.agent_id || null,
      agent_phone: editing.agent_phone || null,
      user_id: editing.user_id,
      notes: editing.notes || null,
      is_active: editing.is_active ?? true,
    };
    let error;
    if (editing.id) {
      ({ error } = await supabase.from("agent_user_mapping" as any).update(payload).eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("agent_user_mapping" as any).insert(payload));
    }
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing.id ? "Mapping updated" : "Mapping created" });
    setEditing(null);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this mapping?")) return;
    const { error } = await supabase.from("agent_user_mapping" as any).delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    load();
  };

  const toggleActive = async (m: Mapping) => {
    const { error } = await supabase.from("agent_user_mapping" as any).update({ is_active: !m.is_active }).eq("id", m.id);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    else load();
  };

  return (
    <div className="space-y-6">
      <Card className="glass">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Agent → User Mapping</CardTitle>
            <CardDescription>
              Single source of truth for translating phone-system agents into internal users. Used by webhooks (MyOperator, Exotel).
            </CardDescription>
          </div>
          <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditing({ provider: "myoperator", is_active: true })}>
                <Plus className="w-4 h-4 mr-2" /> Add Mapping
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing?.id ? "Edit" : "Add"} Mapping</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Provider</Label>
                  <Select value={editing?.provider} onValueChange={(v) => setEditing((e) => ({ ...e!, provider: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROVIDERS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Agent ID (from provider, e.g. MyOperator _id)</Label>
                  <Input value={editing?.agent_id ?? ""} onChange={(e) => setEditing((s) => ({ ...s!, agent_id: e.target.value }))} placeholder="optional" />
                </div>
                <div>
                  <Label>Agent Phone</Label>
                  <Input value={editing?.agent_phone ?? ""} onChange={(e) => setEditing((s) => ({ ...s!, agent_phone: e.target.value }))} placeholder="e.g. 9148322812 or +919148322812" />
                </div>
                <div>
                  <Label>User</Label>
                  <Select value={editing?.user_id} onValueChange={(v) => setEditing((s) => ({ ...s!, user_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {profileOptions.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Input value={editing?.notes ?? ""} onChange={(e) => setEditing((s) => ({ ...s!, notes: e.target.value }))} />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={editing?.is_active ?? true} onCheckedChange={(v) => setEditing((s) => ({ ...s!, is_active: v }))} />
                  <Label>Active</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All providers</SelectItem>
                {PROVIDERS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search agent_id, phone, or user…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No mappings yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Agent ID</TableHead>
                  <TableHead>Agent Phone</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell><Badge variant="outline">{m.provider}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{m.agent_id || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{m.agent_phone || "—"}</TableCell>
                    <TableCell>{resolveName(m.user_id)}</TableCell>
                    <TableCell><Switch checked={m.is_active} onCheckedChange={() => toggleActive(m)} /></TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(m)}><Pencil className="w-4 h-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(m.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning" />
            Assignment Mismatches
            <Badge variant="secondary">{mismatches.length}</Badge>
          </CardTitle>
          <CardDescription>
            Leads whose current salesperson does not match the mapping. Review and reassign manually — nothing is overwritten automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mismatches.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No mismatches detected.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Lead ID</TableHead>
                  <TableHead>Current</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead>Agent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mismatches.slice(0, 200).map((m) => (
                  <TableRow key={`${m.source}-${m.lead_id}`}>
                    <TableCell><Badge variant="outline">{m.source}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{m.lead_id.slice(0, 8)}…</TableCell>
                    <TableCell>{resolveName(m.current_user_id)}</TableCell>
                    <TableCell className="font-medium">{resolveName(m.expected_user_id)}</TableCell>
                    <TableCell className="font-mono text-xs">{m.agent_id || m.agent_phone || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
