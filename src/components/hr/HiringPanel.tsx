import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Briefcase, MapPin, Plus, Pencil, X } from "lucide-react";
import { ReferralFormDialog } from "./ReferralFormDialog";
import { z } from "zod";

export interface HiringRequirement {
  id: string;
  title: string;
  department: string | null;
  description: string | null;
  open_positions: number;
  location: string | null;
  experience_required: string | null;
  status: "open" | "closed";
  created_by: string | null;
  created_at: string;
}

const requirementSchema = z.object({
  title: z.string().trim().min(1, "Title required").max(120),
  department: z.string().trim().max(80).optional(),
  description: z.string().trim().max(4000).optional(),
  open_positions: z.coerce.number().int().min(0).max(999),
  location: z.string().trim().max(120).optional(),
  experience_required: z.string().trim().max(80).optional(),
  status: z.enum(["open", "closed"]),
});

type FormState = {
  title: string; department: string; description: string;
  open_positions: number; location: string; experience_required: string;
  status: "open" | "closed";
};
const empty: FormState = { title: "", department: "", description: "", open_positions: 1, location: "", experience_required: "", status: "open" };

export function HiringPanel() {
  const { role } = useAuth();
  const isHROrAdmin = role === "admin" || role === "hr";
  const [items, setItems] = useState<HiringRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<HiringRequirement | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [referFor, setReferFor] = useState<HiringRequirement | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed">("open");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("hiring_requirements")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setItems((data ?? []) as HiringRequirement[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const startCreate = () => { setEditing(null); setForm(empty); setOpenForm(true); };
  const startEdit = (r: HiringRequirement) => {
    setEditing(r);
    setForm({
      title: r.title, department: r.department ?? "", description: r.description ?? "",
      open_positions: r.open_positions, location: r.location ?? "",
      experience_required: r.experience_required ?? "", status: r.status,
    });
    setOpenForm(true);
  };

  const submit = async () => {
    const parsed = requirementSchema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.errors[0].message); return; }
    const payload = {
      title: parsed.data.title,
      department: parsed.data.department || null,
      description: parsed.data.description || null,
      open_positions: parsed.data.open_positions,
      location: parsed.data.location || null,
      experience_required: parsed.data.experience_required || null,
      status: parsed.data.status,
    };
    if (editing) {
      const { error } = await supabase.from("hiring_requirements").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Requirement updated");
    } else {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("hiring_requirements").insert({ ...payload, created_by: u.user?.id });
      if (error) return toast.error(error.message);
      toast.success("Requirement created");
    }
    setOpenForm(false);
    load();
  };

  const close = async (r: HiringRequirement) => {
    const { error } = await supabase.from("hiring_requirements").update({ status: "closed" }).eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Role closed");
    load();
  };

  const filtered = items.filter(i => statusFilter === "all" ? true : i.status === statusFilter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Open Positions</h2>
          <p className="text-sm text-muted-foreground">View open roles and refer candidates</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          {isHROrAdmin && (
            <Button onClick={startCreate}><Plus className="h-4 w-4 mr-1" />New Requirement</Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[1,2,3].map(i => <div key={i} className="h-40 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">No hiring requirements found.</CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map(r => (
            <Card key={r.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{r.title}</span>
                  </CardTitle>
                  <Badge variant={r.status === "open" ? "default" : "secondary"}>
                    {r.status === "open" ? "Open" : "Closed"}
                  </Badge>
                </div>
                {r.department && <div className="text-xs text-muted-foreground">{r.department}</div>}
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-3">
                {r.description && <p className="text-sm line-clamp-3 text-muted-foreground">{r.description}</p>}
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>Positions: <b className="text-foreground">{r.open_positions}</b></span>
                  {r.experience_required && <span>Exp: <b className="text-foreground">{r.experience_required}</b></span>}
                  {r.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{r.location}</span>}
                </div>
                <div className="mt-auto flex flex-wrap gap-2 pt-2">
                  <Button size="sm" disabled={r.status !== "open"} onClick={() => setReferFor(r)}>
                    Refer Candidate
                  </Button>
                  {isHROrAdmin && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => startEdit(r)}>
                        <Pencil className="h-3 w-3 mr-1" />Edit
                      </Button>
                      {r.status === "open" && (
                        <Button size="sm" variant="outline" onClick={() => close(r)}>
                          <X className="h-3 w-3 mr-1" />Close
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={openForm} onOpenChange={setOpenForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Requirement" : "New Hiring Requirement"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Android Developer" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Department</Label>
                <Input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} />
              </div>
              <div>
                <Label>Open Positions</Label>
                <Input type="number" min={0} value={form.open_positions}
                  onChange={e => setForm({ ...form, open_positions: parseInt(e.target.value || "0") })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Location</Label>
                <Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
              </div>
              <div>
                <Label>Experience</Label>
                <Input value={form.experience_required} onChange={e => setForm({ ...form, experience_required: e.target.value })} placeholder="e.g. 2-4 yrs" />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea rows={4} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v: "open" | "closed") => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenForm(false)}>Cancel</Button>
            <Button onClick={submit}>{editing ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Referral dialog */}
      <ReferralFormDialog
        role={referFor}
        open={!!referFor}
        onOpenChange={(o) => !o && setReferFor(null)}
      />
    </div>
  );
}