import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface RoleLite {
  id: string;
  title: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  role: RoleLite | null;
  onSubmitted?: () => void;
}

const empty = { name: "", email: "", phone: "", notes: "" };

export function ReferralFormDialog({ open, onOpenChange, role, onSubmitted }: Props) {
  const { user } = useAuth();
  const [form, setForm] = useState(empty);
  const [resume, setResume] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setForm(empty);
    setResume(null);
  };

  const submit = async () => {
    if (!role || !user) return;
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
      toast.error("Name, email and phone are required");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(form.email)) {
      toast.error("Invalid email format");
      return;
    }
    if (!resume) {
      toast.error("Resume is required");
      return;
    }

    setSubmitting(true);
    try {
      // Duplicate check: same role + exact email (case-insensitive) within 24h
      const normalizedEmail = form.email.trim().toLowerCase();
      const { data: dup, error: dupErr } = await supabase
        .from("referrals")
        .select("id, created_at, candidate_email")
        .eq("role_id", role.id)
        .ilike("candidate_email", normalizedEmail) // ilike with no wildcards = case-insensitive equality
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(1);
      if (dupErr) throw dupErr;
      // Defensive guard: ensure exact match (lower-cased), not a pattern collision
      if (
        dup &&
        dup.some((d) => (d.candidate_email || "").trim().toLowerCase() === normalizedEmail)
      ) {
        toast.error("This candidate was already referred for this role in the last 24h");
        setSubmitting(false);
        return;
      }

      // Upload resume to hr-documents bucket under referrals/
      const ext = resume.name.split(".").pop() || "pdf";
      const path = `referrals/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("hr-documents")
        .upload(path, resume, { upsert: false });
      if (upErr) throw upErr;
      const { error } = await supabase.from("referrals").insert({
        role_id: role.id,
        candidate_name: form.name.trim(),
        candidate_email: form.email.trim(),
        candidate_phone: form.phone.trim(),
        notes: form.notes.trim() || null,
        resume_url: path,
        referred_by: user.id,
        status: "submitted",
      });
      if (error) throw error;

      toast.success("Referral submitted");
      reset();
      onSubmitted?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to submit referral");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Refer a Candidate</DialogTitle>
          {role && <DialogDescription>For role: {role.title}</DialogDescription>}
        </DialogHeader>
        <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-3">
          <div className="grid gap-2">
            <Label>Candidate Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Phone *</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Resume *</Label>
            <Input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={(e) => setResume(e.target.files?.[0] || null)}
            />
            {resume && (
              <p className="text-xs text-muted-foreground">{resume.name}</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label>Notes</Label>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Why is this person a good fit?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Submitting..." : "Submit Referral"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}