import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PaymentRecord, usePaymentRecords } from '@/hooks/usePaymentRecords';
import { format } from 'date-fns';
import { Check, X, Clock, CreditCard, Image, Loader2, ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

interface PaymentStatusTrackerProps {
  orderId: string;
  compact?: boolean;
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

export function PaymentStatusTracker({ orderId, compact = false }: PaymentStatusTrackerProps) {
  const { records, loading } = usePaymentRecords(orderId);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading payment records...</span>
      </div>
    );
  }

  if (records.length === 0) {
    if (compact) {
      return (
        <span className="text-xs text-muted-foreground">No payment records</span>
      );
    }
    return (
      <div className="text-center py-4 text-muted-foreground">
        <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No payment records submitted</p>
      </div>
    );
  }

  const pendingCount = records.filter(r => r.status === 'pending').length;
  const approvedCount = records.filter(r => r.status === 'approved').length;
  const rejectedCount = records.filter(r => r.status === 'rejected').length;
  const totalApproved = records.filter(r => r.status === 'approved').reduce((sum, r) => sum + r.amount, 0);

  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {pendingCount > 0 && (
          <Badge className={statusConfig.pending.className}>
            <Clock className="h-3 w-3 mr-1" />
            {pendingCount} Pending
          </Badge>
        )}
        {approvedCount > 0 && (
          <Badge className={statusConfig.approved.className}>
            <Check className="h-3 w-3 mr-1" />
            ₹{totalApproved.toLocaleString('en-IN')} Approved
          </Badge>
        )}
        {rejectedCount > 0 && (
          <Badge className={statusConfig.rejected.className}>
            <X className="h-3 w-3 mr-1" />
            {rejectedCount} Rejected
          </Badge>
        )}
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Payment Records
          </CardTitle>
          <CardDescription>
            {records.length} payment record{records.length !== 1 ? 's' : ''} submitted
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Summary */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {pendingCount > 0 && (
              <Badge className={statusConfig.pending.className}>
                <Clock className="h-3 w-3 mr-1" />
                {pendingCount} Pending
              </Badge>
            )}
            {approvedCount > 0 && (
              <Badge className={statusConfig.approved.className}>
                <Check className="h-3 w-3 mr-1" />
                {approvedCount} Approved (₹{totalApproved.toLocaleString('en-IN')})
              </Badge>
            )}
            {rejectedCount > 0 && (
              <Badge className={statusConfig.rejected.className}>
                <X className="h-3 w-3 mr-1" />
                {rejectedCount} Rejected
              </Badge>
            )}
          </div>

          {/* Records List */}
          <div className="space-y-3">
            {records.map((record) => {
              const config = statusConfig[record.status];
              return (
                <div
                  key={record.id}
                  className="p-3 rounded-lg border border-border bg-secondary/30"
                >
                  <div className="flex items-start gap-3">
                    {/* Thumbnail */}
                    <div
                      className="w-12 h-12 rounded border border-border overflow-hidden shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => setPreviewImage(record.screenshot_signed_url || record.screenshot_url)}
                    >
                      <img
                        src={record.screenshot_signed_url || record.screenshot_url}
                        alt="Payment screenshot"
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold">₹{record.amount.toLocaleString('en-IN')}</span>
                        <Badge className={config.className}>
                          {config.icon}
                          <span className="ml-1">{config.label}</span>
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Submitted {format(new Date(record.submitted_at), 'dd MMM yyyy, hh:mm a')}
                      </p>
                      {record.notes && (
                        <p className="text-xs text-muted-foreground mt-1 italic">
                          "{record.notes}"
                        </p>
                      )}
                      {record.status === 'rejected' && record.rejection_reason && (
                        <div className="mt-2 p-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                          <p className="text-xs text-red-700 dark:text-red-400">
                            <strong>Rejection reason:</strong> {record.rejection_reason}
                          </p>
                        </div>
                      )}
                      {record.reviewed_at && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Reviewed {format(new Date(record.reviewed_at), 'dd MMM yyyy, hh:mm a')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Image Preview Dialog */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Image className="h-5 w-5" />
              Payment Screenshot
            </DialogTitle>
          </DialogHeader>
          {previewImage && (
            <div className="relative">
              <img
                src={previewImage}
                alt="Payment screenshot"
                className="w-full max-h-[70vh] object-contain rounded-lg"
              />
              <a
                href={previewImage}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute top-2 right-2"
              >
                <Button size="sm" variant="secondary">
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Open Full Size
                </Button>
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}