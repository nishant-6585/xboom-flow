import { useState, useEffect } from "react";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { X, Plus, Upload, ChevronDown, ChevronRight } from "lucide-react";
import { Candidate, CandidateStatus, useCandidateMutations } from "@/hooks/useCandidates";
import { toast } from "sonner";

const schema = z.object({
  // Basic
  full_name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email").max(255),
  phone: z.string().max(20).optional().or(z.literal("")),
  location_city: z.string().max(100).optional().or(z.literal("")),
  location_state: z.string().max(100).optional().or(z.literal("")),
  application_source: z.string().optional().or(z.literal("")),
  // Professional
  years_of_experience: z.coerce.number().min(0).max(60).optional(),
  relevant_experience_years: z.coerce.number().min(0).max(60).optional(),
  current_company: z.string().max(100).optional().or(z.literal("")),
  current_designation: z.string().max(100).optional().or(z.literal("")),
  current_ctc: z.coerce.number().min(0).optional(),
  expected_ctc: z.coerce.number().min(0).optional(),
  notice_period_days: z.coerce.number().int().min(0).max(365).optional(),
  employment_type: z.string().optional().or(z.literal("")),
  // Hiring
  job_role_applied: z.string().max(200).optional().or(z.literal("")),
  department: z.string().max(100).optional().or(z.literal("")),
  recruiter_name: z.string().max(100).optional().or(z.literal("")),
  screening_status: z.string().optional().or(z.literal("")),
  interview_stage: z.string().optional().or(z.literal("")),
  final_status: z.string().optional().or(z.literal("")),
  // Compliance
  offer_letter_issued: z.boolean().optional(),
  joining_date: z.string().optional().or(z.literal("")),
  // Status
  status: z.enum(["applied", "shortlisted", "rejected", "hired", "blacklisted"]),
  rejection_reason: z.string().max(500).optional().or(z.literal("")),
  follow_up_date: z.string().optional().or(z.literal("")),
  remarks: z.string().max(2000).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  candidate?: Candidate;
}

const APP_SOURCES = [
  { value: "Referral", label: "Referral" },
  { value: "Naukri", label: "Naukri" },
  { value: "LinkedIn", label: "LinkedIn" },
  { value: "Website", label: "Website" },
  { value: "Consultant", label: "Consultant" },
  { value: "Walk-in", label: "Walk-in" },
  { value: "Internshala", label: "Internshala" },
  { value: "Indeed", label: "Indeed" },
];

const EMPLOYMENT_TYPES = [
  { value: "Full-time", label: "Full-time" },
  { value: "Contract", label: "Contract" },
  { value: "Intern", label: "Intern" },
];

const SCREENING_STATUSES = [
  { value: "New", label: "New" },
  { value: "Shortlisted", label: "Shortlisted" },
  { value: "Rejected", label: "Rejected" },
  { value: "On Hold", label: "On Hold" },
];

const INTERVIEW_STAGES = [
  { value: "HR", label: "HR" },
  { value: "Technical", label: "Technical" },
  { value: "Managerial", label: "Managerial" },
  { value: "Final", label: "Final" },
];

const FINAL_STATUSES = [
  { value: "Selected", label: "Selected" },
  { value: "Rejected", label: "Rejected" },
];

const STATUSES: CandidateStatus[] = ["applied", "shortlisted", "rejected", "hired", "blacklisted"];

function SectionHeader({ title, open, children }: { title: string; open: boolean; children?: React.ReactNode }) {
  return (
    <CollapsibleTrigger className="flex items-center justify-between w-full py-2 px-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
      <span className="text-sm font-semibold">{title}</span>
      <div className="flex items-center gap-2">
        {children}
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </div>
    </CollapsibleTrigger>
  );
}

export function CandidateFormDialog({ open, onClose, candidate }: Props) {
  const { createCandidate, updateCandidate, uploadCV } = useCandidateMutations();
  const [skills, setSkills] = useState<string[]>(candidate?.primary_skills || []);
  const [skillInput, setSkillInput] = useState("");
  const [cvFile, setCvFile] = useState<File | null>(null);

  const [basicOpen, setBasicOpen] = useState(true);
  const [profOpen, setProfOpen] = useState(true);
  const [hiringOpen, setHiringOpen] = useState(false);
  const [complianceOpen, setComplianceOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: candidate?.full_name || "",
      email: candidate?.email || "",
      phone: candidate?.phone || "",
      location_city: candidate?.location_city || "",
      location_state: candidate?.location_state || "",
      application_source: candidate?.application_source || "",
      years_of_experience: candidate?.years_of_experience ?? undefined,
      relevant_experience_years: candidate?.relevant_experience_years ?? undefined,
      current_company: candidate?.current_company || "",
      current_designation: candidate?.current_designation || "",
      current_ctc: candidate?.current_ctc ?? undefined,
      expected_ctc: candidate?.expected_ctc ?? undefined,
      notice_period_days: candidate?.notice_period_days ?? undefined,
      employment_type: candidate?.employment_type || "",
      job_role_applied: candidate?.job_role_applied || "",
      department: candidate?.department || "",
      recruiter_name: candidate?.recruiter_name || "",
      screening_status: candidate?.screening_status || "New",
      interview_stage: candidate?.interview_stage || "",
      final_status: candidate?.final_status || "",
      offer_letter_issued: candidate?.offer_letter_issued || false,
      joining_date: candidate?.joining_date || "",
      status: candidate?.status || "applied",
      rejection_reason: candidate?.rejection_reason || "",
      follow_up_date: candidate?.follow_up_date || "",
      remarks: candidate?.remarks || "",
      notes: candidate?.notes || "",
    },
  });

  // Reset form completely when dialog opens/closes or candidate changes
  useEffect(() => {
    if (open) {
      form.reset({
        full_name: candidate?.full_name || "",
        email: candidate?.email || "",
        phone: candidate?.phone || "",
        location_city: candidate?.location_city || "",
        location_state: candidate?.location_state || "",
        application_source: candidate?.application_source || "",
        years_of_experience: candidate?.years_of_experience ?? undefined,
        relevant_experience_years: candidate?.relevant_experience_years ?? undefined,
        current_company: candidate?.current_company || "",
        current_designation: candidate?.current_designation || "",
        current_ctc: candidate?.current_ctc ?? undefined,
        expected_ctc: candidate?.expected_ctc ?? undefined,
        notice_period_days: candidate?.notice_period_days ?? undefined,
        employment_type: candidate?.employment_type || "",
        job_role_applied: candidate?.job_role_applied || "",
        department: candidate?.department || "",
        recruiter_name: candidate?.recruiter_name || "",
        screening_status: candidate?.screening_status || "New",
        interview_stage: candidate?.interview_stage || "",
        final_status: candidate?.final_status || "",
        offer_letter_issued: candidate?.offer_letter_issued || false,
        joining_date: candidate?.joining_date || "",
        status: candidate?.status || "applied",
        rejection_reason: candidate?.rejection_reason || "",
        follow_up_date: candidate?.follow_up_date || "",
        remarks: candidate?.remarks || "",
        notes: candidate?.notes || "",
      });
      setSkills(candidate?.primary_skills || []);
      setSkillInput("");
      setCvFile(null);
      setBasicOpen(true);
      setProfOpen(true);
      setHiringOpen(false);
      setComplianceOpen(false);
      setStatusOpen(false);
    }
  }, [open, candidate]);

  const watchedFinalStatus = form.watch("final_status");
  const watchedStatus = form.watch("status");

  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !skills.includes(s)) {
      setSkills([...skills, s]);
    }
    setSkillInput("");
  };

  const removeSkill = (s: string) => setSkills(skills.filter((x) => x !== s));

  const onSubmit = async (values: FormData) => {
    const payload: any = {
      ...values,
      primary_skills: skills,
      phone: values.phone || undefined,
      current_company: values.current_company || undefined,
      current_designation: values.current_designation || undefined,
      location_city: values.location_city || undefined,
      location_state: values.location_state || undefined,
      application_source: values.application_source || undefined,
      employment_type: values.employment_type || undefined,
      job_role_applied: values.job_role_applied || undefined,
      department: values.department || undefined,
      recruiter_name: values.recruiter_name || undefined,
      screening_status: values.screening_status || undefined,
      interview_stage: values.interview_stage || undefined,
      final_status: values.final_status || undefined,
      rejection_reason: values.rejection_reason || undefined,
      follow_up_date: values.follow_up_date || undefined,
      joining_date: values.joining_date || undefined,
      remarks: values.remarks || undefined,
      notes: values.notes || undefined,
    };

    if (candidate) {
      await updateCandidate.mutateAsync({ id: candidate.id, ...payload });
      onClose();
    } else {
      const result = await createCandidate.mutateAsync(payload);
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
          {candidate?.candidate_number && (
            <p className="text-xs text-muted-foreground">{candidate.candidate_number}</p>
          )}
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">

            {/* Section 1: Basic Information */}
            <Collapsible open={basicOpen} onOpenChange={setBasicOpen}>
              <SectionHeader title="Basic Information" open={basicOpen} />
              <CollapsibleContent className="pt-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <FormField control={form.control} name="application_source" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Application Source</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {APP_SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="location_city" render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl><Input placeholder="Mumbai" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="location_state" render={({ field }) => (
                    <FormItem>
                      <FormLabel>State</FormLabel>
                      <FormControl><Input placeholder="Maharashtra" {...field} /></FormControl>
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
                    <div className="flex flex-wrap gap-1.5 mt-1">
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

                {/* CV Upload (only on create) */}
                {!candidate && (
                  <div className="space-y-2">
                    <FormLabel>Upload CV (PDF/DOC, max 5MB)</FormLabel>
                    <label className="flex items-center gap-3 border border-dashed border-border rounded-lg p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                      <Upload className="w-5 h-5 text-muted-foreground" />
                      <div className="flex-1">
                        {cvFile ? (
                          <span className="text-sm font-medium">{cvFile.name}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">Click to select file</span>
                        )}
                      </div>
                      <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleCvChange} />
                    </label>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>

            {/* Section 2: Professional Details */}
            <Collapsible open={profOpen} onOpenChange={setProfOpen}>
              <SectionHeader title="Professional Details" open={profOpen} />
              <CollapsibleContent className="pt-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField control={form.control} name="years_of_experience" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total Experience (Years)</FormLabel>
                      <FormControl><Input type="number" step="0.5" min="0" placeholder="5" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="relevant_experience_years" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Relevant Experience (Years)</FormLabel>
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
                  <FormField control={form.control} name="current_designation" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Designation</FormLabel>
                      <FormControl><Input placeholder="Senior Engineer" {...field} /></FormControl>
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
                  <FormField control={form.control} name="employment_type" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Employment Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {EMPLOYMENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Section 3: Hiring & Interview Tracking */}
            <Collapsible open={hiringOpen} onOpenChange={setHiringOpen}>
              <SectionHeader title="Hiring & Interview Tracking" open={hiringOpen} />
              <CollapsibleContent className="pt-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField control={form.control} name="job_role_applied" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Job Role Applied</FormLabel>
                      <FormControl><Input placeholder="Software Engineer" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="department" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department</FormLabel>
                      <FormControl><Input placeholder="Engineering" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="recruiter_name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Recruiter Name</FormLabel>
                      <FormControl><Input placeholder="Recruiter name" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="screening_status" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Screening Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {SCREENING_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="interview_stage" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Interview Stage</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {INTERVIEW_STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="final_status" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Final Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {FINAL_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Section 4: Compliance (visible when final_status = selected) */}
            {watchedFinalStatus === "Selected" && (
              <Collapsible open={complianceOpen} onOpenChange={setComplianceOpen}>
                <SectionHeader title="Compliance" open={complianceOpen} />
                <CollapsibleContent className="pt-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormField control={form.control} name="offer_letter_issued" render={({ field }) => (
                      <FormItem className="flex items-center gap-3 space-y-0 p-3 bg-muted/30 rounded-lg">
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value}
                            onChange={field.onChange}
                            className="h-4 w-4 rounded border-border"
                          />
                        </FormControl>
                        <FormLabel className="!mt-0">Offer Letter Issued</FormLabel>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="joining_date" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Joining Date</FormLabel>
                        <FormControl><Input type="date" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Section 5: Status Tracking */}
            <Collapsible open={statusOpen} onOpenChange={setStatusOpen}>
              <SectionHeader title="Status Tracking" open={statusOpen} />
              <CollapsibleContent className="pt-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField control={form.control} name="status" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Candidate Status *</FormLabel>
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
                  <FormField control={form.control} name="follow_up_date" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Follow-up Date</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                {(watchedStatus === "rejected" || watchedStatus === "blacklisted") && (
                  <FormField control={form.control} name="rejection_reason" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rejection Reason {watchedStatus === "rejected" ? "*" : ""}</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Reason for rejection..." rows={2} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}
                <FormField control={form.control} name="remarks" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Remarks</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Additional remarks..." rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Internal notes..." rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </CollapsibleContent>
            </Collapsible>

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
