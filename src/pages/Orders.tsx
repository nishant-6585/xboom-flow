import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { OrderCard } from '@/components/OrderCard';
import { OrderTable } from '@/components/OrderTable';
import { OrderForm } from '@/components/OrderForm';
import { OrderDialog } from '@/components/OrderDialog';
import { OrderProfitAnalytics } from '@/components/OrderProfitAnalytics';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { RefundRequestsTable } from '@/components/RefundRequestsTable';
import { PipelineOrders } from '@/components/pipeline/PipelineOrders';
import { UnlinkedOrdersWidget } from '@/components/procurement/UnlinkedOrdersWidget';
import { useOrders, Order, ORDER_STATUSES, PAYMENT_STATUSES, ORDER_TYPES, ORDER_OUTCOMES, OrderOutcome, LostReason } from '@/hooks/useOrders';
import { useEnquiries } from '@/hooks/useEnquiries';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Package, Plus, BarChart3, LayoutGrid, Table, RotateCcw, Target, ArrowLeft, Search, Filter, X, ChevronDown, TrendingUp, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { startOfDay, endOfDay, isWithinInterval, startOfMonth } from 'date-fns';
import { Link } from 'react-router-dom';

export default function Orders() {
  const { role, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { orders, loading, createOrder, updateOrder, deleteOrder, escalateOrder } = useOrders();
  const { enquiries } = useEnquiries();
  const { suppliers } = useSuppliers();
  
  // Get filter from URL params
  const enquiryIdFromUrl = searchParams.get('enquiry_id');
  const tabFromUrl = searchParams.get('tab');
  
  const [activeTab, setActiveTab] = useState(tabFromUrl === 'pipeline' ? 'pipeline' : 'list');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentTermsFilter, setPaymentTermsFilter] = useState<string>('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('all');
  const [orderTypeFilter, setOrderTypeFilter] = useState<string>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('all');
  const [salesPersonFilter, setSalesPersonFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  // Update active tab when URL changes
  useEffect(() => {
    if (tabFromUrl === 'pipeline') {
      setActiveTab('pipeline');
    }
  }, [tabFromUrl]);

  // Get unique filter options from orders
  const paymentTermsOptions = [...new Set(orders.map(o => o.payment_terms).filter(Boolean))] as string[];
  const salesPersonOptions = [...new Set(orders.map(o => o.sales_person_name).filter(Boolean))] as string[];

  const canCreateOrder = role === 'sales' || role === 'supply_chain' || role === 'admin';
  const isAdmin = role === 'admin';
  const canViewRefunds = role === 'supply_chain' || role === 'admin';
  const canViewProcurementCosts = role === 'supply_chain' || role === 'admin';
  const canViewProcurementWidget = role === 'admin' || role === 'supply_chain' || role === 'finance';

  const refundCount = orders.filter(o => o.is_refund_requested).length;

  const filteredOrders = orders.filter(o => {
    // If filtering by enquiry_id from URL, only show that order
    if (enquiryIdFromUrl && activeTab === 'list') {
      return o.enquiry_id === enquiryIdFromUrl;
    }
    
    // Search filter - matches order number, product name, customer name/company
    const searchLower = searchQuery.toLowerCase().trim();
    const matchesSearch = searchQuery === '' || 
      (o.order_number?.toLowerCase().includes(searchLower)) ||
      o.product_name.toLowerCase().includes(searchLower) ||
      o.customer_name.toLowerCase().includes(searchLower) ||
      o.customer_company.toLowerCase().includes(searchLower) ||
      o.product_code?.toLowerCase().includes(searchLower);
    
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
    
    return matchesSearch && matchesStatus && matchesPaymentTerms && matchesPaymentStatus && matchesOrderType && matchesOutcome && matchesSalesPerson && matchesDate;
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
    setSearchQuery('');
    // Clear URL params
    setSearchParams({});
  };

  const handleAnalyticsCardClick = (filter: { type: string; value: string }) => {
    // Switch to list tab
    setActiveTab('list');
    
    if (filter.type === 'mtd') {
      // Set date filter to current month
      const now = new Date();
      setStartDate(startOfMonth(now));
      setEndDate(now);
    } else {
      // Clear date filter for "all time" views
      setStartDate(undefined);
      setEndDate(undefined);
    }
    
    // Clear other filters
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

  const [filtersOpen, setFiltersOpen] = useState(false);
  
  // Calculate quick stats
  const stats = {
    total: orders.length,
    poReceived: orders.filter(o => ['po_received', 'payment_received', 'partial_payment_received'].includes(o.status)).length,
    inProgress: orders.filter(o => ['procurement_to_plan', 'procurement_in_process', 'to_ship', 'in_transit'].includes(o.status)).length,
    completed: orders.filter(o => ['delivery_done', 'procurement_done'].includes(o.status)).length,
    paymentPending: orders.filter(o => o.payment_status === 'pending').length,
  };

  const hasActiveFilters = statusFilter !== 'all' || paymentStatusFilter !== 'all' || 
    orderTypeFilter !== 'all' || outcomeFilter !== 'all' || 
    paymentTermsFilter !== 'all' || salesPersonFilter !== 'all' ||
    startDate || endDate || searchQuery;

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-background via-background to-muted/20 flex flex-col">
      <Header />
      <main className="container mx-auto py-4 sm:py-6 px-4 flex-1 overflow-x-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Enhanced Header Section */}
          <div className="mb-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                    <Package className="h-6 w-6" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
                    <p className="text-sm text-muted-foreground">
                      {role === 'sales' ? 'Track your order status and delivery' : 'Manage orders and procurement'}
                    </p>
                  </div>
                </div>
                {enquiryIdFromUrl && (
                  <Link 
                    to="/" 
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mt-2 ml-12"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to Enquiries
                  </Link>
                )}
              </div>
              
              {/* Enhanced Tabs */}
              <TabsList className="bg-muted/50 p-1 h-auto flex-wrap">
                <TabsTrigger value="list" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                  <LayoutGrid className="h-4 w-4" />
                  <span className="hidden sm:inline">Orders</span>
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {filteredOrders.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="pipeline" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                  <Target className="h-4 w-4" />
                  <span className="hidden sm:inline">Pipeline</span>
                </TabsTrigger>
                {canCreateOrder && (
                  <TabsTrigger value="new" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">New Order</span>
                  </TabsTrigger>
                )}
                {canViewRefunds && (
                  <TabsTrigger value="refunds" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                    <RotateCcw className="h-4 w-4" />
                    <span className="hidden sm:inline">Refunds</span>
                    {refundCount > 0 && (
                      <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">
                        {refundCount}
                      </Badge>
                    )}
                  </TabsTrigger>
                )}
                {isAdmin && (
                  <TabsTrigger value="analytics" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                    <BarChart3 className="h-4 w-4" />
                    <span className="hidden sm:inline">Analytics</span>
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            {/* Quick Stats Cards */}
            {activeTab === 'list' && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 border-blue-200/50 dark:border-blue-800/50 cursor-pointer hover:shadow-md transition-all" onClick={() => { setStatusFilter('all'); clearFilters(); }}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-blue-600 dark:text-blue-400">Total Orders</p>
                        <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{stats.total}</p>
                      </div>
                      <div className="p-2 rounded-lg bg-blue-500/10">
                        <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/20 border-amber-200/50 dark:border-amber-800/50 cursor-pointer hover:shadow-md transition-all" onClick={() => setStatusFilter('po_received')}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-amber-600 dark:text-amber-400">PO Received</p>
                        <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{stats.poReceived}</p>
                      </div>
                      <div className="p-2 rounded-lg bg-amber-500/10">
                        <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/30 dark:to-purple-900/20 border-purple-200/50 dark:border-purple-800/50 cursor-pointer hover:shadow-md transition-all" onClick={() => setStatusFilter('in_transit')}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-purple-600 dark:text-purple-400">In Progress</p>
                        <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{stats.inProgress}</p>
                      </div>
                      <div className="p-2 rounded-lg bg-purple-500/10">
                        <TrendingUp className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/20 border-emerald-200/50 dark:border-emerald-800/50 cursor-pointer hover:shadow-md transition-all" onClick={() => setStatusFilter('delivery_done')}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Delivered</p>
                        <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{stats.completed}</p>
                      </div>
                      <div className="p-2 rounded-lg bg-emerald-500/10">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          <TabsContent value="list" className="space-y-4 mt-0">
            {/* Unlinked Orders Widget for procurement team */}
            {canViewProcurementWidget && (
              <div className="mb-4">
                <UnlinkedOrdersWidget maxItems={3} showViewAll={true} />
              </div>
            )}

            {/* Enhanced Search & Filters Section */}
            <Card className="border-dashed">
              <CardContent className="p-4">
                <div className="flex flex-col gap-4">
                  {/* Search and Toggle Row */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <div className="relative flex-1 max-w-md">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search order no, product, customer..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 bg-background"
                      />
                      {searchQuery && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                          onClick={() => setSearchQuery('')}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
                        <CollapsibleTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-2">
                            <Filter className="h-4 w-4" />
                            Filters
                            {hasActiveFilters && (
                              <Badge variant="secondary" className="h-5 px-1.5 text-xs bg-primary/10 text-primary">
                                Active
                              </Badge>
                            )}
                            <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
                          </Button>
                        </CollapsibleTrigger>
                      </Collapsible>
                      
                      {hasActiveFilters && (
                        <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 text-muted-foreground hover:text-foreground">
                          <X className="h-4 w-4" />
                          Clear
                        </Button>
                      )}
                      
                      <div className="flex items-center gap-0.5 border rounded-lg p-0.5 bg-muted/50">
                        <Button
                          variant={viewMode === 'cards' ? 'default' : 'ghost'}
                          size="sm"
                          onClick={() => setViewMode('cards')}
                          className="h-8 w-8 p-0"
                        >
                          <LayoutGrid className="h-4 w-4" />
                        </Button>
                        <Button
                          variant={viewMode === 'table' ? 'default' : 'ghost'}
                          size="sm"
                          onClick={() => setViewMode('table')}
                          className="h-8 w-8 p-0"
                        >
                          <Table className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Collapsible Filters */}
                  <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
                    <CollapsibleContent>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-3 border-t">
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                          <SelectTrigger className="bg-background">
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
                          <SelectTrigger className="bg-background">
                            <SelectValue placeholder="Payment" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Payment Status</SelectItem>
                            {PAYMENT_STATUSES.map(s => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select value={orderTypeFilter} onValueChange={setOrderTypeFilter}>
                          <SelectTrigger className="bg-background">
                            <SelectValue placeholder="Type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Types</SelectItem>
                            {ORDER_TYPES.map(t => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
                          <SelectTrigger className="bg-background">
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
                          <SelectTrigger className="bg-background">
                            <SelectValue placeholder="Terms" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Terms</SelectItem>
                            {paymentTermsOptions.map(term => (
                              <SelectItem key={term} value={term}>{term}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select value={salesPersonFilter} onValueChange={setSalesPersonFilter}>
                          <SelectTrigger className="bg-background">
                            <SelectValue placeholder="Sales Person" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Sales Persons</SelectItem>
                            {salesPersonOptions.map(name => (
                              <SelectItem key={name} value={name}>{name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="mt-3 pt-3 border-t">
                        <DateRangeFilter
                          startDate={startDate}
                          endDate={endDate}
                          onStartDateChange={setStartDate}
                          onEndDateChange={setEndDate}
                          onClear={clearFilters}
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </CardContent>
            </Card>

            {/* Results Section */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                  <Loader2 className="h-10 w-10 animate-spin text-primary relative" />
                </div>
                <p className="mt-4 text-sm text-muted-foreground">Loading orders...</p>
              </div>
            ) : filteredOrders.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="p-4 rounded-full bg-muted mb-4">
                    <Package className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-1">No orders found</h3>
                  <p className="text-muted-foreground text-center max-w-sm">
                    {hasActiveFilters 
                      ? 'Try adjusting your filters to see more orders'
                      : canCreateOrder 
                        ? 'Create your first order to get started'
                        : 'No orders have been assigned to you yet'}
                  </p>
                  {hasActiveFilters && (
                    <Button variant="outline" size="sm" onClick={clearFilters} className="mt-4 gap-2">
                      <X className="h-4 w-4" />
                      Clear Filters
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : viewMode === 'table' ? (
              <Card>
                <CardContent className="p-0">
                  <OrderTable orders={filteredOrders} onOrderClick={handleOrderClick} onUpdateOutcome={handleUpdateOutcome} />
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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

          <TabsContent value="pipeline">
            <PipelineOrders enquiryIdFilter={enquiryIdFromUrl} />
          </TabsContent>

          {canCreateOrder && (
            <TabsContent value="new">
              <OrderForm 
                onSubmit={createOrder}
                enquiries={enquiries}
                suppliers={suppliers}
                showProcurementRate={canViewProcurementCosts}
                userRole={role || 'sales'}
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
              <OrderProfitAnalytics orders={orders} onCardClick={handleAnalyticsCardClick} />
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
