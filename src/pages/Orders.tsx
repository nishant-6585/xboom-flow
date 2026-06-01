import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Package, ArrowLeft } from 'lucide-react';
import { startOfMonth } from 'date-fns';

import { OrderDialog } from '@/components/OrderDialog';
import { OrdersDashboardStats } from '@/components/orders/OrdersDashboardStats';
import { MissingPhoneBanner } from '@/components/orders/MissingPhoneBanner';
import { OrdersExportButton } from '@/components/orders/OrdersExportButton';
import { OrderPipelineAnalytics } from '@/components/orders/OrderPipelineAnalytics';
import { OrdersTabsList } from '@/components/orders/OrdersTabsList';

import OrdersListTab from '@/components/orders/tabs/OrdersListTab';
import OrdersShopifyTab from '@/components/orders/tabs/OrdersShopifyTab';
import OrdersWebsiteTab from '@/components/orders/tabs/OrdersWebsiteTab';
import OrdersPipelineTab from '@/components/orders/tabs/OrdersPipelineTab';
import OrdersNewOrderTab from '@/components/orders/tabs/OrdersNewOrderTab';
import OrdersRefundsTab from '@/components/orders/tabs/OrdersRefundsTab';
import OrdersAnalyticsTab from '@/components/orders/tabs/OrdersAnalyticsTab';
import OrdersSupportCallsTab from '@/components/orders/tabs/OrdersSupportCallsTab';
import OrdersDeletedTab from '@/components/orders/tabs/OrdersDeletedTab';

import { useOrders, Order, OrderOutcome, LostReason } from '@/hooks/useOrders';
import { useShopifyOrders } from '@/hooks/useShopifyOrders';
import { useWooCommerceOrders } from '@/hooks/useWooCommerceOrders';
import { useWooSyncHealth } from '@/hooks/useWooSyncHealth';
import { useNotificationOrderSets } from '@/hooks/useNotificationOrderSets';
import { useEnquiries } from '@/hooks/useEnquiries';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useAuth } from '@/hooks/useAuth';
import { useOrdersFiltering } from '@/hooks/useOrdersFiltering';
import { useWooSyncActions } from '@/hooks/useWooSyncActions';
import { computeWooStats, formatINR, timeAgo } from '@/lib/wooStats';

export default function Orders() {
  const { role, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { orders, loading, createOrder, updateOrder, deleteOrder, escalateOrder } = useOrders();
  const { shopifyOrders, totalCount: shopifyTotalCount, loading: shopifyLoading, refetch: refetchShopifyOrders } = useShopifyOrders();
  const { wooOrders, loading: wooLoading, refetch: refetchWooOrders } = useWooCommerceOrders({ sinceDays: 90 });
  const wooTotalCount = wooOrders.length;
  const wooStats = computeWooStats(wooOrders);
  const { gap: wooGap, wooTotal: wooApiTotal, dbTotal: wooDbTotal, refetch: refetchWooSync } = useWooSyncHealth();
  const {
    failedOrderIds: wooFailedNotifIds, pendingOrderIds: wooPendingNotifIds,
    failedCount: wooFailedNotifCount, pendingCount: wooPendingNotifCount,
    refetch: refetchWooNotifs,
  } = useNotificationOrderSets();
  const { enquiries } = useEnquiries();
  const { suppliers } = useSuppliers();

  const enquiryIdFromUrl = searchParams.get('enquiry_id');
  const tabFromUrl = searchParams.get('tab');
  const preSelectEnquiryId = searchParams.get('preSelectEnquiry');

  const [activeTab, setActiveTab] = useState(tabFromUrl === 'pipeline' ? 'pipeline' : tabFromUrl === 'new' ? 'new' : 'list');

  // Manual / list filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentTermsFilter, setPaymentTermsFilter] = useState('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('all');
  const [orderTypeFilter, setOrderTypeFilter] = useState('all');
  const [outcomeFilter, setOutcomeFilter] = useState('all');
  const [salesPersonFilter, setSalesPersonFilter] = useState('all');
  const [customerTypeFilter, setCustomerTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [sourceFilter, setSourceFilter] = useState<'all' | 'manual' | 'website'>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Dialogs
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedWooOrder, setSelectedWooOrder] = useState<typeof wooOrders[number] | null>(null);
  const [wooDetailOpen, setWooDetailOpen] = useState(false);

  // Shopify
  const [shopifyStatusFilter, setShopifyStatusFilter] = useState('all');
  const [shopifyPaymentStatusFilter, setShopifyPaymentStatusFilter] = useState('all');
  const [shopifySearchQuery, setShopifySearchQuery] = useState('');
  const [shopifyViewMode, setShopifyViewMode] = useState<'cards' | 'table'>('cards');
  const [shopifyStartDate, setShopifyStartDate] = useState<Date | undefined>();
  const [shopifyEndDate, setShopifyEndDate] = useState<Date | undefined>();
  const [shopifyPage, setShopifyPage] = useState(1);
  const SHOPIFY_PAGE_SIZE = 100;

  // Woo
  const [wooSearchQuery, setWooSearchQuery] = useState('');
  const [wooStatusFilter, setWooStatusFilter] = useState('processing');
  const [wooPaymentStatusFilter, setWooPaymentStatusFilter] = useState('all');
  const [wooNotifFilter, setWooNotifFilter] = useState<'all' | 'failed' | 'pending'>('all');
  const [wooViewMode, setWooViewMode] = useState<'cards' | 'table'>('cards');
  const [wooPage, setWooPage] = useState(1);
  const WOO_PAGE_SIZE = 50;

  // Manual pagination
  const [manualPage, setManualPage] = useState(1);
  const MANUAL_PAGE_SIZE = 50;

  // Dashboard widget filters
  const [dashTimePeriod, setDashTimePeriod] = useState<'this_week' | 'this_month' | 'prev_month'>('this_month');
  const [dashSalesPersonFilter, setDashSalesPersonFilter] = useState('all');

  // Side effects
  useEffect(() => {
    const onFocus = () => { refetchWooOrders(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refetchWooOrders]);

  const [, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { setShopifyPage(1); }, [shopifySearchQuery, shopifyStatusFilter, shopifyPaymentStatusFilter, shopifyStartDate, shopifyEndDate]);
  useEffect(() => { setManualPage(1); }, [searchQuery, statusFilter, paymentStatusFilter, orderTypeFilter, outcomeFilter, salesPersonFilter, paymentTermsFilter, customerTypeFilter, categoryFilter, startDate, endDate, sourceFilter]);
  useEffect(() => { setWooPage(1); }, [wooSearchQuery, wooStatusFilter, wooPaymentStatusFilter, wooNotifFilter]);
  useEffect(() => {
    if (tabFromUrl === 'pipeline') setActiveTab('pipeline');
    else if (tabFromUrl === 'new') setActiveTab('new');
  }, [tabFromUrl]);

  // Derived: roles + counts
  const canCreateOrder = role === 'sales' || role === 'sales_manager' || role === 'supply_chain' || role === 'admin';
  const isAdmin = role === 'admin';
  const canViewRefunds = role === 'supply_chain' || role === 'admin';
  const canViewProcurementWidget = role === 'admin' || role === 'supply_chain' || role === 'finance';
  const canViewPipelineAnalytics = role === 'admin' || role === 'finance' || role === 'supply_chain' || role === 'sales_manager';
  const canViewSupportCalls = role === 'supply_chain' || role === 'admin';
  const refundCount = orders.filter(o => o.is_refund_requested).length;

  const paymentTermsOptions = [...new Set(orders.map(o => o.payment_terms).filter(Boolean))] as string[];
  const salesPersonOptions = [...new Set(orders.map(o => o.sales_person_name).filter(Boolean))] as string[];
  const categoryOptions = [...new Set(orders.map(o => o.product_category).filter(Boolean))] as string[];

  // Derived: filtering
  const { filteredOrders, filteredShopifyOrders, filteredWooOrders, unifiedRows } = useOrdersFiltering({
    orders, shopifyOrders, wooOrders,
    wooFailedNotifIds, wooPendingNotifIds,
    enquiryIdFromUrl, activeTab,
    searchQuery, statusFilter, paymentTermsFilter, paymentStatusFilter,
    orderTypeFilter, outcomeFilter, salesPersonFilter, customerTypeFilter, categoryFilter,
    startDate, endDate, sourceFilter,
    shopifySearchQuery, shopifyStatusFilter, shopifyPaymentStatusFilter,
    shopifyStartDate, shopifyEndDate,
    wooSearchQuery, wooStatusFilter, wooPaymentStatusFilter, wooNotifFilter,
  });

  // Pagination
  const manualTotalPages = Math.ceil(filteredOrders.length / MANUAL_PAGE_SIZE);
  const paginatedManualOrders = filteredOrders.slice((manualPage - 1) * MANUAL_PAGE_SIZE, manualPage * MANUAL_PAGE_SIZE);
  const unifiedTotalPages = Math.ceil(unifiedRows.length / MANUAL_PAGE_SIZE);
  const paginatedUnified = unifiedRows.slice((manualPage - 1) * MANUAL_PAGE_SIZE, manualPage * MANUAL_PAGE_SIZE);
  const shopifyTotalPages = Math.ceil(filteredShopifyOrders.length / SHOPIFY_PAGE_SIZE);
  const paginatedShopifyOrders = filteredShopifyOrders.slice((shopifyPage - 1) * SHOPIFY_PAGE_SIZE, shopifyPage * SHOPIFY_PAGE_SIZE);
  const wooTotalPages = Math.ceil(filteredWooOrders.length / WOO_PAGE_SIZE);
  const paginatedWooOrders = filteredWooOrders.slice((wooPage - 1) * WOO_PAGE_SIZE, wooPage * WOO_PAGE_SIZE);

  const hasActiveFilters = statusFilter !== 'all' || paymentStatusFilter !== 'all' ||
    orderTypeFilter !== 'all' || outcomeFilter !== 'all' ||
    paymentTermsFilter !== 'all' || salesPersonFilter !== 'all' ||
    customerTypeFilter !== 'all' || categoryFilter !== 'all' ||
    !!startDate || !!endDate || !!searchQuery;

  const hasActiveShopifyFilters = shopifyStatusFilter !== 'all' || shopifyPaymentStatusFilter !== 'all' ||
    !!shopifyStartDate || !!shopifyEndDate || !!shopifySearchQuery;

  // Handlers
  const clearFilters = () => {
    setStartDate(undefined); setEndDate(undefined);
    setPaymentTermsFilter('all'); setPaymentStatusFilter('all');
    setOrderTypeFilter('all'); setOutcomeFilter('all');
    setSalesPersonFilter('all'); setStatusFilter('all');
    setCustomerTypeFilter('all'); setCategoryFilter('all');
    setSearchQuery(''); setSearchParams({});
  };

  const clearShopifyFilters = () => {
    setShopifyStartDate(undefined); setShopifyEndDate(undefined);
    setShopifyStatusFilter('all'); setShopifyPaymentStatusFilter('all');
    setShopifySearchQuery(''); setShopifyPage(1);
  };

  const handleAnalyticsCardClick = (filter: { type: string; value: string }) => {
    setActiveTab('list');
    if (filter.type === 'mtd') {
      const now = new Date();
      setStartDate(startOfMonth(now)); setEndDate(now);
    } else {
      setStartDate(undefined); setEndDate(undefined);
    }
    setPaymentTermsFilter('all'); setPaymentStatusFilter('all');
    setOrderTypeFilter('all'); setOutcomeFilter('all');
    setSalesPersonFilter('all'); setStatusFilter('all');
    setCustomerTypeFilter('all'); setCategoryFilter('all');
    setSearchQuery(filter.type === 'model' ? filter.value : '');
  };

  const handleUpdateOutcome = async (orderId: string, outcome: OrderOutcome, lostReason?: LostReason, lostReasonNotes?: string) => {
    return updateOrder(orderId, {
      order_outcome: outcome,
      outcome_updated_at: new Date().toISOString(),
      outcome_updated_by: user?.id || null,
      lost_reason: outcome === 'lost' ? (lostReason || null) : null,
      lost_reason_notes: outcome === 'lost' ? (lostReasonNotes || null) : null,
    });
  };

  const handleOrderClick = (order: Order) => { setSelectedOrder(order); setDialogOpen(true); };

  const handleWooOrderClick = (wooOrder: typeof wooOrders[number]) => {
    const mirrored = (orders as any[]).find(
      (o) => (o.source === 'website') && String(o.external_id || '') === String(wooOrder.woo_order_id || ''),
    );
    if (mirrored) { setSelectedOrder(mirrored as Order); setDialogOpen(true); return; }
    setSelectedWooOrder(wooOrder); setWooDetailOpen(true);
  };

  const { wooSyncing, wooBulkRetrying, handleWooManualSync, handleRetryAllFailedWhatsapp } = useWooSyncActions({
    refetchWooOrders, refetchWooSync, refetchWooNotifs,
  });

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-background via-background to-muted/10 flex flex-col">
      <Header />
      <main className="container mx-auto py-4 sm:py-8 px-4 flex-1 overflow-x-hidden">
        <MissingPhoneBanner
          onOpenOrder={(orderId) => {
            const order = orders.find((o) => o.id === orderId);
            if (order) { setSelectedOrder(order); setDialogOpen(true); }
          }}
        />
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="mb-8">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-6">
              <div className="space-y-2">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/25">
                    <Package className="h-7 w-7" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">Orders</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {role === 'sales' ? 'Track your order status and delivery' : 'Manage orders and procurement workflows'}
                    </p>
                  </div>
                </div>
                {enquiryIdFromUrl && (
                  <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors mt-3 ml-16 font-medium">
                    <ArrowLeft className="h-4 w-4" /> Back to Enquiries
                  </Link>
                )}
              </div>
              <OrdersExportButton
                activeTab={activeTab}
                manualOrders={filteredOrders}
                shopifyOrders={filteredShopifyOrders}
                wooOrders={filteredWooOrders}
              />
              <OrdersTabsList
                sourceFilter={sourceFilter}
                filteredOrdersCount={filteredOrders.length}
                wooTotalCount={wooTotalCount}
                shopifyTotalCount={shopifyTotalCount}
                refundCount={refundCount}
                canViewPipelineAnalytics={canViewPipelineAnalytics}
                canCreateOrder={canCreateOrder}
                canViewRefunds={canViewRefunds}
                canViewSupportCalls={canViewSupportCalls}
                isAdmin={isAdmin}
              />
            </div>

          </div>

          <OrdersListTab
            canViewProcurementWidget={canViewProcurementWidget}
            canCreateOrder={canCreateOrder}
            searchQuery={searchQuery} setSearchQuery={setSearchQuery}
            sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
            statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            paymentStatusFilter={paymentStatusFilter} setPaymentStatusFilter={setPaymentStatusFilter}
            orderTypeFilter={orderTypeFilter} setOrderTypeFilter={setOrderTypeFilter}
            outcomeFilter={outcomeFilter} setOutcomeFilter={setOutcomeFilter}
            paymentTermsFilter={paymentTermsFilter} setPaymentTermsFilter={setPaymentTermsFilter}
            salesPersonFilter={salesPersonFilter} setSalesPersonFilter={setSalesPersonFilter}
            customerTypeFilter={customerTypeFilter} setCustomerTypeFilter={setCustomerTypeFilter}
            categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter}
            paymentTermsOptions={paymentTermsOptions}
            salesPersonOptions={salesPersonOptions}
            categoryOptions={categoryOptions}
            hasActiveFilters={hasActiveFilters} clearFilters={clearFilters}
            filtersOpen={filtersOpen} setFiltersOpen={setFiltersOpen}
            startDate={startDate} endDate={endDate}
            setStartDate={setStartDate} setEndDate={setEndDate}
            viewMode={viewMode} setViewMode={setViewMode}
            loading={loading}
            filteredOrders={filteredOrders}
            wooTotalCount={wooTotalCount}
            manualPage={manualPage} setManualPage={setManualPage}
            MANUAL_PAGE_SIZE={MANUAL_PAGE_SIZE}
            manualTotalPages={manualTotalPages}
            paginatedManualOrders={paginatedManualOrders}
            unifiedRows={unifiedRows}
            unifiedTotalPages={unifiedTotalPages}
            paginatedUnified={paginatedUnified}
            handleOrderClick={handleOrderClick}
            handleUpdateOutcome={handleUpdateOutcome}
            handleWooOrderClick={handleWooOrderClick}
            refetchWooOrders={refetchWooOrders}
            refetchWooSync={refetchWooSync}
            dashTimePeriod={dashTimePeriod}
            setDashTimePeriod={setDashTimePeriod}
            dashSalesPersonFilter={dashSalesPersonFilter}
            setDashSalesPersonFilter={setDashSalesPersonFilter}
            selectedWooOrder={selectedWooOrder}
            wooDetailOpen={wooDetailOpen}
            setWooDetailOpen={setWooDetailOpen}
          />

          <OrdersShopifyTab
            isAdmin={isAdmin}
            shopifyTotalCount={shopifyTotalCount}
            shopifyLoading={shopifyLoading}
            filteredShopifyOrders={filteredShopifyOrders}
            paginatedShopifyOrders={paginatedShopifyOrders}
            shopifyTotalPages={shopifyTotalPages}
            SHOPIFY_PAGE_SIZE={SHOPIFY_PAGE_SIZE}
            shopifyPage={shopifyPage} setShopifyPage={setShopifyPage}
            shopifySearchQuery={shopifySearchQuery} setShopifySearchQuery={setShopifySearchQuery}
            shopifyStatusFilter={shopifyStatusFilter} setShopifyStatusFilter={setShopifyStatusFilter}
            shopifyPaymentStatusFilter={shopifyPaymentStatusFilter} setShopifyPaymentStatusFilter={setShopifyPaymentStatusFilter}
            shopifyStartDate={shopifyStartDate} shopifyEndDate={shopifyEndDate}
            setShopifyStartDate={setShopifyStartDate} setShopifyEndDate={setShopifyEndDate}
            shopifyViewMode={shopifyViewMode} setShopifyViewMode={setShopifyViewMode}
            hasActiveShopifyFilters={hasActiveShopifyFilters}
            clearShopifyFilters={clearShopifyFilters}
            refetchShopifyOrders={refetchShopifyOrders}
          />

          <OrdersWebsiteTab
            wooOrders={wooOrders}
            wooLoading={wooLoading}
            wooTotalCount={wooTotalCount}
            wooStats={wooStats}
            wooGap={wooGap}
            wooApiTotal={wooApiTotal}
            wooDbTotal={wooDbTotal}
            wooFailedNotifCount={wooFailedNotifCount}
            wooPendingNotifCount={wooPendingNotifCount}
            filteredWooOrders={filteredWooOrders}
            paginatedWooOrders={paginatedWooOrders}
            wooTotalPages={wooTotalPages}
            WOO_PAGE_SIZE={WOO_PAGE_SIZE}
            wooPage={wooPage} setWooPage={setWooPage}
            wooSearchQuery={wooSearchQuery} setWooSearchQuery={setWooSearchQuery}
            wooStatusFilter={wooStatusFilter} setWooStatusFilter={setWooStatusFilter}
            wooPaymentStatusFilter={wooPaymentStatusFilter} setWooPaymentStatusFilter={setWooPaymentStatusFilter}
            wooNotifFilter={wooNotifFilter} setWooNotifFilter={setWooNotifFilter}
            wooViewMode={wooViewMode} setWooViewMode={setWooViewMode}
            wooSyncing={wooSyncing} wooBulkRetrying={wooBulkRetrying}
            handleWooManualSync={handleWooManualSync}
            handleRetryAllFailedWhatsapp={handleRetryAllFailedWhatsapp}
            handleWooOrderClick={handleWooOrderClick}
            refetchWooOrders={refetchWooOrders}
            refetchWooSync={refetchWooSync}
            selectedWooOrder={selectedWooOrder}
            wooDetailOpen={wooDetailOpen}
            setWooDetailOpen={setWooDetailOpen}
            formatINR={formatINR} timeAgo={timeAgo}
          />

          <OrdersPipelineTab enquiryIdFilter={enquiryIdFromUrl} />

          {canCreateOrder && (
            <OrdersNewOrderTab
              createOrder={createOrder}
              enquiries={enquiries}
              suppliers={suppliers}
              userRole={role || 'sales'}
              preSelectEnquiryId={preSelectEnquiryId}
            />
          )}

          {canViewRefunds && (
            <OrdersRefundsTab orders={orders} onUpdateOrder={updateOrder} />
          )}

          {isAdmin && (
            <OrdersAnalyticsTab orders={orders} onCardClick={handleAnalyticsCardClick} />
          )}

          {canViewPipelineAnalytics && (
            <TabsContent value="pipeline_analytics" className="mt-0">
              <OrderPipelineAnalytics />
            </TabsContent>
          )}

          {canViewSupportCalls && <OrdersSupportCallsTab />}

          <OrdersDeletedTab />
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
