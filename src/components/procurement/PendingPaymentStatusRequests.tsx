import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  useProcurementPaymentRequests, 
  ProcurementPaymentRequestWithOrder 
} from '@/hooks/useProcurementPaymentRequests';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  AlertCircle,
  User,
  Calendar,
  FileText
} from 'lucide-react';
import { OrderNumberBadge } from '@/components/OrderNumberBadge';

export function PendingPaymentStatusRequests() {
  const { role } = useAuth();
  const canApprove = role === 'admin' || role === 'finance';
  const { requests, loading, approveRequest, rejectRequest } = useProcurementPaymentRequests();
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ProcurementPaymentRequestWithOrder | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const approvedRequests = requests.filter(r => r.status === 'approved');

  const handleApprove = async (request: ProcurementPaymentRequestWithOrder) => {
    setActionLoading(request.id);
    await approveRequest(request.id);
    setActionLoading(null);
  };

  const handleReject = async () => {
    if (!selectedRequest || !rejectionReason.trim()) return;
    
    setActionLoading(selectedRequest.id);
    await rejectRequest(selectedRequest.id, rejectionReason);
    setActionLoading(null);
    setRejectDialogOpen(false);
    setRejectionReason('');
    setSelectedRequest(null);
  };

  const openRejectDialog = (request: ProcurementPaymentRequestWithOrder) => {
    setSelectedRequest(request);
    setRejectDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pending Requests - Show to Admin and Finance */}
      {canApprove && pendingRequests.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              Pending Payment Status Requests
              <Badge variant="secondary">{pendingRequests.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-3">
                {pendingRequests.map((request) => (
                  <div
                    key={request.id}
                    className="p-4 rounded-lg border bg-card"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          {request.order?.order_number && (
                            <OrderNumberBadge orderNumber={request.order.order_number} size="sm" />
                          )}
                          {getStatusBadge(request.status)}
                        </div>
                        <p className="font-medium">{request.order?.product_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {request.order?.customer_name} • {request.order?.customer_company}
                        </p>
                        {request.order?.supplier_name && (
                          <p className="text-sm text-muted-foreground">
                            Supplier: {request.order.supplier_name}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {request.requested_by_name}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(request.created_at), 'dd MMM yyyy, HH:mm')}
                          </span>
                        </div>
                        {request.request_notes && (
                          <p className="text-sm mt-2 p-2 bg-muted/50 rounded text-muted-foreground">
                            <FileText className="h-3 w-3 inline mr-1" />
                            {request.request_notes}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => handleApprove(request)}
                          disabled={actionLoading === request.id}
                        >
                          {actionLoading === request.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              Approve
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openRejectDialog(request)}
                          disabled={actionLoading === request.id}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Recently Approved Requests - Show to all */}
      {approvedRequests.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Approved Payment Statuses
              <Badge variant="secondary">{approvedRequests.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-2">
                {approvedRequests.slice(0, 10).map((request) => (
                  <div
                    key={request.id}
                    className="p-3 rounded-lg border bg-green-500/5"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {request.order?.order_number && (
                            <OrderNumberBadge orderNumber={request.order.order_number} size="sm" />
                          )}
                          <span className="font-medium text-sm">{request.order?.product_name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Requested by {request.requested_by_name}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Approved by {request.approved_by_name}
                        </Badge>
                        {request.approved_at && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(request.approved_at), 'dd MMM yyyy, HH:mm')}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Payment Request</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this payment status request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Rejection Reason *</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter reason for rejection..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleReject}
              disabled={!rejectionReason.trim() || actionLoading === selectedRequest?.id}
            >
              {actionLoading === selectedRequest?.id && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Reject Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
