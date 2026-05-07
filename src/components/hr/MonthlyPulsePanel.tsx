import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, Trash2, Eye, Newspaper } from "lucide-react";
import {
  useMonthlyPulses,
  useUploadPulse,
  useTogglePulseActive,
  useDeletePulse,
  getPulseSignedUrl,
} from "@/hooks/useMonthlyPulses";
import { validateFile } from "@/lib/fileValidation";
import { format } from "date-fns";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function buildMonthOptions() {
  const opts: string[] = [];
  const now = new Date();
  for (let i = -3; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    opts.push(`${MONTHS[d.getMonth()]} ${d.getFullYear()}`);
  }
  return opts;
}

export function MonthlyPulsePanel() {
  const { data: pulses = [], isLoading } = useMonthlyPulses();
  const upload = useUploadPulse();
  const toggle = useTogglePulseActive();
  const del = useDeletePulse();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [month, setMonth] = useState(buildMonthOptions()[3]);
  const [file, setFile] = useState<File | null>(null);

  const monthOptions = buildMonthOptions();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast({ title: "File required", description: "Please choose a PDF or image.", variant: "destructive" });
      return;
    }
    const v = validateFile(file, "documents");
    if (!v.valid) {
      toast({ title: "Invalid file", description: v.error, variant: "destructive" });
      return;
    }
    if (!title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    try {
      await upload.mutateAsync({ file, title: title.trim(), description: description.trim() || undefined, month });
      toast({ title: "Newsletter uploaded", description: `${title} (${month})` });
      setTitle(""); setDescription(""); setFile(null);
      const input = document.getElementById("pulse-file") as HTMLInputElement | null;
      if (input) input.value = "";
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message ?? String(err), variant: "destructive" });
    }
  };

  const openFile = async (path: string) => {
    const url = await getPulseSignedUrl(path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else toast({ title: "Unable to open file", variant: "destructive" });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Newspaper className="h-5 w-5" /> Upload Monthly Pulse
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pulse-title">Title *</Label>
              <Input id="pulse-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pulse-month">Month *</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger id="pulse-month"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {monthOptions.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="pulse-desc">Description</Label>
              <Textarea id="pulse-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={1000} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="pulse-file">File (PDF or image, max 20MB) *</Label>
              <Input
                id="pulse-file"
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={upload.isPending}>
                {upload.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                Upload
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Past Newsletters</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : pulses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No newsletters uploaded yet.</p>
          ) : (
            <div className="space-y-2">
              {pulses.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{p.title}</span>
                      <Badge variant="outline">{p.month}</Badge>
                      {!p.is_active && <Badge variant="secondary">Inactive</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Uploaded {format(new Date(p.created_at), "PPp")}
                    </div>
                    {p.description && <div className="text-sm mt-1 line-clamp-2">{p.description}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 text-xs">
                      <Switch
                        checked={p.is_active}
                        onCheckedChange={(v) => toggle.mutate({ id: p.id, is_active: v })}
                      />
                      <span>Active</span>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => openFile(p.file_url)}>
                      <Eye className="h-4 w-4 mr-1" /> View
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => {
                      if (confirm("Delete this newsletter?")) del.mutate(p);
                    }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}