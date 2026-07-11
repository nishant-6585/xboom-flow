import { useState, useEffect } from "react";
import { LeadMeetingsPanel } from "@/components/meetings/LeadMeetingsPanel";
import { EnquiryMessageThread } from "@/components/enquiry/EnquiryMessageThread";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Enquiry, QueryStatus, EnquiryResponse, ENQUIRY_STATUSES, LOST_REASONS, LostReason } from "@/hooks/useEnquiries";
import { StatusBadge } from "./StatusBadge";
import { UrgencyIndicator } from "./UrgencyIndicator";
import { AILeadScoring } from "./AILeadScoring";
import { useAuth } from "@/hooks/useAuth";
import { Package, User, Building2, Hash, Boxes, Clock, CheckCircle, Trash2, Loader2, AlertTriangle, Calendar, IndianRupee, UserCheck, ShieldCheck, Timer, StickyNote, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { differenceInHours, differenceInMinutes, differenceInDays } from "date-fns";
import { formatDistanceToNow } from "date-fns";
import { LeadSourceBadge } from "./LeadSourceBadge";
import { FollowupNoteInput } from "./crm/FollowupNoteInput";
import { FOLLOWUP_NOTE_OPTIONS } from "@/lib/followupNotes";
import { markEnquiryOpen, markEnquiryClosed } from "@/lib/enquiryPresence";

interface EnquiryDialogProps {
  enquiry: Enquiry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitResponse: (enquiryId: string, status: QueryStatus, response: EnquiryResponse, lostReason?: LostReason, lostReasonNotes?: string) => Promise<boolean>;
  onDelete: (enquiryId: string) => Promise<boolean>;
  onEscalate: (enquiryId: string, reason: string) => Promise<boolean>;
  onSubmitAdminResponse?: (enquiryId: string, adminResponse: string) => Promise<boolean>;
  onUpdateFollowupNote?: (enquiryId: string, note: string | null) => Promise<boolean>;
}

export function EnquiryDialog({
  enquiry,
  open,
  onOpenChange,
  onSubmitResponse,
  onDelete,
  onEscalate,
  onSubmitAdminResponse,
  onUpdateFollowupNote,
}: EnquiryDialogProps) {
  const { role, profile, user } = useAuth();
  const [status, setStatus] = useState<QueryStatus>("pending");
  const [response, setResponse] = useState({
    pricing: "",
    availability: "",
    leadTime: "",
    notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [escalateDialogOpen, setEscalateDialogOpen] = useState(false);
  const [escalationReason, setEscalationReason] = useState("");
  const [adminResponseText, setAdminResponseText] = useState("");
  const [lostReason, setLostReason] = useState<LostReason | "">("");
  const [lostReasonNotes, setLostReasonNotes] = useState("");
  const [followupNote, setFollowupNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Reset form when enquiry changes
  useEffect(() => {
    if (enquiry) {
      setStatus(enquiry.status);
      setResponse({
        pricing: enquiry.response_pricing || "",
        availability: enquiry.response_availability || "",
        leadTime: enquiry.response_lead_time || "",
        notes: enquiry.response_notes || "",
      });
      setAdminResponseText(enquiry.admin_response || "");
      setLostReason(enquiry.lost_reason || "");
      setLostReasonNotes(enquiry.lost_reason_notes || "");
      setFollowupNote(enquiry.followup_note || "");
    }
  }, [enquiry]);

  // Track which enquiry dialog is currently open so toast presenters
  // can suppress notifications for a thread the user is actively reading.
  useEffect(() => {
    if (!enquiry?.id || !open) return;
    markEnquiryOpen(enquiry.id);
    return () => markEnquiryClosed(enquiry.id);
  }, [enquiry?.id, open]);

  if (!enquiry) return null;

  const canRespond = role === "supply_chain" || role === "admin";
  const canDelete = role === "admin";
  const canEscalate = (role === "sales" || role === "supply_chain") && !enquiry.is_escalated;
  const canRespondToEscalation = role === "admin" && enquiry.is_escalated && onSubmitAdminResponse;
  const canEditFollowup = !!onUpdateFollowupNote && (
    role === "admin" ||
    role === "supply_chain" ||
    role === "sales_manager" ||
    (role === "sales" && enquiry.sales_person_id === user?.id)
  );

  // Calculate response time
  const getResponseTimeInfo = () => {
    if (!enquiry.responded_at) return null;
    
    const createdAt = new Date(enquiry.created_at);
    const respondedAt = new Date(enquiry.responded_at);
    const totalMinutes = differenceInMinutes(respondedAt, createdAt);
    const totalHours = differenceInHours(respondedAt, createdAt);
    const totalDays = differenceInDays(respondedAt, createdAt);
    
    let displayText = "";
    let colorClass = "";
    
    if (totalMinutes < 60) {
      displayText = `${totalMinutes} min`;
      colorClass = "text-success bg-success/10 border-success/30";
    } else if (totalHours < 24) {
      const mins = totalMinutes % 60;
      displayText = mins > 0 ? `${totalHours}h ${mins}m` : `${totalHours} hours`;
      colorClass = totalHours <= 6 ? "text-success bg-success/10 border-success/30" : 
                   totalHours <= 12 ? "text-warning bg-warning/10 border-warning/30" : 
                   "text-destructive bg-destructive/10 border-destructive/30";
    } else {
      const remainingHours = totalHours % 24;
      displayText = remainingHours > 0 ? `${totalDays}d ${remainingHours}h` : `${totalDays} days`;
      colorClass = "text-destructive bg-destructive/10 border-destructive/30";
    }
    
    return { displayText, colorClass, totalHours };
  };
  
  const responseTimeInfo = getResponseTimeInfo();

  const handleSubmit = async () => {
    // Validate lost reason is required when status is order_lost
    if (status === "order_lost" && !lostReason) {
      return; // Don't submit without lost reason
    }
    setLoading(true);
    const success = await onSubmitResponse(
      enquiry.id, 
      status, 
      response, 
      status === "order_lost" ? (lostReason as LostReason) : undefined,
      status === "order_lost" ? lostReasonNotes : undefined
    );
    setLoading(false);
    if (success) {
      onOpenChange(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    const success = await onDelete(enquiry.id);
    setLoading(false);
    setDeleteDialogOpen(false);
    if (success) {
      onOpenChange(false);
    }
  };

  const handleEscalate = async () => {
    if (!escalationReason.trim()) return;
    setLoading(true);
    const success = await onEscalate(enquiry.id, escalationReason);
    setLoading(false);
    setEscalateDialogOpen(false);
    setEscalationReason("");
    if (success) {
      onOpenChange(false);
    }
  };

  const handleAdminResponse = async () => {
    if (!onSubmitAdminResponse || !adminResponseText.trim()) return;
    setLoading(true);
    const success = await onSubmitAdminResponse(enquiry.id, adminResponseText);
    setLoading(false);
    if (success) {
      onOpenChange(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl glass max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" />
                Enquiry Details
              </span>
              {canDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Escalation Banner */}
            {enquiry.is_escalated && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-destructive mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-destructive">Escalated to Admin</p>
                  <p className="text-sm text-muted-foreground mt-1">{enquiry.escalation_reason}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Escalated by <span className="font-medium text-foreground">{enquiry.escalated_by_name || 'Unknown'}</span>
                    {enquiry.escalated_at && ` on ${new Date(enquiry.escalated_at).toLocaleString()}`}
                  </p>
                </div>
              </div>
            )}

            {/* Query Details Summary */}
            <div className="p-4 rounded-lg bg-secondary/50 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{enquiry.product_name}</h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Hash className="w-3 h-3" />
                    {enquiry.product_code}
                  </div>
                  {enquiry.product_category && (
                    <Badge variant="outline" className="mt-1">{enquiry.product_category}</Badge>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={enquiry.status} />
                  {enquiry.lead_source && (
                    <LeadSourceBadge source={enquiry.lead_source} size="sm" fallback="hide" />
                  )}
                  {enquiry.is_escalated && (
                    <Badge variant="destructive" className="text-xs">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Escalated
                    </Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Boxes className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Qty:</span>
                  <span className="font-medium">{enquiry.quantity}</span>
                </div>
                <div>
                  <UrgencyIndicator urgency={enquiry.urgency} />
                </div>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="truncate">{enquiry.customer_name}</span>
                </div>
                {enquiry.customer_company && (
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    <span className="truncate">{enquiry.customer_company}</span>
                  </div>
                )}
              </div>

              {enquiry.requested_timeline && (
                <div className="pt-2 border-t border-border">
                  <p className="text-sm flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary" />
                    <span className="font-medium">Requested Timeline:</span>
                    <span className="text-muted-foreground">{enquiry.requested_timeline}</span>
                  </p>
                </div>
              )}

              {enquiry.notes && (
                <div className="pt-2 border-t border-border">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium">Notes:</span> {enquiry.notes}
                  </p>
                </div>
              )}

              <div className="pt-2 border-t border-border text-xs text-muted-foreground">
                Submitted by: {enquiry.sales_person_name}
              </div>
            </div>

            {/* Follow-up Note Block */}
            <div className="p-4 rounded-lg border bg-muted/20 space-y-3">
              <div className="flex items-center gap-2">
                <StickyNote className="w-4 h-4 text-primary" />
                <h4 className="font-medium text-sm">Follow-up Note</h4>
              </div>
              {canEditFollowup ? (
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1">
                    <FollowupNoteInput
                      value={followupNote}
                      onChange={setFollowupNote}
                      options={FOLLOWUP_NOTE_OPTIONS}
                      placeholder="Pick or type a note…"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={savingNote || followupNote === (enquiry.followup_note || "")}
                    onClick={async () => {
                      if (!onUpdateFollowupNote) return;
                      setSavingNote(true);
                      await onUpdateFollowupNote(enquiry.id, followupNote || null);
                      setSavingNote(false);
                    }}
                  >
                    {savingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                    Save
                  </Button>
                </div>
              ) : (
                <p className="text-sm">{enquiry.followup_note || <span className="text-muted-foreground italic">No follow-up note yet</span>}</p>
              )}
              {enquiry.followup_note_updated_at && (
                <p className="text-xs text-muted-foreground">
                  Updated {formatDistanceToNow(new Date(enquiry.followup_note_updated_at), { addSuffix: true })}
                  {enquiry.followup_note_updated_by_name ? ` by ${enquiry.followup_note_updated_by_name}` : ""}
                </p>
              )}
            </div>

            {/* Meetings Panel */}
            <LeadMeetingsPanel leadType="enquiry" leadId={enquiry.id} />

            {/* AI Lead Scoring */}
            <AILeadScoring 
              enquiry={{
                customer_name: enquiry.customer_name,
                customer_company: enquiry.customer_company,
                product_name: enquiry.product_name,
                product_category: enquiry.product_category,
                quantity: enquiry.quantity,
                urgency: enquiry.urgency,
                lead_temperature: enquiry.lead_temperature,
                is_mega_deal: enquiry.is_mega_deal,
                notes: enquiry.notes,
                requested_timeline: enquiry.requested_timeline,
                response_pricing: enquiry.response_pricing,
                response_availability: enquiry.response_availability,
                status: enquiry.status,
              }}
            />

            {/* Display existing Supply Chain Response (for everyone to see) */}
            {enquiry.responded_at && (
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-primary" />
                    <h4 className="font-medium">Supply Chain Response</h4>
                  </div>
                  {responseTimeInfo && (
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${responseTimeInfo.colorClass}`}>
                      <Timer className="w-3.5 h-3.5" />
                      <span>Responded in {responseTimeInfo.displayText}</span>
                    </div>
                  )}
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  {enquiry.response_pricing && (
                    <div>
                      <span className="text-muted-foreground">Pricing:</span>
                      <span className="ml-2 font-medium">{enquiry.response_pricing}</span>
                    </div>
                  )}
                  {enquiry.response_availability && (
                    <div>
                      <span className="text-muted-foreground">Availability:</span>
                      <span className="ml-2 font-medium">{enquiry.response_availability}</span>
                    </div>
                  )}
                  {enquiry.response_lead_time && (
                    <div>
                      <span className="text-muted-foreground">Lead Time:</span>
                      <span className="ml-2 font-medium">{enquiry.response_lead_time}</span>
                    </div>
                  )}
                </div>
                
                {enquiry.response_notes && (
                  <p className="text-sm text-muted-foreground">{enquiry.response_notes}</p>
                )}
                
                <p className="text-xs text-muted-foreground border-t border-border pt-2">
                  Responded by <span className="font-medium text-foreground">{enquiry.responded_by_name || 'Unknown'}</span>
                  {enquiry.responded_at && ` on ${new Date(enquiry.responded_at).toLocaleString()}`}
                </p>
              </div>
            )}

            {/* Display Admin Response (for escalated enquiries) */}
            {enquiry.is_escalated && enquiry.admin_response && (
              <div className="p-4 rounded-lg bg-success/5 border border-success/20 space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-success" />
                  <h4 className="font-medium">Admin Response</h4>
                </div>
                
                <p className="text-sm">{enquiry.admin_response}</p>
                
                <p className="text-xs text-muted-foreground border-t border-border pt-2">
                  Responded by <span className="font-medium text-foreground">{enquiry.admin_response_by_name || 'Unknown'}</span>
                  {enquiry.admin_response_at && ` on ${new Date(enquiry.admin_response_at).toLocaleString()}`}
                </p>
              </div>
            )}

            {/* Discussion Thread — available from the moment the enquiry exists */}
            <EnquiryMessageThread enquiryId={enquiry.id} />

            {/* Response Form - Only show for supply chain or admin */}
            {canRespond && (
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  {enquiry.responded_at ? 'Update Response' : 'Supply Chain Response'}
                </h4>

                <div className="space-y-2">
                  <Label htmlFor="status">Update Status</Label>
                  <Select value={status} onValueChange={(v: QueryStatus) => {
                    setStatus(v);
                    // Clear lost reason when status changes away from order_lost
                    if (v !== "order_lost") {
                      setLostReason("");
                      setLostReasonNotes("");
                    }
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {ENQUIRY_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Lost Reason Section - Show when status is order_lost */}
                {status === "order_lost" && (
                  <div className="space-y-4 p-4 rounded-lg bg-destructive/5 border border-destructive/20">
                    <div className="space-y-2">
                      <Label htmlFor="lostReason" className="text-destructive">Lost Reason *</Label>
                      <Select value={lostReason} onValueChange={(v: LostReason) => setLostReason(v)}>
                        <SelectTrigger className="border-destructive/30">
                          <SelectValue placeholder="Select reason for losing" />
                        </SelectTrigger>
                        <SelectContent>
                          {LOST_REASONS.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lostReasonNotes">Additional Notes</Label>
                      <Textarea
                        id="lostReasonNotes"
                        placeholder="Provide more details about why this order was lost..."
                        rows={2}
                        value={lostReasonNotes}
                        onChange={(e) => setLostReasonNotes(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pricing" className="flex items-center gap-2">
                      <IndianRupee className="w-4 h-4 text-muted-foreground" />
                      Pricing (INR)
                    </Label>
                    <Input
                      id="pricing"
                      placeholder="e.g., ₹4,500/unit"
                      value={response.pricing}
                      onChange={(e) => setResponse({ ...response, pricing: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="availability" className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-muted-foreground" />
                      Availability
                    </Label>
                    <Input
                      id="availability"
                      placeholder="e.g., In Stock"
                      value={response.availability}
                      onChange={(e) => setResponse({ ...response, availability: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="leadTime" className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      Lead Time
                    </Label>
                    <Input
                      id="leadTime"
                      placeholder="e.g., 5-7 days"
                      value={response.leadTime}
                      onChange={(e) => setResponse({ ...response, leadTime: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="responseNotes">Notes</Label>
                  <Textarea
                    id="responseNotes"
                    placeholder="Additional notes or comments for the sales team..."
                    rows={3}
                    value={response.notes}
                    onChange={(e) => setResponse({ ...response, notes: e.target.value })}
                  />
                </div>
              </div>
            )}

            {/* Admin Response Form - Only show for admin on escalated enquiries */}
            {canRespondToEscalation && (
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  {enquiry.admin_response ? 'Update Admin Response' : 'Admin Response to Escalation'}
                </h4>

                <div className="space-y-2">
                  <Label htmlFor="adminResponse">Your Response</Label>
                  <Textarea
                    id="adminResponse"
                    placeholder="Provide your admin response to this escalated enquiry..."
                    rows={4}
                    value={adminResponseText}
                    onChange={(e) => setAdminResponseText(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {canRespond || canRespondToEscalation ? "Cancel" : "Close"}
              </Button>
              {canEscalate && (
                <Button 
                  variant="destructive" 
                  onClick={() => setEscalateDialogOpen(true)}
                >
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  Escalate to Admin
                </Button>
              )}
              {canRespondToEscalation && (
                <Button 
                  onClick={handleAdminResponse} 
                  disabled={loading || !adminResponseText.trim()}
                  variant="default"
                >
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  Submit Admin Response
                </Button>
              )}
              {canRespond && (
                <Button onClick={handleSubmit} disabled={loading}>
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Submit Response
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Enquiry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this enquiry? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={escalateDialogOpen} onOpenChange={setEscalateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Escalate to Admin</AlertDialogTitle>
            <AlertDialogDescription>
              Escalating this enquiry will notify admins for intervention. Please provide a reason for escalation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Describe why this enquiry needs admin intervention..."
              value={escalationReason}
              onChange={(e) => setEscalationReason(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setEscalationReason("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEscalate}
              disabled={!escalationReason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Escalate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
