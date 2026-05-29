import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { Check, X, Clock, User, FileText, LogIn, LogOut } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { CorrectionRequest, useAttendanceCorrectionRequests } from '@/hooks/useAttendanceCorrectionRequests';
import { supabase } from '@/integrations/supabase/client';

interface EmployeeLookup {
  [employeeId: string]: string;
}

interface PendingCorrectionApprovalsProps {
  employeeLookup?: EmployeeLookup;
}

function detectCorrectionType(req: CorrectionRequest): 'checkin' | 'checkout' | 'both' {
  const checkinChanged = req.requested_check_in_time && req.requested_check_in_time !== req.current_check_in_time;
  const checkoutChanged = req.requested_check_out_time && req.requested_check_out_time !== req.current_check_out_time;
  if (checkinChanged && checkoutChanged) return 'both';
  if (checkinChanged) return 'checkin';
  return 'checkout';
}

export function PendingCorrectionApprovals({ employeeLookup }: PendingCorrectionApprovalsProps) {
  const { pendingRequests, reviewRequest, bulkReviewRequests, loading, refetch } = useAttendanceCorrectionRequests();
  const [reviewingRequest, setReviewingRequest] = useState<CorrectionRequest | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewAction, setReviewAction] = useState<'approved' | 'rejected'>('approved');
  const [submitting, setSubmitting] = useState(false);
  const [employeeNames, setEmployeeNames] = useState<EmployeeLookup>(employeeLookup || {});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<'approved' | 'rejected'>('approved');
  const [bulkNotes, setBulkNotes] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };
  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(pendingRequests.map(r => r.id)) : new Set());
  };
  const toggleEmployee = (employeeId: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      pendingRequests
        .filter(r => r.employee_id === employeeId)
        .forEach(r => { if (checked) next.add(r.id); else next.delete(r.id); });
      return next;
    });
  };
  const openBulk = (action: 'approved' | 'rejected') => {
    if (selectedIds.size === 0) { toast.error('Select at least one request'); return; }
    setBulkAction(action);
    setBulkNotes('');
    setBulkDialogOpen(true);
  };
  const handleBulkSubmit = async () => {
    setBulkSubmitting(true);
    try {
      const ids = Array.from(selectedIds);
      const { success, failures } = await bulkReviewRequests(ids, bulkAction, bulkNotes);
      if (success > 0) {
        toast.success(`${success} request${success > 1 ? 's' : ''} ${bulkAction === 'approved' ? 'approved' : 'rejected'}`);
      }
      if (failures.length > 0) {
        toast.error(`${failures.length} failed. ${failures[0].error}`);
      }
      setSelectedIds(new Set());
      setBulkDialogOpen(false);
    } finally {
      setBulkSubmitting(false);
    }
  };

  // Fixed: was incorrectly using useState callback for async side-effect
  useEffect(() => {
    if (!employeeLookup && pendingRequests.length > 0) {
      const ids = [...new Set(pendingRequests.map(r => r.employee_id))];
      supabase
        .from('employees')
        .select('id, name')
        .in('id', ids)
        .then(({ data }) => {
          if (data) {
            const lookup: EmployeeLookup = {};
            data.forEach(e => { lookup[e.id] = e.name; });
            setEmployeeNames(prev => ({ ...prev, ...lookup }));
          }
        });
    }
  }, [employeeLookup, pendingRequests]);

  const handleReview = async () => {
    if (!reviewingRequest) return;
    setSubmitting(true);
    try {
      await reviewRequest(reviewingRequest.id, reviewAction, reviewNotes);
      toast.success(
        reviewAction === 'approved'
          ? 'Correction approved and applied ✅'
          : 'Correction request rejected'
      );
      setReviewingRequest(null);
      setReviewNotes('');
    } catch (e: any) {
      toast.error(e.message || 'Failed to process review');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-muted">
        <CardContent className="py-6 text-center text-muted-foreground text-sm">
          Loading correction requests…
        </CardContent>
      </Card>
    );
  }

  if (pendingRequests.length === 0) {
    return (
      <Card className="border-muted">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Pending Attendance Corrections
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <p className="text-sm text-muted-foreground text-center py-4">
            No pending correction requests at this time.
          </p>
        </CardContent>
      </Card>
    );
  }

  const groups = pendingRequests.reduce<Record<string, CorrectionRequest[]>>((acc, r) => {
    (acc[r.employee_id] ||= []).push(r);
    return acc;
  }, {});
  const allSelected = pendingRequests.length > 0 && selectedIds.size === pendingRequests.length;

  return (
    <>
      <Card className="border-amber-200 bg-amber-50/30 dark:bg-amber-950/10 dark:border-amber-800">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Pending Attendance Corrections ({pendingRequests.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-3">
          <div className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-md bg-background/60 border border-dashed">
            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
              <Checkbox checked={allSelected} onCheckedChange={(v) => toggleAll(v === true)} />
              Select all
              {selectedIds.size > 0 && (
                <span className="text-muted-foreground font-normal">({selectedIds.size} selected)</span>
              )}
            </label>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs border-green-400 text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30"
                disabled={selectedIds.size === 0}
                onClick={() => openBulk('approved')}
              >
                <Check className="h-3 w-3 mr-1" /> Approve selected
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs border-red-400 text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                disabled={selectedIds.size === 0}
                onClick={() => openBulk('rejected')}
              >
                <X className="h-3 w-3 mr-1" /> Reject selected
              </Button>
            </div>
          </div>

          {Object.entries(groups).map(([employeeId, reqs]) => {
            const empName = employeeNames[employeeId] || reqs[0].requested_by_name;
            const empSelected = reqs.every(r => selectedIds.has(r.id));
            return (
              <div key={employeeId} className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer px-1">
                  <Checkbox checked={empSelected} onCheckedChange={(v) => toggleEmployee(employeeId, v === true)} />
                  <User className="h-3 w-3 text-muted-foreground" />
                  {empName}
                  <span className="font-normal text-muted-foreground">({reqs.length})</span>
                </label>
                {reqs.map(req => {
                  const corrType = detectCorrectionType(req);
                  return (
                    <div
                      key={req.id}
                      className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-background border gap-3"
                    >
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <Checkbox
                          className="mt-1"
                          checked={selectedIds.has(req.id)}
                          onCheckedChange={(v) => toggleOne(req.id, v === true)}
                          aria-label="Select request"
                        />
                        <div className="min-w-0 space-y-1 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {req.requested_check_in_time
                                ? format(parseISO(req.requested_check_in_time), 'dd MMM yyyy')
                                : req.requested_check_out_time
                                ? format(parseISO(req.requested_check_out_time), 'dd MMM yyyy')
                                : format(parseISO(req.created_at), 'dd MMM yyyy')}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5">
                              {corrType === 'checkin' && <><LogIn className="h-2.5 w-2.5" /> Check-In</>}
                              {corrType === 'checkout' && <><LogOut className="h-2.5 w-2.5" /> Checkout</>}
                              {corrType === 'both' && 'Check-In & Checkout'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                            {(corrType === 'checkin' || corrType === 'both') && (
                              <span className="flex items-center gap-1">
                                <LogIn className="h-3 w-3" />
                                {req.current_check_in_time ? format(parseISO(req.current_check_in_time), 'hh:mm a') : 'Missing'}
                                <span>→</span>
                                <span className="font-medium text-foreground">
                                  {req.requested_check_in_time ? format(parseISO(req.requested_check_in_time), 'hh:mm a') : '—'}
                                </span>
                              </span>
                            )}
                            {(corrType === 'checkout' || corrType === 'both') && (
                              <span className="flex items-center gap-1">
                                <LogOut className="h-3 w-3" />
                                {req.current_check_out_time ? format(parseISO(req.current_check_out_time), 'hh:mm a') : '—'}
                                <span>→</span>
                                <span className="font-medium text-foreground">
                                  {req.requested_check_out_time ? format(parseISO(req.requested_check_out_time), 'hh:mm a') : '—'}
                                </span>
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">Reason: {req.reason}</p>
                        </div>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs border-green-400 text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30"
                          onClick={() => { setReviewingRequest(req); setReviewAction('approved'); setReviewNotes(''); }}
                        >
                          <Check className="h-3 w-3 mr-1" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs border-red-400 text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                          onClick={() => { setReviewingRequest(req); setReviewAction('rejected'); setReviewNotes(''); }}
                        >
                          <X className="h-3 w-3 mr-1" /> Reject
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={!!reviewingRequest} onOpenChange={open => { if (!open) setReviewingRequest(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {reviewAction === 'approved' ? '✅ Approve Correction' : '❌ Reject Correction'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {reviewingRequest && (() => {
              const ct = detectCorrectionType(reviewingRequest);
              return (
                <div className="rounded-lg bg-muted/40 p-3 space-y-1 text-sm">
                  <p><strong>Employee:</strong> {employeeNames[reviewingRequest.employee_id] || reviewingRequest.requested_by_name}</p>
                  <p><strong>Type:</strong> {ct === 'checkin' ? 'Check-In Correction' : ct === 'checkout' ? 'Checkout Correction' : 'Check-In & Checkout Correction'}</p>
                  {(ct === 'checkin' || ct === 'both') && (
                    <p><strong>Check-In:</strong> {reviewingRequest.current_check_in_time ? format(parseISO(reviewingRequest.current_check_in_time), 'hh:mm a') : 'Missing'} → {reviewingRequest.requested_check_in_time ? format(parseISO(reviewingRequest.requested_check_in_time), 'hh:mm a') : '—'}</p>
                  )}
                  {(ct === 'checkout' || ct === 'both') && (
                    <p><strong>Checkout:</strong> {reviewingRequest.current_check_out_time ? format(parseISO(reviewingRequest.current_check_out_time), 'hh:mm a') : '—'} → {reviewingRequest.requested_check_out_time ? format(parseISO(reviewingRequest.requested_check_out_time), 'hh:mm a') : '—'}</p>
                  )}
                  <p><strong>Reason:</strong> {reviewingRequest.reason}</p>
                </div>
              );
            })()}
            <div className="space-y-1.5">
              <Label className="text-sm">Review Notes (optional)</Label>
              <Textarea
                placeholder="Add notes for this decision..."
                value={reviewNotes}
                onChange={e => setReviewNotes(e.target.value)}
                rows={2}
                className="resize-none text-sm"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReviewingRequest(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleReview}
              disabled={submitting}
              className={reviewAction === 'approved'
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'}
            >
              {submitting ? 'Processing…' : reviewAction === 'approved' ? 'Confirm Approval' : 'Confirm Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDialogOpen} onOpenChange={(o) => { if (!o) setBulkDialogOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {bulkAction === 'approved' ? '✅ Bulk Approve' : '❌ Bulk Reject'} ({selectedIds.size})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              You are about to {bulkAction === 'approved' ? 'approve' : 'reject'}{' '}
              <strong>{selectedIds.size}</strong> attendance correction request{selectedIds.size > 1 ? 's' : ''}.
              {bulkAction === 'approved' && ' Approved corrections will be applied to attendance logs immediately.'}
            </p>
            <div className="space-y-1.5">
              <Label className="text-sm">Review Notes (applied to all)</Label>
              <Textarea
                placeholder="Optional notes..."
                value={bulkNotes}
                onChange={(e) => setBulkNotes(e.target.value)}
                rows={2}
                className="resize-none text-sm"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBulkDialogOpen(false)} disabled={bulkSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={handleBulkSubmit}
              disabled={bulkSubmitting}
              className={bulkAction === 'approved'
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'}
            >
              {bulkSubmitting
                ? 'Processing…'
                : bulkAction === 'approved'
                ? `Approve ${selectedIds.size}`
                : `Reject ${selectedIds.size}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
