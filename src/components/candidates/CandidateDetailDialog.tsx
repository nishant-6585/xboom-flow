import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Mail, Phone, MapPin, Briefcase, Building2, IndianRupee,
  Clock, Upload, Download, Trash2, Plus, Star, Edit, FileText,
  Calendar, UserCheck, ClipboardList, Eye
} from "lucide-react";
import {
  Candidate,
  CandidateStatus,
  LifecycleStatus,
  LIFECYCLE_TRANSITIONS,
  LIFECYCLE_LABELS,
  FINAL_LIFECYCLE_STATES,
  useCandidateDocuments,
  useInterviewRecords,
  useCandidateMutations,
  useSignedCVUrl,
} from "@/hooks/useCandidates";
import { CandidateStatusBadge, LifecycleStatusBadge } from "./CandidateStatusBadge";
import { InterviewRecordDialog } from "./InterviewRecordDialog";
import { DocumentViewer } from "@/components/hr/DocumentViewer";
import { toast } from "sonner";

const decisionConfig = {
  pass: { label: "Pass", className: "bg-green-500/10 text-green-600 border-green-500/20" },
  reject: { label: "Reject", className: "bg-red-500/10 text-red-600 border-red-500/20" },
  hold: { label: "Hold", className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
};

const sourceLabels: Record<string, string> = {
  Referral: "Referral", Naukri: "Naukri", LinkedIn: "LinkedIn",
  Website: "Website", Consultant: "Consultant", "Walk-in": "Walk-in", Other: "Other",
};

const employmentLabels: Record<string, string> = {
  "Full-time": "Full-time", Contract: "Contract", Intern: "Intern",
};

interface Props {
  open: boolean;
  onClose: () => void;
  candidate: Candidate;
  onEdit: () => void;
}

export function CandidateDetailDialog({ open, onClose, candidate, onEdit }: Props) {
  const { data: documents = [] } = useCandidateDocuments(candidate.id);
  const { data: interviews = [] } = useInterviewRecords(candidate.id);
  const { updateCandidate, deleteDocument, uploadCV } = useCandidateMutations();
  const { getSignedUrl, loading: urlLoading } = useSignedCVUrl();
  const [interviewDialogOpen, setInterviewDialogOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ url: string; name: string } | null>(null);

  const handleView = async (fileUrl: string, fileName: string) => {
    const url = await getSignedUrl(fileUrl);
    if (url) {
      setPreviewDoc({ url, name: fileName });
    }
  };

  const handleLifecycleChange = (newStatus: LifecycleStatus) => {
    updateCandidate.mutate({ id: candidate.id, lifecycle_status: newStatus } as any);
  };

  const currentLifecycle = candidate.lifecycle_status || "NEW";
  const allowedTransitions = LIFECYCLE_TRANSITIONS[currentLifecycle] || [];
  const isFinalState = FINAL_LIFECYCLE_STATES.includes(currentLifecycle);

  const handleDownload = async (fileUrl: string, fileName: string) => {
    const url = await getSignedUrl(fileUrl);
    if (url) {
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.target = "_blank";
      a.click();
    }
  };

  const handleCvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("File must be under 5MB"); return; }
    const allowed = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (!allowed.includes(file.type)) { toast.error("Only PDF or Word documents allowed"); return; }
    await uploadCV.mutateAsync({ candidateId: candidate.id, file });
  };

  const fmt = (n?: number) => n !== undefined && n !== null ? `₹${n} LPA` : "—";
  const fmtExp = (n?: number) => n !== undefined && n !== null ? `${n} yr${n !== 1 ? "s" : ""}` : "—";

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto [&>button]:top-4 [&>button]:right-4">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-xl">{candidate.full_name}</DialogTitle>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {candidate.candidate_number && (
                    <Badge variant="outline" className="text-xs font-mono">{candidate.candidate_number}</Badge>
                  )}
                  <LifecycleStatusBadge status={currentLifecycle} />
                  {candidate.application_source && (
                    <Badge variant="outline" className="text-xs">{sourceLabels[candidate.application_source] || candidate.application_source}</Badge>
                  )}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Edit className="w-4 h-4 mr-1" /> Edit
              </Button>
            </div>
          </DialogHeader>

          {/* Lifecycle Status Update */}
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Lifecycle:</span>
            <LifecycleStatusBadge status={currentLifecycle} />
            {isFinalState ? (
              <span className="text-xs text-muted-foreground italic">Final state — no further transitions</span>
            ) : allowedTransitions.length > 0 ? (
              <Select onValueChange={(v) => handleLifecycleChange(v as LifecycleStatus)}>
                <SelectTrigger className="flex-1 h-8 text-sm">
                  <SelectValue placeholder="Move to..." />
                </SelectTrigger>
                <SelectContent>
                  {allowedTransitions.map((s) => (
                    <SelectItem key={s} value={s}>{LIFECYCLE_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>

          {/* Contact & Profile Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
              <a href={`mailto:${candidate.email}`} className="text-primary hover:underline truncate">{candidate.email}</a>
            </div>
            {candidate.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                <span>{candidate.phone}</span>
              </div>
            )}
            {(candidate.location_city || candidate.location) && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                <span>{[candidate.location_city, candidate.location_state].filter(Boolean).join(", ") || candidate.location}</span>
              </div>
            )}
            {candidate.current_company && (
              <div className="flex items-center gap-2 text-sm">
                <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                <span>{candidate.current_company}{candidate.current_designation ? ` · ${candidate.current_designation}` : ""}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <Briefcase className="w-4 h-4 text-muted-foreground shrink-0" />
              <span>{fmtExp(candidate.years_of_experience)} total{candidate.relevant_experience_years != null ? ` · ${fmtExp(candidate.relevant_experience_years)} relevant` : ""}</span>
            </div>
            {candidate.notice_period_days !== undefined && candidate.notice_period_days !== null && (
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                <span>{candidate.notice_period_days} days notice</span>
              </div>
            )}
            {candidate.employment_type && (
              <div className="flex items-center gap-2 text-sm">
                <ClipboardList className="w-4 h-4 text-muted-foreground shrink-0" />
                <span>{employmentLabels[candidate.employment_type] || candidate.employment_type}</span>
              </div>
            )}
          </div>

          {/* Hiring Info */}
          {(candidate.job_role_applied || candidate.department || candidate.recruiter_name || candidate.screening_status || candidate.final_status) && (
            <div className="p-3 bg-muted/30 rounded-lg space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hiring Info</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {candidate.job_role_applied && <div><span className="text-muted-foreground">Role: </span>{candidate.job_role_applied}</div>}
                {candidate.department && <div><span className="text-muted-foreground">Dept: </span>{candidate.department}</div>}
                {candidate.recruiter_name && <div><span className="text-muted-foreground">Recruiter: </span>{candidate.recruiter_name}</div>}
                {candidate.screening_status && <div><span className="text-muted-foreground">Screening: </span><span className="capitalize">{candidate.screening_status.replace("_", " ")}</span></div>}
                {candidate.interview_stage && <div><span className="text-muted-foreground">Stage: </span><span className="capitalize">{candidate.interview_stage}</span></div>}
                {candidate.final_status && <div><span className="text-muted-foreground">Final: </span><span className="capitalize">{candidate.final_status}</span></div>}
              </div>
            </div>
          )}

          {/* Compliance */}
          {(candidate.offer_letter_issued || candidate.joining_date) && (
            <div className="p-3 bg-muted/30 rounded-lg space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Compliance</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {candidate.offer_letter_issued !== undefined && (
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-muted-foreground" />
                    <span>Offer Letter: {candidate.offer_letter_issued ? "✅ Issued" : "Not issued"}</span>
                  </div>
                )}
                {candidate.joining_date && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span>Joining: {new Date(candidate.joining_date).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CTC */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Current CTC</p>
              <p className="font-semibold flex items-center gap-1"><IndianRupee className="w-3.5 h-3.5" />{candidate.current_ctc != null ? `${candidate.current_ctc} LPA` : "—"}</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Expected CTC</p>
              <p className="font-semibold flex items-center gap-1"><IndianRupee className="w-3.5 h-3.5" />{candidate.expected_ctc != null ? `${candidate.expected_ctc} LPA` : "—"}</p>
            </div>
          </div>

          {/* Skills */}
          {candidate.primary_skills && candidate.primary_skills.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {candidate.primary_skills.map((s) => (
                  <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Notes / Remarks / Rejection Reason */}
          {candidate.notes && (
            <div className="space-y-1">
              <p className="text-sm font-medium">Notes</p>
              <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">{candidate.notes}</p>
            </div>
          )}
          {candidate.remarks && (
            <div className="space-y-1">
              <p className="text-sm font-medium">Remarks</p>
              <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">{candidate.remarks}</p>
            </div>
          )}
          {candidate.rejection_reason && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-destructive">Rejection Reason</p>
              <p className="text-sm text-muted-foreground bg-destructive/5 p-3 rounded-lg border border-destructive/10">{candidate.rejection_reason}</p>
            </div>
          )}

          <Separator />

          {/* Documents */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Documents ({documents.length})</p>
              <label className="cursor-pointer">
                <Button variant="outline" size="sm" asChild>
                  <span>
                    <Upload className="w-3.5 h-3.5 mr-1" />
                    Upload CV
                  </span>
                </Button>
                <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleCvUpload} />
              </label>
            </div>

            {documents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4 border border-dashed border-border rounded-lg">
                No documents uploaded yet
              </p>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.file_name}</p>
                      {doc.file_size && (
                        <p className="text-xs text-muted-foreground">{(doc.file_size / 1024).toFixed(1)} KB</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="View"
                      onClick={() => handleView(doc.file_url, doc.file_name)}
                      disabled={urlLoading}
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Download"
                      onClick={() => handleDownload(doc.file_url, doc.file_name)}
                      disabled={urlLoading}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Document?</AlertDialogTitle>
                          <AlertDialogDescription>This will permanently delete "{doc.file_name}".</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => deleteDocument.mutate({ docId: doc.id, fileUrl: doc.file_url, candidateId: candidate.id })}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Interview History */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Interview History ({interviews.length})</p>
              <Button variant="outline" size="sm" onClick={() => setInterviewDialogOpen(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Round
              </Button>
            </div>

            {interviews.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4 border border-dashed border-border rounded-lg">
                No interview records yet
              </p>
            ) : (
              <div className="space-y-3">
                {interviews.map((rec) => (
                  <div key={rec.id} className="p-3 border border-border rounded-lg space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{rec.round_type}</Badge>
                        <Badge variant="outline" className={`text-xs ${decisionConfig[rec.decision]?.className}`}>
                          {decisionConfig[rec.decision]?.label}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">{new Date(rec.interview_date).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">By: {rec.interviewer_name}</span>
                      {rec.rating && (
                        <div className="flex items-center gap-0.5">
                          {[1,2,3,4,5].map((s) => (
                            <Star key={s} className={`w-3.5 h-3.5 ${s <= rec.rating! ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
                          ))}
                        </div>
                      )}
                    </div>
                    {rec.feedback && (
                      <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">{rec.feedback}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Follow-up */}
          {candidate.follow_up_date && (
            <div className="flex items-center gap-2 text-sm p-3 bg-primary/5 rounded-lg border border-primary/10">
              <Calendar className="w-4 h-4 text-primary" />
              <span>Follow-up: {new Date(candidate.follow_up_date).toLocaleDateString()}</span>
            </div>
          )}

          <div className="text-xs text-muted-foreground pt-2 border-t border-border">
            Added by {candidate.created_by_name || "Unknown"} · {new Date(candidate.created_at).toLocaleDateString()}
          </div>
        </DialogContent>
      </Dialog>

      <InterviewRecordDialog
        open={interviewDialogOpen}
        onClose={() => setInterviewDialogOpen(false)}
        candidateId={candidate.id}
      />

      <DocumentViewer
        open={!!previewDoc}
        onOpenChange={(open) => { if (!open) setPreviewDoc(null); }}
        url={previewDoc?.url ?? null}
        name={previewDoc?.name ?? ""}
      />
    </>
  );
}
