import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { PaymentRecord, usePaymentRecords } from '@/hooks/usePaymentRecords';
import { Order } from '@/hooks/useOrders';
import { format } from 'date-fns';
import { Check, X, Clock, Image, Loader2, ExternalLink, CreditCard } from 'lucide-react';

interface PendingPaymentApprovalsProps {
  orders: Order[];
}

const statusConfig: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  pending: {
    label: 'Pending',
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

export function PendingPaymentApprovals({ orders }: PendingPaymentApprovalsProps) {
  const { records, loading, approvePayment, rejectPayment } = usePaymentRecords();

  const [selectedRecord, setSelectedRecord] = useState<PaymentRecord | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const pendingRecords = records.filter(r => r.status === 'pending');

  const getOrderDetails = (orderId: string) => {
    return orders.find(o => o.id === orderId);
  };

  const handleApprove = async (record: PaymentRecord) => {
    setActionLoading(record.id);
    await approvePayment(record.id);
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

  return (
    <>
      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Pending Payment Approvals
          </CardTitle>
          <CardDescription>
            Review and approve payment screenshots submitted by team members
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : pendingRecords.length === 0 ? (
            <div className="text-center py-8">
              <Check className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground">No pending payment approvals</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingRecords.map((record) => {
                const order = getOrderDetails(record.order_id);
                const config = statusConfig[record.status];

                return (
                  <div
                    key={record.id}
                    className="p-4 rounded-lg border border-border bg-secondary/30"
                  >
                    <div className="flex items-start gap-4">
                      {/* Screenshot thumbnail */}
                      <div
                        className="w-20 h-20 rounded-lg border border-border overflow-hidden shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setPreviewImage(record.screenshot_url)}
                      >
                        <img
                          src={record.screenshot_url}
                          alt="Payment screenshot"
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-lg">₹{record.amount.toLocaleString('en-IN')}</span>
                          <Badge className={config.className}>
                            {config.icon}
                            <span className="ml-1">{config.label}</span>
                          </Badge>
                        </div>
                        {order && (
                          <div className="text-sm space-y-1">
                            <p className="font-medium">
                              {order.customer_name} - {order.customer_company}
                            </p>
                            <p className="text-muted-foreground">
                              {order.product_name} (Qty: {order.quantity})
                            </p>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          Submitted {format(new Date(record.submitted_at), 'dd MMM yyyy, hh:mm a')}
                        </p>
                        {record.notes && (
                          <p className="text-sm text-muted-foreground mt-1 italic">
                            "{record.notes}"
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="outline"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => openRejectDialog(record)}
                          disabled={actionLoading === record.id}
                        >
                          {actionLoading === record.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <X className="h-4 w-4 mr-1" />
                              Reject
                            </>
                          )}
                        </Button>
                        <Button
                          onClick={() => handleApprove(record)}
                          disabled={actionLoading === record.id}
                        >
                          {actionLoading === record.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Check className="h-4 w-4 mr-1" />
                              Approve
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

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
