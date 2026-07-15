import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { PaymentRecord, usePaymentRecords } from '@/hooks/usePaymentRecords';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { Check, X, Clock, Image, Loader2, ExternalLink, ChevronLeft, ChevronRight, Trash2, Pencil } from 'lucide-react';
import { PaymentModeBadge } from '@/components/PaymentModeBadge';
import { PAYMENT_MODE_CATEGORIES, getPaymentModeCategory } from '@/lib/paymentModes';
import { cn } from '@/lib/utils';
import { PaymentUploadDialog } from '@/components/PaymentUploadDialog';

interface PaymentRecordsListProps {
  orderId: string;
  onPaymentApproved?: () => void;
}

const statusConfig: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  pending: {
    label: 'Pending Approval',
    icon: <Clock className="h-3 w-3" />,
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  approved: {
    label: 'Approved',
    icon: <Check className="h-3 w-3" />,
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  },
  rejected: {
    label: 'Rejected',
    icon: <X className="h-3 w-3" />,
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  },
};

export function PaymentRecordsList({ orderId, onPaymentApproved }: PaymentRecordsListProps) {
  const { role, user } = useAuth();
  const { records, loading, approvePayment, rejectPayment, deletePaymentRecord } = usePaymentRecords(orderId);
  const isAdmin = role === 'admin';
  const isSales = role === 'sales';

  const [selectedRecord, setSelectedRecord] = useState<PaymentRecord | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<PaymentRecord | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());

  const toggleCategory = (cat: string) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const filteredRecords = activeCategories.size === 0
    ? records
    : records.filter((r) => {
        const cat = getPaymentModeCategory(r.payment_mode);
        return cat ? activeCategories.has(cat) : false;
      });

  const handleApprove = async (record: PaymentRecord) => {
    setActionLoading(record.id);
    const success = await approvePayment(record.id);
    if (success) {
      onPaymentApproved?.();
    }
    setActionLoading(null);
  };

  const handleReject = async () => {
    if (!selectedRecord || !rejectReason.trim()) return;

    setActionLoading(selectedRecord.id);
    await rejectPayment(selectedRecord.id, rejectReason);
    setActionLoading(null);
    setRejectDialogOpen(false);
    setRejectReason('');
    setSelectedRecord(null);
  };

  const openRejectDialog = (record: PaymentRecord) => {
    setSelectedRecord(record);
    setRejectDialogOpen(true);
  };

  const openDeleteDialog = (record: PaymentRecord) => {
    setSelectedRecord(record);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedRecord) return;

    setActionLoading(selectedRecord.id);
    await deletePaymentRecord(selectedRecord);
    setActionLoading(null);
    setDeleteDialogOpen(false);
    setSelectedRecord(null);
  };

  // Check if current user can delete this record
  // Sales can delete their own pending or rejected records, Admin can delete any record
  const canDeleteRecord = (record: PaymentRecord) => {
    if (isAdmin) return true;
    return (
      isSales &&
      record.submitted_by === user?.id &&
      (record.status === 'pending' || record.status === 'rejected')
    );
  };

  // Sales can edit their own records while still pending or after rejection
  // (before an admin approves). Admin can edit any record.
  const canEditRecord = (record: PaymentRecord) => {
    if (isAdmin) return true;
    return (
      isSales &&
      record.submitted_by === user?.id &&
      (record.status === 'pending' || record.status === 'rejected')
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground text-sm">
        No payment records yet
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <button
          type="button"
          onClick={() => setActiveCategories(new Set())}
          className={cn(
            'text-[11px] px-2.5 py-1 rounded-full border transition',
            activeCategories.size === 0
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background text-muted-foreground border-border hover:bg-muted',
          )}
        >
          All ({records.length})
        </button>
        {PAYMENT_MODE_CATEGORIES.map((cat) => {
          const active = activeCategories.has(cat.value);
          const count = records.filter((r) => getPaymentModeCategory(r.payment_mode) === cat.value).length;
          return (
            <button
              key={cat.value}
              type="button"
              onClick={() => toggleCategory(cat.value)}
              className={cn(
                'text-[11px] px-2.5 py-1 rounded-full border transition',
                active
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted',
              )}
            >
              {cat.label} ({count})
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        {filteredRecords.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            No payments match the selected filters.
          </div>
        ) : filteredRecords.map((record) => {
          const config = statusConfig[record.status];
          return (
            <Card key={record.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {/* Screenshot thumbnails */}
                  <div className="flex gap-1 shrink-0">
                    {(() => {
                      const urls = (record.screenshot_signed_urls && record.screenshot_signed_urls.length > 0
                        ? record.screenshot_signed_urls
                        : [record.screenshot_signed_url || record.screenshot_url]
                      ).filter((u): u is string => !!u);
                      if (urls.length === 0) {
                        return (
                          <div className="w-12 h-12 rounded-lg border border-dashed border-border bg-muted/40 flex items-center justify-center text-[10px] text-muted-foreground text-center px-1 leading-tight">
                            No screenshot
                          </div>
                        );
                      }
                      return (
                        <>
                          {urls.slice(0, 3).map((url, idx) => (
                      <div
                        key={idx}
                        className="w-12 h-12 rounded-lg border border-border overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => {
                          setPreviewImages(urls);
                          setCurrentPreviewIndex(idx);
                        }}
                      >
                        <img
                          src={url}
                          alt={`Payment screenshot ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                          {urls.length > 3 && (
                      <div 
                        className="w-12 h-12 rounded-lg border border-border bg-muted flex items-center justify-center text-xs text-muted-foreground cursor-pointer hover:bg-muted/80"
                        onClick={() => {
                          setPreviewImages(urls);
                          setCurrentPreviewIndex(0);
                        }}
                      >
                              +{urls.length - 3}
                      </div>
                    )}
                        </>
                      );
                    })()}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold">₹{record.amount.toLocaleString('en-IN')}</span>
                      <Badge className={config.className}>
                        {config.icon}
                        <span className="ml-1">{config.label}</span>
                      </Badge>
                      <PaymentModeBadge mode={record.payment_mode} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Submitted {format(new Date(record.submitted_at), 'dd MMM yyyy, hh:mm a')}
                      {record.payment_date && (
                        <span> · Paid {format(new Date(record.payment_date), 'dd MMM yyyy')}</span>
                      )}
                    </p>
                    {record.reference_number && (
                      <p className="text-xs text-muted-foreground font-mono">
                        Ref: {record.reference_number}
                      </p>
                    )}
                    {record.status === 'approved' && record.reviewed_by_name && (
                      <p className="text-xs text-green-600 dark:text-green-400">
                        Approved by {record.reviewed_by_name}
                        {record.reviewed_at && ` on ${format(new Date(record.reviewed_at), 'dd MMM yyyy')}`}
                      </p>
                    )}
                    {record.notes && (
                      <p className="text-sm text-muted-foreground mt-1 truncate">
                        {record.notes}
                      </p>
                    )}
                    {record.status === 'rejected' && record.rejection_reason && (
                      <p className="text-sm text-destructive mt-1">
                        Reason: {record.rejection_reason}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Edit & resubmit button for rejected records */}
                    {canEditRecord(record) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditRecord(record)}
                        disabled={actionLoading === record.id}
                        title="Edit and resubmit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}

                    {/* Delete button for own pending/rejected records (sales) or any (admin) */}
                    {canDeleteRecord(record) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => openDeleteDialog(record)}
                        disabled={actionLoading === record.id}
                      >
                        {actionLoading === record.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    
                    {/* Admin approve/reject buttons */}
                    {isAdmin && record.status === 'pending' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => openRejectDialog(record)}
                          disabled={actionLoading === record.id}
                        >
                          {actionLoading === record.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <X className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleApprove(record)}
                          disabled={actionLoading === record.id}
                        >
                          {actionLoading === record.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Payment</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this payment of ₹{selectedRecord?.amount.toLocaleString('en-IN')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rejection_reason">Rejection Reason</Label>
            <Textarea
              id="rejection_reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter reason for rejection..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!rejectReason.trim() || actionLoading === selectedRecord?.id}
            >
              {actionLoading === selectedRecord?.id && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Reject Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Payment Record</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this payment record of ₹{selectedRecord?.amount.toLocaleString('en-IN')}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={actionLoading === selectedRecord?.id}
            >
              {actionLoading === selectedRecord?.id && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Preview Dialog with navigation */}
      <Dialog open={previewImages.length > 0} onOpenChange={() => setPreviewImages([])}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Image className="h-5 w-5" />
              Payment Screenshot {previewImages.length > 1 && `(${currentPreviewIndex + 1}/${previewImages.length})`}
            </DialogTitle>
          </DialogHeader>
          {previewImages.length > 0 && (
            <div className="relative">
              <img
                src={previewImages[currentPreviewIndex]}
                alt={`Payment screenshot ${currentPreviewIndex + 1}`}
                className="w-full max-h-[70vh] object-contain rounded-lg"
              />
              <a
                href={previewImages[currentPreviewIndex]}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute top-2 right-2"
              >
                <Button size="sm" variant="secondary">
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Open Full Size
                </Button>
              </a>
              
              {/* Navigation buttons */}
              {previewImages.length > 1 && (
                <>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="absolute left-2 top-1/2 -translate-y-1/2"
                    onClick={() => setCurrentPreviewIndex(prev => prev === 0 ? previewImages.length - 1 : prev - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={() => setCurrentPreviewIndex(prev => prev === previewImages.length - 1 ? 0 : prev + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit & Resubmit Dialog */}
      {editRecord && (
        <PaymentUploadDialog
          orderId={orderId}
          open={!!editRecord}
          onOpenChange={(open) => {
            if (!open) setEditRecord(null);
          }}
          existingRecord={editRecord}
          onSuccess={() => {
            setEditRecord(null);
            onPaymentApproved?.();
          }}
        />
      )}
    </>
  );
}
