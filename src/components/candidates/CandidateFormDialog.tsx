import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Upload } from "lucide-react";
import { Candidate, CandidateStatus, useCandidateMutations } from "@/hooks/useCandidates";
import { toast } from "sonner";

const schema = z.object({
  full_name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email").max(255),
  phone: z.string().max(20).optional().or(z.literal("")),
  years_of_experience: z.coerce.number().min(0).max(60).optional(),
  current_company: z.string().max(100).optional().or(z.literal("")),
  current_ctc: z.coerce.number().min(0).optional(),
  expected_ctc: z.coerce.number().min(0).optional(),
  notice_period_days: z.coerce.number().int().min(0).max(365).optional(),
  location: z.string().max(100).optional().or(z.literal("")),
  source: z.string().max(100).optional().or(z.literal("")),
  status: z.enum(["applied", "shortlisted", "rejected", "hired", "blacklisted"]),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  candidate?: Candidate;
}

const SOURCES = ["LinkedIn", "Naukri", "Indeed", "Referral", "Walk-in", "Company Website", "Other"];
const STATUSES: CandidateStatus[] = ["applied", "shortlisted", "rejected", "hired", "blacklisted"];

export function CandidateFormDialog({ open, onClose, candidate }: Props) {
  const { createCandidate, updateCandidate, uploadCV } = useCandidateMutations();
  const [skills, setSkills] = useState<string[]>(candidate?.primary_skills || []);
  const [skillInput, setSkillInput] = useState("");
  const [cvFile, setCvFile] = useState<File | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: candidate?.full_name || "",
      email: candidate?.email || "",
      phone: candidate?.phone || "",
      years_of_experience: candidate?.years_of_experience ?? undefined,
      current_company: candidate?.current_company || "",
      current_ctc: candidate?.current_ctc ?? undefined,
      expected_ctc: candidate?.expected_ctc ?? undefined,
      notice_period_days: candidate?.notice_period_days ?? undefined,
      location: candidate?.location || "",
      source: candidate?.source || "",
      status: candidate?.status || "applied",
      notes: candidate?.notes || "",
    },
  });

  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !skills.includes(s)) {
      setSkills([...skills, s]);
    }
    setSkillInput("");
  };

  const removeSkill = (s: string) => setSkills(skills.filter((x) => x !== s));

  const onSubmit = async (values: FormData) => {
    const payload = {
      ...values,
      primary_skills: skills,
      phone: values.phone || undefined,
      current_company: values.current_company || undefined,
      location: values.location || undefined,
      source: values.source || undefined,
      notes: values.notes || undefined,
    };

    if (candidate) {
      await updateCandidate.mutateAsync({ id: candidate.id, ...payload });
      onClose();
    } else {
      const result = await createCandidate.mutateAsync(payload as any);
      if (cvFile && result?.id) {
        await uploadCV.mutateAsync({ candidateId: result.id, file: cvFile });
      }
      onClose();
    }
  };

  const handleCvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File must be under 5MB");
      return;
    }
    const allowed = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (!allowed.includes(file.type)) {
      toast.error("Only PDF or Word documents allowed");
      return;
    }
    setCvFile(file);
  };

  const isLoading = createCandidate.isPending || updateCandidate.isPending || uploadCV.isPending;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{candidate ? "Edit Candidate" : "Add New Candidate"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="full_name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name *</FormLabel>
                  <FormControl><Input placeholder="John Doe" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email *</FormLabel>
                  <FormControl><Input type="email" placeholder="john@example.com" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl><Input placeholder="+91 98765 43210" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="years_of_experience" render={({ field }) => (
                <FormItem>
                  <FormLabel>Years of Experience</FormLabel>
                  <FormControl><Input type="number" step="0.5" min="0" placeholder="3" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="current_company" render={({ field }) => (
                <FormItem>
                  <FormLabel>Current Company</FormLabel>
                  <FormControl><Input placeholder="Acme Corp" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="location" render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl><Input placeholder="Mumbai, India" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="current_ctc" render={({ field }) => (
                <FormItem>
                  <FormLabel>Current CTC (₹ LPA)</FormLabel>
                  <FormControl><Input type="number" step="0.1" min="0" placeholder="8" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="expected_ctc" render={({ field }) => (
                <FormItem>
                  <FormLabel>Expected CTC (₹ LPA)</FormLabel>
                  <FormControl><Input type="number" step="0.1" min="0" placeholder="12" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="notice_period_days" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notice Period (Days)</FormLabel>
                  <FormControl><Input type="number" min="0" placeholder="30" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="source" render={({ field }) => (
                <FormItem>
                  <FormLabel>Source</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Status *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Skills */}
            <div className="space-y-2">
              <FormLabel>Primary Skills</FormLabel>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. React, Python, Sales..."
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }}
                  className="flex-1"
                />
                <Button type="button" variant="outline" size="icon" onClick={addSkill}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {skills.map((s) => (
                    <Badge key={s} variant="secondary" className="gap-1">
                      {s}
                      <button type="button" onClick={() => removeSkill(s)}>
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl>
                  <Textarea placeholder="Any additional notes about this candidate..." rows={3} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* CV Upload (only on create) */}
            {!candidate && (
              <div className="space-y-2">
                <FormLabel>Upload CV (PDF/DOC, max 5MB)</FormLabel>
                <label className="flex items-center gap-3 border border-dashed border-border rounded-lg p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                  <Upload className="w-5 h-5 text-muted-foreground" />
                  <div className="flex-1">
                    {cvFile ? (
                      <span className="text-sm font-medium">{cvFile.name}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Click to select file</span>
                    )}
                  </div>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    className="hidden"
                    onChange={handleCvChange}
                  />
                </label>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading} className="flex-1">
                {isLoading ? "Saving..." : candidate ? "Save Changes" : "Add Candidate"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
