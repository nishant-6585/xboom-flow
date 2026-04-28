import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Briefcase, MapPin, Users as UsersIcon, Pencil, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ReferralFormDialog } from "./ReferralFormDialog";

interface HiringRequirement {
  id: string;
  title: string;
  department: string | null;
  description: string | null;
  open_positions: number;
  location: string | null;
  experience_required: string | null;
  status: string;
  created_at: string;
}

const emptyForm = {
  title: "",
  department: "",
  description: "",
  open_positions: 1,
  location: "",
  experience_required: "",
  status: "open",
};

export function HiringPanel() {
  const { user, role } = useAuth();
  const isHROrAdmin = role === "admin" || role === "hr";
  const [items, setItems] = useState<HiringRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [referralRole, setReferralRole] = useState<HiringRequirement | null>(null);
  const [editing, setEditing] = useState<HiringRequirement | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("hiring_requirements")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems((data as HiringRequirement[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (it: HiringRequirement) => {
    setEditing(it);
    setForm({
      title: it.title,
      department: it.department || "",
      description: it.description || "",
      open_positions: it.open_positions,
      location: it.location || "",
      experience_required: it.experience_required || "",
      status: it.status,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      department: form.department.trim() || null,
      description: form.description.trim() || null,
      open_positions: Number(form.open_positions) || 1,
      location: form.location.trim() || null,
      experience_required: form.experience_required.trim() || null,
      status: form.status,
      created_by: user?.id,
    };
    const { error } = editing
      ? await supabase.from("hiring_requirements").update(payload).eq("id", editing.id)
      : await supabase.from("hiring_requirements").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing ? "Role updated" : "Role posted");
    setDialogOpen(false);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Open Roles</h2>
          <p className="text-sm text-muted-foreground">View open positions and refer candidates</p>
        </div>
        {isHROrAdmin && (
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Post a Role
          </Button>
        )}
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-40 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>No open roles right now.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((it) => {
            const isOpen = it.status === "open" && it.open_positions > 0;
            return (
              <Card key={it.id} className="flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-primary" />
                      {it.title}
                    </CardTitle>
                    <Badge variant={isOpen ? "default" : "secondary"}>
                      {isOpen ? "Open" : it.status === "closed" ? "Closed" : "Paused"}
                    </Badge>
                  </div>
                  {it.department && (
                    <p className="text-xs text-muted-foreground">{it.department}</p>
                  )}
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-3">
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <UsersIcon className="h-3 w-3" /> {it.open_positions} position
                      {it.open_positions === 1 ? "" : "s"}
                    </span>
                    {it.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {it.location}
                      </span>
                    )}
                    {it.experience_required && (
                      <span>Exp: {it.experience_required}</span>
                    )}
                  </div>
                  {it.description && (
                    <p className="text-sm whitespace-pre-wrap line-clamp-4">{it.description}</p>
                  )}
                  <div className="mt-auto flex items-center gap-2 pt-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={!isOpen}
                      onClick={() => setReferralRole(it)}
                    >
                      <UserPlus className="mr-2 h-4 w-4" />
                      {isOpen ? "Refer Candidate" : "Closed"}
                    </Button>
                    {isHROrAdmin && (
                      <Button size="sm" variant="outline" onClick={() => openEdit(it)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Role" : "Post a Role"}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-3">
            <div className="grid gap-2">
              <Label>Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Android Developer"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label>Department</Label>
                <Input
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  placeholder="Engineering"
                />
              </div>
              <div className="grid gap-2">
                <Label>Open Positions</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.open_positions}
                  onChange={(e) =>
                    setForm({ ...form, open_positions: Number(e.target.value) })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label>Location</Label>
                <Input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Bengaluru / Remote"
                />
              </div>
              <div className="grid gap-2">
                <Label>Experience</Label>
                <Input
                  value={form.experience_required}
                  onChange={(e) =>
                    setForm({ ...form, experience_required: e.target.value })
                  }
                  placeholder="3-5 years"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Textarea
                rows={5}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Role responsibilities, must-haves, etc."
              />
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : editing ? "Update" : "Post Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Referral submission */}
      <ReferralFormDialog
        open={!!referralRole}
        onOpenChange={(o) => !o && setReferralRole(null)}
        role={referralRole}
        onSubmitted={() => setReferralRole(null)}
      />
    </div>
  );
}