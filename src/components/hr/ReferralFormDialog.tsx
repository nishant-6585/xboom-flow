import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import type { HiringRequirement } from "./HiringPanel";

const referralSchema = z.object({
  candidate_name: z.string().trim().min(2, "Name required").max(120),
  candidate_email: z.string().trim().email("Invalid email").max(255),
  candidate_phone: z.string().trim().min(7, "Phone required").max(25),
});

const MAX_RESUME = 10 * 1024 * 1024; // 10MB

export function ReferralFormDialog({
  role,
  open,
  onOpenChange,
  onSubmitted,
}: {
  role: HiringRequirement | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmitted?: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => { setName(""); setEmail(""); setPhone(""); setFile(null); };

  const handleSubmit = async () => {
    if (!role) return;
    const parsed = referralSchema.safeParse({ candidate_name: name, candidate_email: email, candidate_phone: phone });
    if (!parsed.success) { toast.error(parsed.error.errors[0].message); return; }
    if (!file) { toast.error("Resume is required"); return; }
    if (file.type !== "application/pdf") { toast.error("Resume must be a PDF"); return; }
    if (file.size > MAX_RESUME) { toast.error("Resume must be under 10MB"); return; }

    setSubmitting(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) { toast.error("Not authenticated"); setSubmitting(false); return; }

      const safeName = parsed.data.candidate_name.replace(/[^a-z0-9]+/gi, "_").toLowerCase().slice(0, 40);
      const path = `${uid}/${safeName}_${Date.now()}.pdf`;
      const up = await supabase.storage.from("referral-resumes").upload(path, file, {
        contentType: "application/pdf",
        upsert: false,
      });
      if (up.error) { toast.error(up.error.message); setSubmitting(false); return; }

      const { error } = await supabase.from("referrals").insert({
        candidate_name: parsed.data.candidate_name,
        candidate_email: parsed.data.candidate_email,
        candidate_phone: parsed.data.candidate_phone,
        resume_url: path,
        role_id: role.id,
        referred_by: uid,
      });
      if (error) {
        // best effort cleanup
        await supabase.storage.from("referral-resumes").remove([path]);
        toast.error(error.message.includes("Duplicate referral")
          ? "This candidate was already referred for this role within 24 hours"
          : error.message);
        setSubmitting(false);
        return;
      }
      toast.success("Referral submitted successfully");
      reset();
      onSubmitted?.();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Refer Candidate {role ? `— ${role.title}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Candidate Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} maxLength={120} />
          </div>
          <div>
            <Label>Email *</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={255} />
          </div>
          <div>
            <Label>Phone *</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} maxLength={25} />
          </div>
          <div>
            <Label>Role</Label>
            <Input value={role?.title ?? ""} disabled />
          </div>
          <div>
            <Label>Resume (PDF, max 10MB) *</Label>
            <div className="flex items-center gap-2">
              <Input type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} />
              {file && <Upload className="h-4 w-4 text-muted-foreground" />}
            </div>
            {file && <p className="text-xs text-muted-foreground mt-1">{file.name}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Submitting..." : "Submit Referral"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}