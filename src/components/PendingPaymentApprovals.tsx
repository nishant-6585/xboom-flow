import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PaymentRecord, usePaymentRecords } from '@/hooks/usePaymentRecords';
import { Order } from '@/hooks/useOrders';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Check, X, Clock, Image, Loader2, ExternalLink, CreditCard, Package, AlertCircle, CheckCircle, Trash2, Undo2, User } from 'lucide-react';

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

const paymentStatusConfig: Record<string, { label: string; className: string }> = {
  pending: {
    label: 'Pending Payment',
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  partial: {
    label: 'Partial Payment',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  },
  full: {
    label: 'Full Payment',
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  },
};

export function PendingPaymentApprovals({ orders }: PendingPaymentApprovalsProps) {
  const { records, loading, approvePayment, rejectPayment, disapprovePayment, deletePaymentRecord } = usePaymentRecords();

  const [selectedRecord, setSelectedRecord] = useState<PaymentRecord | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('pending_payments');
  const [selectedSalesPerson, setSelectedSalesPerson] = useState<string>('all');
  const [salesPersons, setSalesPersons] = useState<{ id: string; name: string }[]>([]);

  const pendingRecords = records.filter(r => r.status === 'pending');
  const approvedRecords = records.filter(r => r.status === 'approved');
  
  // Fetch all sales team members from profiles
  useEffect(() => {
    const fetchSalesPersons = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, name')
        .eq('is_approved', true);
      
      if (!error && data) {
        // Get user roles to filter only sales
        const { data: rolesData } = await supabase
          .from('user_roles')
          .select('user_id, role')
          .eq('role', 'sales');
        
        const salesUserIds = new Set(rolesData?.map(r => r.user_id) || []);
        
        const salesMembers = data
          .filter(p => salesUserIds.has(p.user_id))
          .map(p => ({ id: p.user_id, name: p.name }))
          .sort((a, b) => a.name.localeCompare(b.name));
        
        setSalesPersons(salesMembers);
      }
    };
    
    fetchSalesPersons();
  }, []);

  // Filter approved records by selected sales person
  const filteredApprovedRecords = useMemo(() => {
    if (selectedSalesPerson === 'all') return approvedRecords;
    return approvedRecords.filter(record => {
      const order = orders.find(o => o.id === record.order_id);
      return order?.sales_person_id === selectedSalesPerson;
    });
  }, [approvedRecords, selectedSalesPerson, orders]);
  
  // New orders that need payment attention (pending/partial payment status)
  const ordersNeedingPayment = orders.filter(order => {
    if (order.payment_status === 'full' || order.status === 'cancelled') return false;
    return true;
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

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

  const handleDisapprove = async (record: PaymentRecord) => {
    setActionLoading(record.id);
    await disapprovePayment(record.id);
    setActionLoading(null);
  };

  const getOrderPaymentRecords = (orderId: string) => {
    return records.filter(r => r.order_id === orderId);
  };

  return (
    <>
      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Payment Management
          </CardTitle>
          <CardDescription>
            Track new orders and review payment screenshots submitted by team members
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4 flex-wrap h-auto gap-2">
              <TabsTrigger value="pending_payments" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Pending Approvals
                {pendingRecords.length > 0 && (
                  <Badge variant="destructive" className="ml-1 h-5 min-w-5 p-0 flex items-center justify-center text-xs">
                    {pendingRecords.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="payments_confirmed" className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Payments Confirmed
                {approvedRecords.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 min-w-5 p-0 flex items-center justify-center text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                    {approvedRecords.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="orders_needing_payment" className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                Orders Awaiting Payment
                {ordersNeedingPayment.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 min-w-5 p-0 flex items-center justify-center text-xs">
                    {ordersNeedingPayment.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending_payments">
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
                          {/* Screenshot thumbnails (all uploaded) */}
                          <div className="flex flex-wrap gap-2 shrink-0 max-w-[320px]">
                            {(record.screenshot_signed_urls && record.screenshot_signed_urls.length > 0
                              ? record.screenshot_signed_urls
                              : [record.screenshot_signed_url || record.screenshot_url]
                            ).filter(Boolean).map((url, i) => (
                              <div
                                key={i}
                                className="w-20 h-20 rounded-lg border border-border overflow-hidden cursor-pointer hover:opacity-80 transition-opacity relative"
                                onClick={() => setPreviewImage(url as string)}
                              >
                                <img
                                  src={url as string}
                                  alt={`Payment screenshot ${i + 1}`}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                                {(record.screenshot_signed_urls?.length || 0) > 1 && (
                                  <span className="absolute bottom-0.5 right-0.5 bg-black/70 text-white text-[10px] px-1 rounded">
                                    {i + 1}/{record.screenshot_signed_urls!.length}
                                  </span>
                                )}
                              </div>
                            ))}
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
            </TabsContent>

            <TabsContent value="payments_confirmed">
              {/* Sales Person Filter */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="sales-filter" className="text-sm text-muted-foreground">Filter by Sales Person:</Label>
                </div>
                <Select value={selectedSalesPerson} onValueChange={setSelectedSalesPerson}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All Sales Team" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sales Team</SelectItem>
                    {salesPersons.map((sp) => (
                      <SelectItem key={sp.id} value={sp.id}>{sp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedSalesPerson !== 'all' && (
                  <Button variant="ghost" size="sm" onClick={() => setSelectedSalesPerson('all')}>
                    Clear
                  </Button>
                )}
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredApprovedRecords.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">
                    {selectedSalesPerson === 'all' ? 'No confirmed payments yet' : 'No confirmed payments for this sales person'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredApprovedRecords.map((record) => {
                    const order = getOrderDetails(record.order_id);
                    const config = statusConfig[record.status];

                    return (
                      <div
                        key={record.id}
                        className="p-4 rounded-lg border border-green-500/30 bg-green-900/10"
                      >
                        <div className="flex items-start gap-4">
                          {/* Screenshot thumbnails (all uploaded) */}
                          <div className="flex flex-wrap gap-2 shrink-0 max-w-[320px]">
                            {(record.screenshot_signed_urls && record.screenshot_signed_urls.length > 0
                              ? record.screenshot_signed_urls
                              : [record.screenshot_signed_url || record.screenshot_url]
                            ).filter(Boolean).map((url, i) => (
                              <div
                                key={i}
                                className="w-20 h-20 rounded-lg border border-border overflow-hidden cursor-pointer hover:opacity-80 transition-opacity relative"
                                onClick={() => setPreviewImage(url as string)}
                              >
                                <img
                                  src={url as string}
                                  alt={`Payment screenshot ${i + 1}`}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                                {(record.screenshot_signed_urls?.length || 0) > 1 && (
                                  <span className="absolute bottom-0.5 right-0.5 bg-black/70 text-white text-[10px] px-1 rounded">
                                    {i + 1}/{record.screenshot_signed_urls!.length}
                                  </span>
                                )}
                              </div>
                            ))}
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
                                <p className="text-muted-foreground">
                                  Sales: {order.sales_person_name}
                                </p>
                              </div>
                            )}
                            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                              <span>Submitted: {format(new Date(record.submitted_at), 'dd MMM yyyy, hh:mm a')}</span>
                            </div>
                            {record.reviewed_at && (
                              <p className="text-xs text-green-600 mt-1">
                                Approved by {record.reviewed_by_name || 'Admin'} on {format(new Date(record.reviewed_at), 'dd MMM yyyy, hh:mm a')}
                              </p>
                            )}
                            {record.notes && (
                              <p className="text-sm text-muted-foreground mt-1 italic">
                                "{record.notes}"
                              </p>
                            )}
                          </div>

                          {/* Admin Actions */}
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDisapprove(record)}
                              disabled={actionLoading === record.id}
                              title="Move back to pending"
                            >
                              {actionLoading === record.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Undo2 className="h-4 w-4 mr-1" />
                                  Disapprove
                                </>
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => openDeleteDialog(record)}
                              disabled={actionLoading === record.id}
                              title="Delete payment record"
                            >
                              {actionLoading === record.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="orders_needing_payment">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : ordersNeedingPayment.length === 0 ? (
                <div className="text-center py-8">
                  <Check className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">All orders have full payment</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {ordersNeedingPayment.map((order) => {
                    const orderRecords = getOrderPaymentRecords(order.id);
                    const pendingOrderRecords = orderRecords.filter(r => r.status === 'pending');
                    const approvedOrderRecords = orderRecords.filter(r => r.status === 'approved');
                    const totalApproved = approvedOrderRecords.reduce((sum, r) => sum + r.amount, 0);
                    const paymentConfig = paymentStatusConfig[order.payment_status || 'pending'];

                    return (
                      <div
                        key={order.id}
                        className="p-4 rounded-lg border border-border bg-secondary/30"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <Package className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{order.product_name}</span>
                              <Badge className={paymentConfig.className}>
                                {paymentConfig.label}
                              </Badge>
                            </div>
                            <div className="text-sm space-y-1">
                              <p className="font-medium">
                                {order.customer_name} - {order.customer_company}
                              </p>
                              <p className="text-muted-foreground">
                                Qty: {order.quantity} | Sales Person: {order.sales_person_name}
                              </p>
                            </div>
                            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                              <div>
                                <p className="text-muted-foreground">Total Amount</p>
                                <p className="font-medium">₹{(order.total_sales_amount || 0).toLocaleString('en-IN')}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Amount Paid</p>
                                <p className="font-medium">₹{(order.amount_paid || 0).toLocaleString('en-IN')}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Approved Payments</p>
                                <p className="font-medium text-green-600">₹{totalApproved.toLocaleString('en-IN')}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Pending Approval</p>
                                <p className="font-medium text-yellow-600">
                                  {pendingOrderRecords.length} record{pendingOrderRecords.length !== 1 ? 's' : ''}
                                </p>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              Created {format(new Date(order.created_at), 'dd MMM yyyy, hh:mm a')}
                            </p>
                            
                            {/* Show pending payment records with screenshots */}
                            {pendingOrderRecords.length > 0 && (
                              <div className="mt-4 space-y-3 border-t border-border pt-3">
                                <p className="text-sm font-medium text-yellow-600 flex items-center gap-1">
                                  <Clock className="h-4 w-4" />
                                  Pending Payment Screenshots
                                </p>
                                {pendingOrderRecords.map((record) => (
                                  <div key={record.id} className="flex items-center gap-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                                    <div
                                      className="w-16 h-16 rounded-lg border border-border overflow-hidden shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                                      onClick={() => setPreviewImage(record.screenshot_signed_url || record.screenshot_url)}
                                    >
                                      <img
                                        src={record.screenshot_signed_url || record.screenshot_url}
                                        alt="Payment screenshot"
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-bold text-lg">₹{record.amount.toLocaleString('en-IN')}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {format(new Date(record.submitted_at), 'dd MMM yyyy, hh:mm a')}
                                      </p>
                                      {record.notes && (
                                        <p className="text-xs text-muted-foreground italic mt-1">"{record.notes}"</p>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
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
                                          <>
                                            <Check className="h-4 w-4 mr-1" />
                                            Approve
                                          </>
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          {pendingOrderRecords.length > 0 && (
                            <div className="flex items-center gap-1">
                              <AlertCircle className="h-4 w-4 text-yellow-500" />
                              <span className="text-xs text-yellow-600">Awaiting approval</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Payment Record</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this payment record of ₹{selectedRecord?.amount.toLocaleString('en-IN')}? This action cannot be undone and will also delete the associated screenshots.
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
              Delete Payment
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