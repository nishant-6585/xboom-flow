import { useState } from "react";
import { useResignation, ResignationRequest } from "@/hooks/useResignation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ResignationRequestDialog } from "./ResignationRequestDialog";
import { HRResignationEntryDialog } from "./HRResignationEntryDialog";
import { format, parseISO, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import {
  CalendarIcon, LogOut, Loader2, Clock, CheckCircle2, XCircle, AlertTriangle, RotateCcw, UserPlus
} from "lucide-react";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  pending: { label: "Pending Review", variant: "secondary", icon: Clock },
  approved: { label: "Approved", variant: "default", icon: CheckCircle2 },
  rejected: { label: "Rejected", variant: "destructive", icon: XCircle },
  withdrawn: { label: "Withdrawn", variant: "outline", icon: RotateCcw },
};

export function ResignationPanel() {
  const {
    requests, myRequest, loading, isHROrAdmin,
    submitResignation, withdrawResignation, reviewResignation, addResignationByHR,
  } = useResignation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [hrEntryDialogOpen, setHrEntryDialogOpen] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ResignationRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<"approved" | "rejected">("approved");
  const [approvedLwd, setApprovedLwd] = useState<Date | undefined>();
  const [hrNotes, setHrNotes] = useState("");
  const [reviewing, setReviewing] = useState(false);

  const handleReview = (req: ResignationRequest, action: "approved" | "rejected") => {
    setSelectedRequest(req);
    setReviewAction(action);
    setApprovedLwd(action === "approved" ? parseISO(req.proposed_lwd) : undefined);
    setHrNotes("");
    setReviewDialogOpen(true);
  };

  const submitReview = async () => {
    if (!selectedRequest) return;
    setReviewing(true);
    await reviewResignation(selectedRequest.id, reviewAction, {
      approved_lwd: approvedLwd ? format(approvedLwd, "yyyy-MM-dd") : undefined,
      hr_notes: hrNotes.trim() || undefined,
    });
    setReviewing(false);
    setReviewDialogOpen(false);
  };

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const processedRequests = requests.filter((r) => r.status !== "pending");

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* HR Add Resignation Button */}
      {isHROrAdmin && (
        <div className="flex justify-end">
          <Button onClick={() => setHrEntryDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" /> Add Resignation
          </Button>
        </div>
      )}
      {/* Employee's own section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <LogOut className="h-5 w-5" /> My Resignation
          </CardTitle>
        </CardHeader>
        <CardContent>
          {myRequest ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Status</span>
                <Badge variant={statusConfig[myRequest.status]?.variant || "secondary"}>
                  {statusConfig[myRequest.status]?.label || myRequest.status}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Proposed LWD</span>
                  <p className="font-medium">{format(parseISO(myRequest.proposed_lwd), "dd MMM yyyy")}</p>
                </div>
                {myRequest.approved_lwd && (
                  <div>
                    <span className="text-muted-foreground">Approved LWD</span>
                    <p className="font-medium text-primary">{format(parseISO(myRequest.approved_lwd), "dd MMM yyyy")}</p>
                  </div>
                )}
                <div className="col-span-2">
                  <span className="text-muted-foreground">Reason</span>
                  <p className="font-medium">{myRequest.reason}</p>
                </div>
                {myRequest.hr_notes && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">HR Notes</span>
                    <p className="font-medium">{myRequest.hr_notes}</p>
                  </div>
                )}
              </div>
              {myRequest.status === "pending" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => withdrawResignation(myRequest.id)}
                  className="w-full"
                >
                  <RotateCcw className="h-4 w-4 mr-2" /> Withdraw Resignation
                </Button>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-3">No active resignation request</p>
              <Button variant="destructive" onClick={() => setDialogOpen(true)}>
                <LogOut className="h-4 w-4 mr-2" /> Submit Resignation
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* HR/Admin view */}
      {isHROrAdmin && pendingRequests.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Pending Resignations ({pendingRequests.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingRequests.map((req) => (
              <div key={req.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{req.employee_name || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">{req.employee_department}</p>
                  </div>
                  <Badge variant="secondary">Pending</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs">Proposed LWD</span>
                    <p className="font-medium">{format(parseISO(req.proposed_lwd), "dd MMM yyyy")}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Submitted</span>
                    <p className="font-medium">{format(parseISO(req.created_at), "dd MMM yyyy")}</p>
                  </div>
                </div>
                <p className="text-sm"><span className="text-muted-foreground">Reason:</span> {req.reason}</p>
                {req.personal_email && (
                  <p className="text-xs text-muted-foreground">Personal email: {req.personal_email}</p>
                )}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={() => handleReview(req, "approved")} className="flex-1">
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleReview(req, "rejected")} className="flex-1">
                    <XCircle className="h-4 w-4 mr-1" /> Reject
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* All Resignations Table */}
      {isHROrAdmin && requests.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">All Resignations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Resignation Date</TableHead>
                    <TableHead>Last Working Day</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created By</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((req) => {
                    const cfg = statusConfig[req.status] || statusConfig.pending;
                    return (
                      <TableRow key={req.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{req.employee_name || "Unknown"}</p>
                            <p className="text-xs text-muted-foreground">{req.employee_number}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{req.employee_department || "—"}</TableCell>
                        <TableCell className="text-sm">
                          {req.resignation_date
                            ? format(parseISO(req.resignation_date), "dd MMM yyyy")
                            : format(parseISO(req.created_at), "dd MMM yyyy")}
                        </TableCell>
                        <TableCell className="text-sm">
                          {format(parseISO(req.approved_lwd || req.proposed_lwd), "dd MMM yyyy")}
                        </TableCell>
                        <TableCell>
                          <Badge variant={cfg.variant}>{cfg.label}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {req.created_by_hr_name
                            ? `${req.created_by_hr_name} (HR)`
                            : req.employee_name || "Employee"}
                        </TableCell>
                        <TableCell>
                          {req.status === "pending" ? (
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" onClick={() => handleReview(req, "approved")}>
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleReview(req, "rejected")}>
                                <XCircle className="h-3 w-3 mr-1" /> Reject
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {req.reviewed_by_name && `By ${req.reviewed_by_name}`}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submit dialog */}
      <ResignationRequestDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={submitResignation}
      />

      {/* Review dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {reviewAction === "approved" ? "Approve Resignation" : "Reject Resignation"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedRequest && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <p><strong>{selectedRequest.employee_name}</strong></p>
                <p>Proposed LWD: {format(parseISO(selectedRequest.proposed_lwd), "dd MMM yyyy")}</p>
              </div>
            )}

            {reviewAction === "approved" && (
              <div className="space-y-2">
                <Label>Approved Last Working Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn("w-full justify-start text-left", !approvedLwd && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {approvedLwd ? format(approvedLwd, "PPP") : "Same as proposed"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={approvedLwd}
                      onSelect={setApprovedLwd}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-muted-foreground">You can modify the LWD. This will auto-update the employee's exit date.</p>
              </div>
            )}

            <div className="space-y-2">
              <Label>HR Notes (optional)</Label>
              <Textarea
                value={hrNotes}
                onChange={(e) => setHrNotes(e.target.value)}
                placeholder="Any notes for the employee..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>Cancel</Button>
            <Button
              variant={reviewAction === "approved" ? "default" : "destructive"}
              onClick={submitReview}
              disabled={reviewing}
            >
              {reviewing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {reviewAction === "approved" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* HR Entry dialog */}
      <HRResignationEntryDialog
        open={hrEntryDialogOpen}
        onOpenChange={setHrEntryDialogOpen}
        onSubmit={addResignationByHR}
      />
    </div>
  );
}
