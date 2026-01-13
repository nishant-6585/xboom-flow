import { useState } from 'react';
import { Header } from '@/components/Header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { OrderCard } from '@/components/OrderCard';
import { OrderTable } from '@/components/OrderTable';
import { OrderForm } from '@/components/OrderForm';
import { OrderDialog } from '@/components/OrderDialog';
import { OrderProfitAnalytics } from '@/components/OrderProfitAnalytics';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { RefundRequestsTable } from '@/components/RefundRequestsTable';
import { useOrders, Order, ORDER_STATUSES, PAYMENT_STATUSES, ORDER_TYPES, ORDER_OUTCOMES, OrderOutcome, LostReason } from '@/hooks/useOrders';
import { useEnquiries } from '@/hooks/useEnquiries';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Package, Plus, BarChart3, LayoutGrid, Table, RotateCcw } from 'lucide-react';
import { startOfDay, endOfDay, isWithinInterval } from 'date-fns';

export default function Orders() {
  const { role, user } = useAuth();
  const { orders, loading, createOrder, updateOrder, deleteOrder, escalateOrder } = useOrders();
  const { enquiries } = useEnquiries();
  const { suppliers } = useSuppliers();
  
  const [activeTab, setActiveTab] = useState('list');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentTermsFilter, setPaymentTermsFilter] = useState<string>('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('all');
  const [orderTypeFilter, setOrderTypeFilter] = useState<string>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('all');
  const [salesPersonFilter, setSalesPersonFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  // Get unique filter options from orders
  const paymentTermsOptions = [...new Set(orders.map(o => o.payment_terms).filter(Boolean))] as string[];
  const salesPersonOptions = [...new Set(orders.map(o => o.sales_person_name).filter(Boolean))] as string[];

  const canCreateOrder = role === 'sales' || role === 'supply_chain' || role === 'admin';
  const isAdmin = role === 'admin';
  const canViewRefunds = role === 'supply_chain' || role === 'admin';
  const canViewProcurementCosts = role === 'supply_chain' || role === 'admin';

  const refundCount = orders.filter(o => o.is_refund_requested).length;

  const filteredOrders = orders.filter(o => {
    const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
    const matchesPaymentTerms = paymentTermsFilter === 'all' || o.payment_terms === paymentTermsFilter;
    const matchesPaymentStatus = paymentStatusFilter === 'all' || o.payment_status === paymentStatusFilter;
    const matchesOrderType = orderTypeFilter === 'all' || o.order_type === orderTypeFilter;
    const matchesOutcome = outcomeFilter === 'all' || o.order_outcome === outcomeFilter;
    const matchesSalesPerson = salesPersonFilter === 'all' || o.sales_person_name === salesPersonFilter;
    
    const orderDate = new Date(o.created_at);
    let matchesDate = true;
    if (startDate && endDate) {
      matchesDate = isWithinInterval(orderDate, { start: startOfDay(startDate), end: endOfDay(endDate) });
    } else if (startDate) {
      matchesDate = orderDate >= startOfDay(startDate);
    } else if (endDate) {
      matchesDate = orderDate <= endOfDay(endDate);
    }
    
    return matchesStatus && matchesPaymentTerms && matchesPaymentStatus && matchesOrderType && matchesOutcome && matchesSalesPerson && matchesDate;
  });

  const clearFilters = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setPaymentTermsFilter('all');
    setPaymentStatusFilter('all');
    setOrderTypeFilter('all');
    setOutcomeFilter('all');
    setSalesPersonFilter('all');
    setStatusFilter('all');
  };

  const handleUpdateOutcome = async (orderId: string, outcome: OrderOutcome, lostReason?: LostReason, lostReasonNotes?: string): Promise<boolean> => {
    const updates: Partial<Order> = {
      order_outcome: outcome,
      outcome_updated_at: new Date().toISOString(),
      outcome_updated_by: user?.id || null,
      lost_reason: outcome === 'lost' ? (lostReason || null) : null,
      lost_reason_notes: outcome === 'lost' ? (lostReasonNotes || null) : null,
    };
    return updateOrder(orderId, updates);
  };

  const handleOrderClick = (order: Order) => {
    setSelectedOrder(order);
    setDialogOpen(true);
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <Header />
      <main className="container mx-auto py-4 sm:py-6 px-4 flex-1 overflow-x-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Package className="h-6 w-6" />
                Orders
              </h1>
              <p className="text-muted-foreground">
                {role === 'sales' ? 'Track your order status and delivery' : 'Manage orders and procurement'}
              </p>
            </div>
            <TabsList>
              <TabsTrigger value="list">Order List</TabsTrigger>
              {canCreateOrder && (
                <TabsTrigger value="new" className="gap-1">
                  <Plus className="h-4 w-4" />
                  New Order
                </TabsTrigger>
              )}
              {canViewRefunds && (
                <TabsTrigger value="refunds" className="gap-1">
                  <RotateCcw className="h-4 w-4" />
                  Refunds
                  {refundCount > 0 && (
                    <span className="ml-1 rounded-full bg-destructive px-2 py-0.5 text-xs text-destructive-foreground">
                      {refundCount}
                    </span>
                  )}
                </TabsTrigger>
              )}
              {isAdmin && (
                <TabsTrigger value="analytics" className="gap-1">
                  <BarChart3 className="h-4 w-4" />
                  Analytics
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <TabsContent value="list" className="space-y-4">
            {/* Filters and View Toggle */}
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {ORDER_STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Payment Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Payment Status</SelectItem>
                    {PAYMENT_STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={orderTypeFilter} onValueChange={setOrderTypeFilter}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue placeholder="Order Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {ORDER_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue placeholder="Outcome" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Outcomes</SelectItem>
                    {ORDER_OUTCOMES.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={paymentTermsFilter} onValueChange={setPaymentTermsFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Payment Terms" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Terms</SelectItem>
                    {paymentTermsOptions.map(term => (
                      <SelectItem key={term} value={term}>{term}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={salesPersonFilter} onValueChange={setSalesPersonFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Sales Person" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sales Persons</SelectItem>
                    {salesPersonOptions.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <DateRangeFilter
                  startDate={startDate}
                  endDate={endDate}
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                  onClear={clearFilters}
                />
              </div>
              <div className="flex items-center gap-1 border rounded-md p-1">
                <Button
                  variant={viewMode === 'cards' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('cards')}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'table' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('table')}
                >
                  <Table className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-center py-12">
                <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No orders found</h3>
                <p className="text-muted-foreground">
                  {statusFilter !== 'all' 
                    ? 'Try changing the filter to see more orders'
                    : canCreateOrder 
                      ? 'Create your first order to get started'
                      : 'No orders have been assigned to you yet'}
                </p>
              </div>
            ) : viewMode === 'table' ? (
              <OrderTable orders={filteredOrders} onOrderClick={handleOrderClick} onUpdateOutcome={handleUpdateOutcome} />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredOrders.map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onClick={() => handleOrderClick(order)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {canCreateOrder && (
            <TabsContent value="new">
              <OrderForm 
                onSubmit={createOrder}
                enquiries={enquiries}
                suppliers={suppliers}
                showProcurementRate={canViewProcurementCosts}
              />
            </TabsContent>
          )}

          {canViewRefunds && (
            <TabsContent value="refunds">
              <RefundRequestsTable orders={orders} onUpdateOrder={updateOrder} />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="analytics">
              <OrderProfitAnalytics orders={orders} />
            </TabsContent>
          )}
        </Tabs>

        <OrderDialog
          order={selectedOrder}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onUpdate={updateOrder}
          onDelete={deleteOrder}
          onEscalate={escalateOrder}
        />
      </main>
    </div>
  );
}
