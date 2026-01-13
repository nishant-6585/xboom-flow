import { useState, useMemo } from "react";
import { useOrders, Order } from "@/hooks/useOrders";
import { useSuppliers, Supplier } from "@/hooks/useSuppliers";
import { useProcurementPaymentRequests } from "@/hooks/useProcurementPaymentRequests";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, FileText, ExternalLink, Upload, CreditCard, AlertCircle, CalendarIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ProcurementOrderDialog } from "./ProcurementOrderDialog";
import { PaymentStatusRequestDialog } from "./PaymentStatusRequestDialog";
import { OrderNumberBadge } from "@/components/OrderNumberBadge";

export function ProcurementOrders() {
  const { orders, loading: ordersLoading, updateOrder, refetch } = useOrders();
  const { suppliers, loading: suppliersLoading } = useSuppliers();
  const { requests: paymentRequests, refetch: refetchRequests } = useProcurementPaymentRequests();
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [orderNumberFilter, setOrderNumberFilter] = useState<string>("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paymentRequestDialogOpen, setPaymentRequestDialogOpen] = useState(false);
  const [paymentRequestOrder, setPaymentRequestOrder] = useState<Order | null>(null);
  const [showUnplannedOnly, setShowUnplannedOnly] = useState(false);

  const getPriorityLabel = (priority: number | null) => {
    switch (priority) {
      case 1: return 'Critical';
      case 2: return 'High';
      case 3: return 'Medium';
      case 4: return 'Low';
      default: return 'Medium';
    }
  };

  const getPriorityColor = (priority: number | null) => {
    switch (priority) {
      case 1: return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 2: return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 3: return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 4: return 'bg-green-500/10 text-green-500 border-green-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const categories = useMemo(() => {
    const cats = new Set(orders.map(o => o.product_category).filter(Boolean));
    return Array.from(cats);
  }, [orders]);

  const unplannedCount = useMemo(() => {
    return orders.filter(order => !order.procurement_date).length;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesSearch = 
        order.product_name.toLowerCase().includes(search.toLowerCase()) ||
        order.customer_name.toLowerCase().includes(search.toLowerCase()) ||
        order.customer_company.toLowerCase().includes(search.toLowerCase()) ||
        (order.supplier_name?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
        (order.order_number?.toLowerCase().includes(search.toLowerCase()) ?? false);
      
      const matchesSupplier = supplierFilter === "all" || 
        (supplierFilter === "unassigned" && !order.supplier_name) ||
        order.supplier_name === supplierFilter;
      
      const matchesCategory = categoryFilter === "all" || order.product_category === categoryFilter;
      
      const matchesPriority = priorityFilter === "all" || 
        String(order.priority ?? 3) === priorityFilter;
      
      const matchesOrderNumber = orderNumberFilter === "all" || order.order_number === orderNumberFilter;
      
      const matchesUnplanned = !showUnplannedOnly || !order.procurement_date;
      
      return matchesSearch && matchesSupplier && matchesCategory && matchesPriority && matchesOrderNumber && matchesUnplanned;
    });
  }, [orders, search, supplierFilter, categoryFilter, priorityFilter, orderNumberFilter, showUnplannedOnly]);

  const handleOrderClick = (order: Order) => {
    setSelectedOrder(order);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedOrder(null);
    refetch();
  };

  const handlePaymentRequestClick = (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    setPaymentRequestOrder(order);
    setPaymentRequestDialogOpen(true);
  };

  const handleQuickSetProcurementDate = async (order: Order, date: Date | undefined, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!date) return;
    
    try {
      await updateOrder(order.id, { 
        procurement_date: format(date, 'yyyy-MM-dd') 
      });
      toast.success(`Procurement date set to ${format(date, 'dd MMM yyyy')}`);
      refetch();
    } catch (error) {
      toast.error("Failed to update procurement date");
    }
  };

  const getOrderPaymentRequestStatus = (orderId: string) => {
    const request = paymentRequests.find(r => r.order_id === orderId);
    return request;
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'full': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'partial': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      default: return 'bg-red-500/10 text-red-500 border-red-500/20';
    }
  };

  const getOrderStatusColor = (status: string) => {
    switch (status) {
      case 'delivered': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'in_transit':
      case 'customs': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'procuring': return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      case 'confirmed': return 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20';
      case 'cancelled': return 'bg-red-500/10 text-red-500 border-red-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (ordersLoading || suppliersLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-pulse text-muted-foreground">Loading orders...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Procurement Orders
            </CardTitle>
            <div className="flex items-center gap-2">
              <Switch
                id="unplanned-filter"
                checked={showUnplannedOnly}
                onCheckedChange={setShowUnplannedOnly}
              />
              <Label 
                htmlFor="unplanned-filter" 
                className="flex items-center gap-1.5 cursor-pointer text-sm"
              >
                <AlertCircle className="w-4 h-4 text-orange-500" />
                Unplanned Only
                {unplannedCount > 0 && (
                  <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20 ml-1">
                    {unplannedCount}
                  </Badge>
                )}
              </Label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search orders, order numbers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={orderNumberFilter} onValueChange={setOrderNumberFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by order no" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Orders</SelectItem>
                {orders
                  .filter(o => o.order_number)
                  .sort((a, b) => (b.order_number || '').localeCompare(a.order_number || ''))
                  .map(o => (
                    <SelectItem key={o.id} value={o.order_number!}>
                      {o.order_number} - {o.product_name.substring(0, 20)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by supplier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Suppliers</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {suppliers.map(s => (
                  <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Filter by priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="1">Critical</SelectItem>
                <SelectItem value="2">High</SelectItem>
                <SelectItem value="3">Medium</SelectItem>
                <SelectItem value="4">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order No</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Proc. Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>PO</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      No orders found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((order) => (
                    <TableRow key={order.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleOrderClick(order)}>
                      <TableCell>
                        <OrderNumberBadge orderNumber={order.order_number} />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getPriorityColor(order.priority)}>
                          {getPriorityLabel(order.priority)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{order.product_name}</p>
                          <p className="text-xs text-muted-foreground">{order.product_category}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{order.customer_name}</p>
                          <p className="text-xs text-muted-foreground">{order.customer_company}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {order.supplier_name ? (
                          <div>
                            <p className="font-medium">{order.supplier_name}</p>
                            <p className="text-xs text-muted-foreground">{order.supplier_contact}</p>
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Unassigned
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Popover>
                          <PopoverTrigger asChild>
                            {order.procurement_date ? (
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="h-auto p-1 hover:bg-green-500/20"
                              >
                                <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20 cursor-pointer">
                                  {format(new Date(order.procurement_date), 'dd MMM')}
                                </Badge>
                              </Button>
                            ) : (
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="h-auto p-1 hover:bg-orange-500/20"
                              >
                                <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20 cursor-pointer flex items-center gap-1">
                                  <CalendarIcon className="w-3 h-3" />
                                  Set Date
                                </Badge>
                              </Button>
                            )}
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={order.procurement_date ? new Date(order.procurement_date) : undefined}
                              onSelect={(date) => handleQuickSetProcurementDate(order, date, { stopPropagation: () => {} } as React.MouseEvent)}
                              initialFocus
                              className={cn("p-3 pointer-events-auto")}
                            />
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getOrderStatusColor(order.status)}>
                          {order.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getPaymentStatusColor(order.payment_status)}>
                          {order.payment_status}
                        </Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {(order as any).po_url ? (
                          <a 
                            href={(order as any).po_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {(() => {
                          const paymentRequest = getOrderPaymentRequestStatus(order.id);
                          if (paymentRequest?.status === 'approved') {
                            return (
                              <div className="flex flex-col items-end gap-0.5">
                                <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20 text-xs">
                                  ✓ {paymentRequest.approved_by_name}
                                </Badge>
                                {paymentRequest.approved_at && (
                                  <span className="text-[10px] text-muted-foreground">
                                    {format(new Date(paymentRequest.approved_at), 'dd MMM, HH:mm')}
                                  </span>
                                )}
                              </div>
                            );
                          } else if (paymentRequest?.status === 'pending') {
                            return (
                              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 text-xs">
                                Pending Approval
                              </Badge>
                            );
                          } else {
                            return (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={(e) => handlePaymentRequestClick(order, e)}
                                className="text-xs"
                              >
                                <CreditCard className="w-3 h-3 mr-1" />
                                Request
                              </Button>
                            );
                          }
                        })()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <ProcurementOrderDialog
        order={selectedOrder}
        suppliers={suppliers}
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        onUpdate={updateOrder}
      />

      {paymentRequestOrder && (
        <PaymentStatusRequestDialog
          orderId={paymentRequestOrder.id}
          orderNumber={paymentRequestOrder.order_number}
          productName={paymentRequestOrder.product_name}
          open={paymentRequestDialogOpen}
          onOpenChange={setPaymentRequestDialogOpen}
          onSuccess={() => refetchRequests()}
        />
      )}
    </div>
  );
}
