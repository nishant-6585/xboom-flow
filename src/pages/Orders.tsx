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
import { WooOrderCard } from '@/components/orders/WooOrderCard';
import { WooSyncHealthCard } from '@/components/orders/WooSyncHealthCard';
import { WooOrderDetailDialog } from '@/components/orders/WooOrderDetailDialog';
import { ShopifyOrderDetailDialog } from '@/components/orders/ShopifyOrderDetailDialog';
import { useWooSyncHealth } from '@/hooks/useWooSyncHealth';
import { useNotificationOrderSets } from '@/hooks/useNotificationOrderSets';
import { UnlinkedOrdersWidget } from '@/components/procurement/UnlinkedOrdersWidget';
import { CallLogsPanel } from '@/components/admin/CallLogsPanel';
import { SupportCallsDashboard } from '@/components/orders/SupportCallsDashboard';
import { DeletedOrdersTab } from '@/components/orders/DeletedOrdersTab';
import { useOrders, Order, ORDER_STATUSES, PAYMENT_STATUSES, ORDER_TYPES, ORDER_OUTCOMES, CUSTOMER_TYPES, OrderOutcome, LostReason } from '@/hooks/useOrders';
import { useShopifyOrders } from '@/hooks/useShopifyOrders';
import { useWooCommerceOrders } from '@/hooks/useWooCommerceOrders';
import { isWooOrderStatus } from '@/lib/wooOrderStatuses';
import { WOO_STATUS_OPTIONS } from '@/components/orders/WooOrderStatusActions';
import { ShopifyPipelineWidget } from '@/components/shopify/ShopifyPipelineWidget';
import { useEnquiries } from '@/hooks/useEnquiries';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Package, Plus, BarChart3, LayoutGrid, Table, RotateCcw, Target, ArrowLeft, Search, Filter, X, ChevronDown, TrendingUp, Clock, CheckCircle2, ShoppingBag, Globe, ShoppingCart, RefreshCw, Phone, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { startOfDay, endOfDay, isWithinInterval, startOfMonth } from 'date-fns';
import { Link } from 'react-router-dom';
import { OrdersDashboardStats } from '@/components/orders/OrdersDashboardStats';
import { MissingPhoneBanner } from '@/components/orders/MissingPhoneBanner';
import { OrdersExportButton } from '@/components/orders/OrdersExportButton';
import { OrderPipelineAnalytics } from '@/components/orders/OrderPipelineAnalytics';

export default function Orders() {
  const { role, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { orders, loading, createOrder, updateOrder, deleteOrder, escalateOrder } = useOrders();
  const { shopifyOrders, totalCount: shopifyTotalCount, loading: shopifyLoading, refetch: refetchShopifyOrders } = useShopifyOrders();
  const {
    wooOrders: wooOrdersAll,
    loading: wooLoading,
    refetch: refetchWooOrders,
  } = useWooCommerceOrders({ sinceDays: 90 });

  // Use the full WooCommerce dataset for both the unified All Orders view and
  // the Website Orders tab. Per the 2026-05-26 product update users want
  // visibility (and the ability to push status changes) for every Woo status,
  // not just the curated order-only subset.
  const wooOrders = wooOrdersAll;
  const wooTotalCount = wooOrders.length;

  // Recompute stats from the order-only subset so dashboards on the Orders
  // page never include lead-status rows.
  const wooStats = (() => {
    const SUCCESS = ['completed', 'delivered'];
    const statusCounts: Record<string, number> = {};
    let successCount = 0, processingCount = 0;
    let totalRevenue = 0, completedRevenue = 0;
    let lastSyncedAtMs = 0;
    let lastSyncedAt: string | null = null;
    let todayOrders = 0;
    const todayStr = new Date().toDateString();
    for (const o of wooOrders) {
      const s = (o.order_status || 'unknown').toLowerCase();
      statusCounts[s] = (statusCounts[s] || 0) + 1;
      const amount = Number(o.total_sales_amount) || 0;
      totalRevenue += amount;
      if (SUCCESS.includes(s)) { completedRevenue += amount; successCount++; }
      if (s === 'processing') processingCount++;
      const t = o.woo_updated_at || o.updated_at || o.created_at;
      if (t) {
        const ms = new Date(t).getTime();
        if (ms > lastSyncedAtMs) { lastSyncedAtMs = ms; lastSyncedAt = t; }
      }
      const d = o.woo_created_at || o.created_at;
      if (d && new Date(d).toDateString() === todayStr) todayOrders++;
    }
    return {
      totalOrders: wooOrders.length,
      statusCounts,
      grouped: {
        success: successCount,
        failed: 0,
        pending: 0,
        processing: processingCount,
      },
      revenue: { total: totalRevenue, completed: completedRevenue, lost: 0 },
      lastSyncedAt,
      completedOrders: statusCounts['completed'] || 0,
      processingOrders: statusCounts['processing'] || 0,
      pendingOrders: 0,
      failedOrders: 0,
      cancelledOrders: 0,
      todayOrders,
    };
  })();
  const { gap: wooGap, wooTotal: wooApiTotal, dbTotal: wooDbTotal, refetch: refetchWooSync } = useWooSyncHealth();
  const {
    failedOrderIds: wooFailedNotifIds,
    pendingOrderIds: wooPendingNotifIds,
    failedCount: wooFailedNotifCount,
    pendingCount: wooPendingNotifCount,
    refetch: refetchWooNotifs,
  } = useNotificationOrderSets();
  const [wooBulkRetrying, setWooBulkRetrying] = useState(false);
  const [wooNotifFilter, setWooNotifFilter] = useState<'all' | 'failed' | 'pending'>('all');
  const [selectedWooOrder, setSelectedWooOrder] = useState<typeof wooOrders[number] | null>(null);
  const [wooDetailOpen, setWooDetailOpen] = useState(false);
  const { enquiries } = useEnquiries();
  const { suppliers } = useSuppliers();
  
  // Get filter from URL params
  const enquiryIdFromUrl = searchParams.get('enquiry_id');
  const tabFromUrl = searchParams.get('tab');
  
  const preSelectEnquiryId = searchParams.get('preSelectEnquiry');
  const [activeTab, setActiveTab] = useState(tabFromUrl === 'pipeline' ? 'pipeline' : tabFromUrl === 'new' ? 'new' : 'list');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentTermsFilter, setPaymentTermsFilter] = useState<string>('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('all');
  const [orderTypeFilter, setOrderTypeFilter] = useState<string>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('all');
  const [salesPersonFilter, setSalesPersonFilter] = useState<string>('all');
  const [customerTypeFilter, setCustomerTypeFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [supportCallLogs, setSupportCallLogs] = useState<any[]>([]);

  // Shopify tab filters
  const [shopifyStatusFilter, setShopifyStatusFilter] = useState<string>('all');
  const [shopifyPaymentStatusFilter, setShopifyPaymentStatusFilter] = useState<string>('all');
  const [shopifySearchQuery, setShopifySearchQuery] = useState<string>('');
  const [shopifyViewMode, setShopifyViewMode] = useState<'cards' | 'table'>('cards');
  const [shopifyStartDate, setShopifyStartDate] = useState<Date | undefined>(undefined);
  const [shopifyEndDate, setShopifyEndDate] = useState<Date | undefined>(undefined);
  const [shopifyPage, setShopifyPage] = useState(1);
  const SHOPIFY_PAGE_SIZE = 100;
  const [shopifyFiltersOpen, setShopifyFiltersOpen] = useState(false);
  const [selectedShopifyOrder, setSelectedShopifyOrder] = useState<typeof shopifyOrders[number] | null>(null);
  const [shopifyDetailOpen, setShopifyDetailOpen] = useState(false);

  // Website (WooCommerce) tab filters
  const [wooSearchQuery, setWooSearchQuery] = useState<string>('');
  const [wooStatusFilter, setWooStatusFilter] = useState<string>('processing');
  const [wooPaymentStatusFilter, setWooPaymentStatusFilter] = useState<string>('all');
  const [wooViewMode, setWooViewMode] = useState<'cards' | 'table'>('cards');
  const [wooPage, setWooPage] = useState(1);
  const WOO_PAGE_SIZE = 50;
  const [wooSyncing, setWooSyncing] = useState(false);

  // All Orders unified tab — source filter
  const [sourceFilter, setSourceFilter] = useState<'all' | 'manual' | 'website'>('all');

  // Refetch both datasets when user returns to the tab/window so Woo→our-system
  // status changes show up without a manual reload.
  useEffect(() => {
    const onFocus = () => {
      refetchWooOrders();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refetchWooOrders]);

  // Tick every 60s so the "last synced" relative label stays fresh
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Manual orders pagination
  const [manualPage, setManualPage] = useState(1);
  const MANUAL_PAGE_SIZE = 50;

  // Reset shopify page when filters/search change
  useEffect(() => { setShopifyPage(1); }, [shopifySearchQuery, shopifyStatusFilter, shopifyPaymentStatusFilter, shopifyStartDate, shopifyEndDate]);

  // Reset manual page when filters/search change
  useEffect(() => { setManualPage(1); }, [searchQuery, statusFilter, paymentStatusFilter, orderTypeFilter, outcomeFilter, salesPersonFilter, paymentTermsFilter, customerTypeFilter, categoryFilter, startDate, endDate, sourceFilter]);

  // Reset woo page when filters change
  useEffect(() => { setWooPage(1); }, [wooSearchQuery, wooStatusFilter, wooPaymentStatusFilter, wooNotifFilter]);

  useEffect(() => {
    if (tabFromUrl === 'pipeline') {
      setActiveTab('pipeline');
    } else if (tabFromUrl === 'new') {
      setActiveTab('new');
    }
  }, [tabFromUrl]);

  // Get unique filter options from orders (manual orders only)
  const paymentTermsOptions = [...new Set(orders.map(o => o.payment_terms).filter(Boolean))] as string[];
  const salesPersonOptions = [...new Set(orders.map(o => o.sales_person_name).filter(Boolean))] as string[];
  const categoryOptions = [...new Set(orders.map(o => o.product_category).filter(Boolean))] as string[];

  const canCreateOrder = role === 'sales' || role === 'sales_manager' || role === 'supply_chain' || role === 'admin';
  const isAdmin = role === 'admin';
  const canViewRefunds = role === 'supply_chain' || role === 'admin';
  const canViewProcurementWidget = role === 'admin' || role === 'supply_chain' || role === 'finance';
  const canViewPipelineAnalytics =
    role === 'admin' || role === 'finance' || role === 'supply_chain' || role === 'sales_manager';
  const refundCount = orders.filter(o => o.is_refund_requested).length;

  // All orders from useOrders are manual/Xboom orders (no shopify mixing)
  const manualOrders = orders;

  const filteredOrders = manualOrders.filter(o => {
    // If filtering by enquiry_id from URL, only show that order
    if (enquiryIdFromUrl && activeTab === 'list') {
      return o.enquiry_id === enquiryIdFromUrl;
    }
    
    // Search filter - matches order number, product name, customer name/company
    const searchLower = searchQuery.toLowerCase().trim();
    const matchesSearch = searchQuery === '' || 
      (o.order_number?.toLowerCase().includes(searchLower)) ||
      (o.product_name?.toLowerCase().includes(searchLower) ?? false) ||
      (o.customer_name?.toLowerCase().includes(searchLower) ?? false) ||
      (o.customer_company?.toLowerCase().includes(searchLower) ?? false) ||
      (o.product_code?.toLowerCase().includes(searchLower) ?? false);
    
    const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
    const matchesPaymentTerms = paymentTermsFilter === 'all' || o.payment_terms === paymentTermsFilter;
    const matchesPaymentStatus = paymentStatusFilter === 'all' || o.payment_status === paymentStatusFilter;
    const matchesOrderType = orderTypeFilter === 'all' || o.order_type === orderTypeFilter;
    const matchesOutcome = outcomeFilter === 'all' || o.order_outcome === outcomeFilter;
    const matchesSalesPerson = salesPersonFilter === 'all' || o.sales_person_name === salesPersonFilter;
    const matchesCustomerType = customerTypeFilter === 'all' || o.customer_type === customerTypeFilter;
    const matchesCategory = categoryFilter === 'all' || o.product_category === categoryFilter;
    
    const orderDate = new Date(o.order_date || o.created_at);
    let matchesDate = true;
    if (startDate && endDate) {
      matchesDate = isWithinInterval(orderDate, { start: startOfDay(startDate), end: endOfDay(endDate) });
    } else if (startDate) {
      matchesDate = orderDate >= startOfDay(startDate);
    } else if (endDate) {
      matchesDate = orderDate <= endOfDay(endDate);
    }
    
    return matchesSearch && matchesStatus && matchesPaymentTerms && matchesPaymentStatus && matchesOrderType && matchesOutcome && matchesSalesPerson && matchesCustomerType && matchesCategory && matchesDate;
  });

  const filteredShopifyOrders = shopifyOrders.filter(o => {
    const searchLower = shopifySearchQuery.toLowerCase().trim();
    const matchesSearch = shopifySearchQuery === '' || 
      (o.order_number?.toLowerCase().includes(searchLower)) ||
      (o.product_name?.toLowerCase().includes(searchLower) ?? false) ||
      (o.customer_name?.toLowerCase().includes(searchLower) ?? false) ||
      (o.customer_company?.toLowerCase().includes(searchLower) ?? false) ||
      (o.product_code?.toLowerCase().includes(searchLower) ?? false);
    
    const matchesStatus = shopifyStatusFilter === 'all' || o.order_status === shopifyStatusFilter;
    const matchesPaymentStatus = shopifyPaymentStatusFilter === 'all' || o.payment_status === shopifyPaymentStatusFilter;
    
    const orderDate = new Date(o.created_at);
    let matchesDate = true;
    if (shopifyStartDate && shopifyEndDate) {
      matchesDate = isWithinInterval(orderDate, { start: startOfDay(shopifyStartDate), end: endOfDay(shopifyEndDate) });
    } else if (shopifyStartDate) {
      matchesDate = orderDate >= startOfDay(shopifyStartDate);
    } else if (shopifyEndDate) {
      matchesDate = orderDate <= endOfDay(shopifyEndDate);
    }
    
    return matchesSearch && matchesStatus && matchesPaymentStatus && matchesDate;
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
    setCustomerTypeFilter('all');
    setCategoryFilter('all');
    setSearchQuery('');
    // Clear URL params
    setSearchParams({});
  };

  const clearShopifyFilters = () => {
    setShopifyStartDate(undefined);
    setShopifyEndDate(undefined);
    setShopifyStatusFilter('all');
    setShopifyPaymentStatusFilter('all');
    setShopifySearchQuery('');
    setShopifyPage(1);
  };

  const manualTotalPages = Math.ceil(filteredOrders.length / MANUAL_PAGE_SIZE);
  const paginatedManualOrders = filteredOrders.slice(
    (manualPage - 1) * MANUAL_PAGE_SIZE,
    manualPage * MANUAL_PAGE_SIZE
  );

  // Unified All-Orders list: tag each row by source so we can render either
  // an OrderCard (manual) or a WooOrderCard (website) from one paginated array.
  type UnifiedRow =
    | { kind: 'manual'; date: number; row: typeof orders[number] }
    | { kind: 'woo'; date: number; row: typeof wooOrders[number] };

  const unifiedRows: UnifiedRow[] = (() => {
    const rows: UnifiedRow[] = [];
    if (sourceFilter !== 'website') {
      for (const o of filteredOrders) {
        const d = new Date(o.order_date || o.created_at).getTime() || 0;
        rows.push({ kind: 'manual', date: d, row: o });
      }
    }
    if (sourceFilter !== 'manual') {
      // Website rows: respect the page-level search + date filters only.
      // Per 2026-05-26 product update: All Orders only shows the fulfilled
      // lifecycle for website orders (processing → on-hold → completed →
      // delivered). Pending, cancelled, failed, refunded are excluded:
      // pending lives in Website Orders tab; cancelled/failed/refunded
      // route to Sales > Leads > Xboom Website.
      const ALL_ORDERS_WEBSITE_STATUSES = new Set([
        'processing', 'on-hold', 'shipped', 'completed', 'delivered',
      ]);
      const searchLower = searchQuery.toLowerCase().trim();
      for (const o of wooOrders) {
        const s = (o.order_status || '').toLowerCase();
        if (!ALL_ORDERS_WEBSITE_STATUSES.has(s)) continue;
        if (searchLower) {
          const hit =
            (o.order_number?.toLowerCase().includes(searchLower)) ||
            (o.woo_order_id?.toLowerCase().includes(searchLower) ?? false) ||
            (o.product_name?.toLowerCase().includes(searchLower) ?? false) ||
            (o.customer_name?.toLowerCase().includes(searchLower) ?? false) ||
            (o.customer_email?.toLowerCase().includes(searchLower) ?? false);
          if (!hit) continue;
        }
        const dIso = o.woo_created_at || o.created_at;
        const d = dIso ? new Date(dIso).getTime() : 0;
        if (startDate && d < startOfDay(startDate).getTime()) continue;
        if (endDate && d > endOfDay(endDate).getTime()) continue;
        rows.push({ kind: 'woo', date: d, row: o });
      }
    }
    rows.sort((a, b) => b.date - a.date);
    return rows;
  })();

  const unifiedTotalPages = Math.ceil(unifiedRows.length / MANUAL_PAGE_SIZE);
  const paginatedUnified = unifiedRows.slice(
    (manualPage - 1) * MANUAL_PAGE_SIZE,
    manualPage * MANUAL_PAGE_SIZE
  );

  const shopifyTotalPages = Math.ceil(filteredShopifyOrders.length / SHOPIFY_PAGE_SIZE);
  const paginatedShopifyOrders = filteredShopifyOrders.slice(
    (shopifyPage - 1) * SHOPIFY_PAGE_SIZE,
    shopifyPage * SHOPIFY_PAGE_SIZE
  );

  // WooCommerce filtered orders
  // Website Orders tab → all WooCommerce orders, filtered by status
  // Per 2026-05-26 product update: Website Orders tab only surfaces
  // processing + pending orders. Cancelled / failed / refunded / completed
  // belong elsewhere (Sales > Leads > Xboom Website for cancelled/failed/
  // refunded; All Orders shows the fulfilled lifecycle).
  const WEBSITE_TAB_STATUSES = ['processing', 'pending', 'shipped'] as const;
  const filteredWooOrders = wooOrders.filter(o => {
    const searchLower = wooSearchQuery.toLowerCase().trim();
    const matchesSearch = wooSearchQuery === '' ||
      (o.order_number?.toLowerCase().includes(searchLower)) ||
      (o.woo_order_id?.toLowerCase().includes(searchLower) ?? false) ||
      (o.product_name?.toLowerCase().includes(searchLower) ?? false) ||
      (o.customer_name?.toLowerCase().includes(searchLower) ?? false) ||
      (o.customer_email?.toLowerCase().includes(searchLower) ?? false);
    // Status filter supports both raw statuses and grouped buckets (success/failed/pending)
    const status = (o.order_status || '').toLowerCase();
    // Hard restrict to processing + pending; the dropdown only exposes these.
    if (!(WEBSITE_TAB_STATUSES as readonly string[]).includes(status)) return false;
    const matchesStatus =
      wooStatusFilter === 'all' ? true : status === wooStatusFilter;
    const matchesPayment = wooPaymentStatusFilter === 'all' || o.payment_status === wooPaymentStatusFilter;
    const matchesNotif =
      wooNotifFilter === 'all'
        ? true
        : wooNotifFilter === 'failed'
          ? wooFailedNotifIds.has(o.woo_order_id)
          : wooPendingNotifIds.has(o.woo_order_id);
    return matchesSearch && matchesStatus && matchesPayment && matchesNotif;
  });

  const wooTotalPages = Math.ceil(filteredWooOrders.length / WOO_PAGE_SIZE);
  const paginatedWooOrders = filteredWooOrders.slice(
    (wooPage - 1) * WOO_PAGE_SIZE,
    wooPage * WOO_PAGE_SIZE
  );

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
    setCustomerTypeFilter('all');
    setCategoryFilter('all');

    // For model filter, set search query to model name
    if (filter.type === 'model') {
      setSearchQuery(filter.value);
    } else {
      setSearchQuery('');
    }
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

  /**
   * Open a WooCommerce (website) order in the standard OrderDialog so it
   * surfaces ALL fields available on a manual order (line items, payments,
   * supplier, tracking, invoices, edit history, etc.). Website orders are
   * mirrored into the internal `orders` table by woo-mirror, keyed on
   * `external_id == woo_order_id`. If a mirror row is missing (legacy /
   * outside ingestion window), fall back to the lightweight Woo dialog.
   */
  const handleWooOrderClick = (wooOrder: typeof wooOrders[number]) => {
    const mirrored = (orders as any[]).find(
      (o) => (o.source === 'website') && String(o.external_id || '') === String(wooOrder.woo_order_id || ''),
    );
    if (mirrored) {
      setSelectedOrder(mirrored as Order);
      setDialogOpen(true);
      return;
    }
    setSelectedWooOrder(wooOrder);
    setWooDetailOpen(true);
  };

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dashTimePeriod, setDashTimePeriod] = useState<"this_week" | "this_month" | "prev_month">("this_month");
  const [dashSalesPersonFilter, setDashSalesPersonFilter] = useState<string>("all");

  const hasActiveFilters = statusFilter !== 'all' || paymentStatusFilter !== 'all' || 
    orderTypeFilter !== 'all' || outcomeFilter !== 'all' || 
    paymentTermsFilter !== 'all' || salesPersonFilter !== 'all' ||
    customerTypeFilter !== 'all' || categoryFilter !== 'all' ||
    !!startDate || !!endDate || !!searchQuery;

  const hasActiveShopifyFilters = shopifyStatusFilter !== 'all' || shopifyPaymentStatusFilter !== 'all' ||
    !!shopifyStartDate || !!shopifyEndDate || !!shopifySearchQuery;

  const hasActiveWooFilters =
    wooStatusFilter !== 'all' ||
    wooPaymentStatusFilter !== 'all' ||
    wooNotifFilter !== 'all' ||
    !!wooSearchQuery;

  const formatINR = (n: number) => {
    if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`;
    if (n >= 100_000) return `₹${(n / 100_000).toFixed(2)} L`;
    if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
    return `₹${Math.round(n).toLocaleString('en-IN')}`;
  };

  const timeAgo = (iso: string | null) => {
    if (!iso) return 'never';
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 0) return 'just now';
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} min ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} hr ago`;
    const day = Math.floor(hr / 24);
    return `${day}d ago`;
  };

  const handleWooManualSync = async () => {
    if (wooSyncing) return;
    setWooSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-website-orders', {
        body: { incremental: true },
      });
      if (error) throw error;
      toast({
        title: 'Sync triggered',
        description: data?.message || 'Pulling latest orders from WooCommerce…',
      });
      // Auto-refresh after a short delay to give the function time to write rows
      setTimeout(() => {
        refetchWooOrders();
        refetchWooSync();
      }, 3000);
    } catch (err: any) {
      toast({
        title: 'Sync failed',
        description: err?.message || 'Could not start sync',
        variant: 'destructive',
      });
    } finally {
      setWooSyncing(false);
    }
  };

  const handleRetryAllFailedWhatsapp = async () => {
    if (wooBulkRetrying) return;
    setWooBulkRetrying(true);
    try {
      // Fetch all failed notification ids in chunks of 1000.
      const ids: string[] = [];
      let from = 0;
      const PAGE = 1000;
      // Defensive cap so we never spin forever.
      for (let i = 0; i < 10; i++) {
        const { data, error } = await supabase
          .from('order_notifications')
          .select('id')
          .eq('channel', 'whatsapp')
          .eq('status', 'failed')
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data || []).map((r) => r.id);
        ids.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }

      if (ids.length === 0) {
        toast({ title: 'Nothing to retry', description: 'No failed notifications.' });
        return;
      }

      // Send to the worker in chunks of 50 so we don't overshoot the function payload.
      let totalSent = 0;
      let totalRetried = 0;
      let totalFailed = 0;
      const CHUNK = 50;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const { data, error } = await supabase.functions.invoke(
          'send-order-status-whatsapp',
          { body: { notification_ids: chunk } },
        );
        if (error) throw error;
        totalSent += data?.sent ?? 0;
        totalRetried += data?.retried ?? 0;
        totalFailed += data?.failed ?? 0;
      }

      toast({
        title: 'Bulk retry complete',
        description: `${ids.length} attempted · ${totalSent} sent · ${totalRetried} re-queued · ${totalFailed} failed`,
      });
      await refetchWooNotifs();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Bulk retry failed';
      toast({ title: 'Bulk retry failed', description: msg, variant: 'destructive' });
    } finally {
      setWooBulkRetrying(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-background via-background to-muted/10 flex flex-col">
      <Header />
      <main className="container mx-auto py-4 sm:py-8 px-4 flex-1 overflow-x-hidden">
        <MissingPhoneBanner
          onOpenOrder={(orderId) => {
            const order = orders.find((o) => o.id === orderId);
            if (order) {
              setSelectedOrder(order);
              setDialogOpen(true);
            }
          }}
        />
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Enhanced Header Section */}
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
                  <Link 
                    to="/" 
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors mt-3 ml-16 font-medium"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Enquiries
                  </Link>
                )}
              </div>
              <OrdersExportButton
                activeTab={activeTab}
                manualOrders={filteredOrders}
                shopifyOrders={filteredShopifyOrders}
                wooOrders={filteredWooOrders}
              />
              
              {/* Enhanced Tabs */}
              <TabsList className="bg-muted/60 backdrop-blur-sm p-1.5 h-auto flex-wrap rounded-xl border border-border/50 shadow-sm">
                <TabsTrigger value="list" className="gap-2">
                  <LayoutGrid className="h-4 w-4" />
                  <span className="hidden sm:inline font-medium">All Orders</span>
                  <Badge variant="secondary" className="ml-1 h-5 px-2 text-xs bg-primary/10 text-primary font-semibold">
                    {(sourceFilter === 'manual'
                      ? filteredOrders.length
                      : sourceFilter === 'website'
                        ? wooTotalCount
                        : filteredOrders.length + wooTotalCount).toLocaleString()}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="shopify" className="gap-2">
                  <ShoppingBag className="h-4 w-4" />
                  <span className="hidden sm:inline font-medium">Shopify</span>
                  <Badge variant="secondary" className="ml-1 h-5 px-2 text-xs bg-primary/10 text-primary font-semibold">
                    {shopifyTotalCount.toLocaleString()}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="website" className="gap-2">
                  <Globe className="h-4 w-4" />
                  <span className="hidden sm:inline font-medium">Website Orders</span>
                  <Badge variant="secondary" className="ml-1 h-5 px-2 text-xs bg-primary/10 text-primary font-semibold">
                    {wooTotalCount.toLocaleString()}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="pipeline" className="gap-2">
                  <Target className="h-4 w-4" />
                  <span className="hidden sm:inline font-medium">Pipeline</span>
                </TabsTrigger>
                {canViewPipelineAnalytics && (
                  <TabsTrigger value="pipeline_analytics" className="gap-2">
                    <BarChart3 className="h-4 w-4" />
                    <span className="hidden sm:inline font-medium">Pipeline Analytics</span>
                  </TabsTrigger>
                )}
                {canCreateOrder && (
                  <TabsTrigger value="new" className="gap-2">
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline font-medium">New Order</span>
                  </TabsTrigger>
                )}
                {canViewRefunds && (
                  <TabsTrigger value="refunds" className="gap-2">
                    <RotateCcw className="h-4 w-4" />
                    <span className="hidden sm:inline font-medium">Refunds</span>
                    {refundCount > 0 && (
                      <Badge variant="destructive" className="ml-1 h-5 px-2 text-xs font-semibold animate-pulse">
                        {refundCount}
                      </Badge>
                    )}
                  </TabsTrigger>
                )}
                {(role === 'supply_chain' || role === 'admin') && (
                  <TabsTrigger value="support_calls" className="gap-2">
                    <Phone className="h-4 w-4" />
                    <span className="hidden sm:inline font-medium">Support Calls</span>
                  </TabsTrigger>
                )}
                {isAdmin && (
                  <TabsTrigger value="analytics" className="gap-2">
                    <BarChart3 className="h-4 w-4" />
                    <span className="hidden sm:inline font-medium">Analytics</span>
                  </TabsTrigger>
                )}
                <TabsTrigger value="deleted" className="gap-2">
                  <Trash2 className="h-4 w-4" />
                  <span className="hidden sm:inline font-medium">Deleted</span>
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Quick Stats Cards - Enhanced */}
            {activeTab === 'list' && (
              <OrdersDashboardStats
                orders={manualOrders}
                timePeriod={dashTimePeriod}
                onTimePeriodChange={setDashTimePeriod}
                salesPersonFilter={dashSalesPersonFilter}
                onSalesPersonFilterChange={setDashSalesPersonFilter}
              />
            )}
          </div>

          <TabsContent value="list" className="space-y-6 mt-0">
            {/* Unlinked Orders Widget for procurement team */}
            {canViewProcurementWidget && (
              <div className="mb-6">
                <UnlinkedOrdersWidget maxItems={3} showViewAll={true} />
              </div>
            )}

            {/* Enhanced Search & Filters Section */}
            <Card className="border border-border/60 shadow-sm bg-gradient-to-br from-card to-muted/10 backdrop-blur-sm">
              <CardContent className="p-5">
                <div className="flex flex-col gap-5">
                  {/* Search and Toggle Row */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                    <div className="relative flex-1 max-w-lg">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search order no, product, customer..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-11 pr-10 h-11 bg-background border-muted-foreground/20 focus:border-primary/50 rounded-xl shadow-sm transition-all"
                      />
                      {searchQuery && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 p-0 hover:bg-muted rounded-full"
                          onClick={() => setSearchQuery('')}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as 'all' | 'manual' | 'website')}>
                        <SelectTrigger className="w-[170px] h-11 rounded-xl">
                          <SelectValue placeholder="Source" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Sources ({(filteredOrders.length + wooTotalCount).toLocaleString()})</SelectItem>
                          <SelectItem value="manual">Manual ({filteredOrders.length.toLocaleString()})</SelectItem>
                          <SelectItem value="website">Website ({wooTotalCount.toLocaleString()})</SelectItem>
                        </SelectContent>
                      </Select>
                      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
                        <CollapsibleTrigger asChild>
                          <Button variant="outline" size="default" className="gap-2 h-11 px-4 rounded-xl border-muted-foreground/20 hover:bg-muted/50">
                            <Filter className="h-4 w-4" />
                            <span className="font-medium">Filters</span>
                            {hasActiveFilters && (
                              <Badge className="h-5 px-2 text-xs bg-primary text-primary-foreground font-semibold">
                                Active
                              </Badge>
                            )}
                            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${filtersOpen ? 'rotate-180' : ''}`} />
                          </Button>
                        </CollapsibleTrigger>
                      </Collapsible>
                      
                      {hasActiveFilters && (
                        <Button variant="ghost" size="default" onClick={clearFilters} className="gap-2 h-11 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-xl">
                          <X className="h-4 w-4" />
                          <span className="hidden sm:inline">Clear All</span>
                        </Button>
                      )}
                      
                      <div className="flex items-center gap-1 border border-muted-foreground/20 rounded-xl p-1 bg-muted/30">
                        <Button
                          variant={viewMode === 'cards' ? 'default' : 'ghost'}
                          size="sm"
                          onClick={() => setViewMode('cards')}
                          className={`h-9 w-9 p-0 rounded-lg ${viewMode === 'cards' ? 'shadow-sm' : 'hover:bg-muted/50'}`}
                        >
                          <LayoutGrid className="h-4 w-4" />
                        </Button>
                        <Button
                          variant={viewMode === 'table' ? 'default' : 'ghost'}
                          size="sm"
                          onClick={() => setViewMode('table')}
                          className={`h-9 w-9 p-0 rounded-lg ${viewMode === 'table' ? 'shadow-sm' : 'hover:bg-muted/50'}`}
                        >
                          <Table className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Always-visible Date Range Filter */}
                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    <span className="text-xs font-medium text-muted-foreground mr-1">Date:</span>
                    <DateRangeFilter
                      startDate={startDate}
                      endDate={endDate}
                      onStartDateChange={setStartDate}
                      onEndDateChange={setEndDate}
                      onClear={() => { setStartDate(undefined); setEndDate(undefined); }}
                    />
                  </div>

                  {/* Collapsible Filters */}
                  <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
                    <CollapsibleContent className="animate-in slide-in-from-top-2 duration-200">
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 pt-5 border-t border-border/50">
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                          <SelectTrigger className="bg-background h-10 rounded-lg border-muted-foreground/20">
                            <SelectValue placeholder="Status" />
                          </SelectTrigger>
                          <SelectContent className="bg-popover">
                            <SelectItem value="all">All Statuses</SelectItem>
                            {ORDER_STATUSES.map(s => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
                          <SelectTrigger className="bg-background h-10 rounded-lg border-muted-foreground/20">
                            <SelectValue placeholder="Payment" />
                          </SelectTrigger>
                          <SelectContent className="bg-popover">
                            <SelectItem value="all">All Payment Status</SelectItem>
                            {PAYMENT_STATUSES.map(s => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select value={orderTypeFilter} onValueChange={setOrderTypeFilter}>
                          <SelectTrigger className="bg-background h-10 rounded-lg border-muted-foreground/20">
                            <SelectValue placeholder="Type" />
                          </SelectTrigger>
                          <SelectContent className="bg-popover">
                            <SelectItem value="all">All Types</SelectItem>
                            {ORDER_TYPES.map(t => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
                          <SelectTrigger className="bg-background h-10 rounded-lg border-muted-foreground/20">
                            <SelectValue placeholder="Outcome" />
                          </SelectTrigger>
                          <SelectContent className="bg-popover">
                            <SelectItem value="all">All Outcomes</SelectItem>
                            {ORDER_OUTCOMES.map(o => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select value={paymentTermsFilter} onValueChange={setPaymentTermsFilter}>
                          <SelectTrigger className="bg-background h-10 rounded-lg border-muted-foreground/20">
                            <SelectValue placeholder="Terms" />
                          </SelectTrigger>
                          <SelectContent className="bg-popover">
                            <SelectItem value="all">All Terms</SelectItem>
                            {paymentTermsOptions.map(term => (
                              <SelectItem key={term} value={term}>{term}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select value={salesPersonFilter} onValueChange={setSalesPersonFilter}>
                          <SelectTrigger className="bg-background h-10 rounded-lg border-muted-foreground/20">
                            <SelectValue placeholder="Sales Person" />
                          </SelectTrigger>
                          <SelectContent className="bg-popover">
                            <SelectItem value="all">All Sales Persons</SelectItem>
                            {salesPersonOptions.map(name => (
                              <SelectItem key={name} value={name}>{name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select value={customerTypeFilter} onValueChange={setCustomerTypeFilter}>
                          <SelectTrigger className="bg-background h-10 rounded-lg border-muted-foreground/20">
                            <SelectValue placeholder="B2B / B2C" />
                          </SelectTrigger>
                          <SelectContent className="bg-popover">
                            <SelectItem value="all">All Customers (B2B + B2C)</SelectItem>
                            {CUSTOMER_TYPES.map(c => (
                              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                          <SelectTrigger className="bg-background h-10 rounded-lg border-muted-foreground/20">
                            <SelectValue placeholder="Product Category" />
                          </SelectTrigger>
                          <SelectContent className="bg-popover">
                            <SelectItem value="all">All Categories</SelectItem>
                            {categoryOptions.map(cat => (
                              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="mt-5 pt-5 border-t border-border/50">
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

            {/* Manual Pagination - Top */}
            {manualTotalPages > 1 && !loading && filteredOrders.length > 0 && (
              <div className="flex items-center justify-between flex-wrap gap-3">
                <p className="text-sm text-muted-foreground">
                  Showing <span className="font-semibold text-foreground">{((manualPage - 1) * MANUAL_PAGE_SIZE) + 1}–{Math.min(manualPage * MANUAL_PAGE_SIZE, filteredOrders.length)}</span> of <span className="font-semibold text-foreground">{filteredOrders.length}</span> orders
                </p>
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => setManualPage(1)} disabled={manualPage === 1} className="h-8 px-3 rounded-lg text-xs">«</Button>
                  <Button variant="outline" size="sm" onClick={() => setManualPage(p => Math.max(1, p - 1))} disabled={manualPage === 1} className="h-8 px-3 rounded-lg text-xs">‹ Prev</Button>
                  {Array.from({ length: Math.min(5, manualTotalPages) }, (_, i) => {
                    let pageNum: number;
                    if (manualTotalPages <= 5) pageNum = i + 1;
                    else if (manualPage <= 3) pageNum = i + 1;
                    else if (manualPage >= manualTotalPages - 2) pageNum = manualTotalPages - 4 + i;
                    else pageNum = manualPage - 2 + i;
                    return (
                      <Button key={pageNum} variant={manualPage === pageNum ? 'default' : 'outline'} size="sm" onClick={() => setManualPage(pageNum)} className="h-8 w-8 p-0 rounded-lg text-xs">{pageNum}</Button>
                    );
                  })}
                  <Button variant="outline" size="sm" onClick={() => setManualPage(p => Math.min(manualTotalPages, p + 1))} disabled={manualPage === manualTotalPages} className="h-8 px-3 rounded-lg text-xs">Next ›</Button>
                  <Button variant="outline" size="sm" onClick={() => setManualPage(manualTotalPages)} disabled={manualPage === manualTotalPages} className="h-8 px-3 rounded-lg text-xs">»</Button>
                </div>
              </div>
            )}

            {/* Results Section */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                  <div className="absolute inset-2 rounded-full bg-primary/10 animate-pulse" />
                  <Loader2 className="h-12 w-12 animate-spin text-primary relative" />
                </div>
                <p className="mt-6 text-sm text-muted-foreground font-medium">Loading orders...</p>
              </div>
            ) : unifiedRows.length === 0 ? (
              <Card className="border-dashed border-2 bg-gradient-to-br from-muted/30 to-muted/10">
                <CardContent className="flex flex-col items-center justify-center py-20">
                  <div className="p-6 rounded-2xl bg-gradient-to-br from-muted to-muted/50 mb-6 shadow-inner">
                    <Package className="h-12 w-12 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">No orders found</h3>
                  <p className="text-muted-foreground text-center max-w-md leading-relaxed">
                    {hasActiveFilters 
                      ? 'Try adjusting your filters to see more orders'
                      : canCreateOrder 
                        ? 'Create your first order to get started'
                        : 'No orders have been assigned to you yet'}
                  </p>
                  {hasActiveFilters && (
                    <Button variant="outline" onClick={clearFilters} className="mt-6 gap-2 rounded-xl h-11 px-6">
                      <X className="h-4 w-4" />
                      Clear All Filters
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : viewMode === 'table' && sourceFilter === 'manual' ? (
              <Card className="shadow-sm border-border/60 overflow-hidden">
                <CardContent className="p-0">
                  <OrderTable orders={paginatedManualOrders} onOrderClick={handleOrderClick} onUpdateOutcome={handleUpdateOutcome} />
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {paginatedUnified.map((u, index) => (
                  <div
                    key={u.kind === 'manual' ? `m-${u.row.id}` : `w-${u.row.id}`}
                    className="animate-in fade-in slide-in-from-bottom-2"
                    style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
                  >
                    {u.kind === 'manual' ? (
                      <OrderCard order={u.row} onClick={() => handleOrderClick(u.row)} />
                    ) : (
                      <WooOrderCard
                        order={u.row}
                        onClick={(o) => handleWooOrderClick(o)}
                        onUpdated={() => { refetchWooOrders(); refetchWooSync(); }}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Manual Orders Pagination */}
            {unifiedTotalPages > 1 && (
              <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
                <p className="text-sm text-muted-foreground">
                  Showing <span className="font-semibold text-foreground">{((manualPage - 1) * MANUAL_PAGE_SIZE) + 1}–{Math.min(manualPage * MANUAL_PAGE_SIZE, unifiedRows.length)}</span> of <span className="font-semibold text-foreground">{unifiedRows.length}</span> orders
                </p>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setManualPage(1)}
                    disabled={manualPage === 1}
                    className="h-8 px-3 rounded-lg text-xs"
                  >
                    «
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setManualPage(p => Math.max(1, p - 1))}
                    disabled={manualPage === 1}
                    className="h-8 px-3 rounded-lg text-xs"
                  >
                    ‹ Prev
                  </Button>
                  {Array.from({ length: Math.min(5, unifiedTotalPages) }, (_, i) => {
                    let pageNum: number;
                    if (unifiedTotalPages <= 5) {
                      pageNum = i + 1;
                    } else if (manualPage <= 3) {
                      pageNum = i + 1;
                    } else if (manualPage >= unifiedTotalPages - 2) {
                      pageNum = unifiedTotalPages - 4 + i;
                    } else {
                      pageNum = manualPage - 2 + i;
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={manualPage === pageNum ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setManualPage(pageNum)}
                        className="h-8 w-8 p-0 rounded-lg text-xs"
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setManualPage(p => Math.min(unifiedTotalPages, p + 1))}
                    disabled={manualPage === unifiedTotalPages}
                    className="h-8 px-3 rounded-lg text-xs"
                  >
                    Next ›
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setManualPage(unifiedTotalPages)}
                    disabled={manualPage === unifiedTotalPages}
                    className="h-8 px-3 rounded-lg text-xs"
                  >
                    »
                  </Button>
                </div>
              </div>
            )}

            {/* Woo detail dialog — usable from the unified All Orders view */}
            <WooOrderDetailDialog
              order={selectedWooOrder}
              open={wooDetailOpen}
              onOpenChange={setWooDetailOpen}
              onUpdated={() => { refetchWooOrders(); refetchWooSync(); }}
            />
          </TabsContent>

          <TabsContent value="shopify" className="space-y-6 mt-0">
            {/* Shopify Orders Header */}
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-xl bg-green-500/10">
                <ShoppingBag className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Shopify Orders</h2>
                <p className="text-xs text-muted-foreground">{shopifyTotalCount.toLocaleString()} orders synced from Shopify (separate database)</p>
              </div>
            </div>

            {/* Pipeline Monitor Widget */}
            {isAdmin && <ShopifyPipelineWidget />}

            {/* Shopify Search & Filters */}
            <Card className="border border-border/60 shadow-sm bg-gradient-to-br from-card to-muted/10 backdrop-blur-sm">
              <CardContent className="p-5">
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                    <div className="relative flex-1 max-w-lg">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search order no, product, customer..."
                        value={shopifySearchQuery}
                        onChange={(e) => setShopifySearchQuery(e.target.value)}
                        className="pl-11 pr-10 h-11 bg-background border-muted-foreground/20 focus:border-primary/50 rounded-xl shadow-sm transition-all"
                      />
                      {shopifySearchQuery && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 p-0 hover:bg-muted rounded-full"
                          onClick={() => setShopifySearchQuery('')}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <Collapsible open={shopifyFiltersOpen} onOpenChange={setShopifyFiltersOpen}>
                        <CollapsibleTrigger asChild>
                          <Button variant="outline" size="default" className="gap-2 h-11 px-4 rounded-xl border-muted-foreground/20 hover:bg-muted/50">
                            <Filter className="h-4 w-4" />
                            <span className="font-medium">Filters</span>
                            {hasActiveShopifyFilters && (
                              <Badge className="h-5 px-2 text-xs bg-primary text-primary-foreground font-semibold">Active</Badge>
                            )}
                            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${shopifyFiltersOpen ? 'rotate-180' : ''}`} />
                          </Button>
                        </CollapsibleTrigger>
                      </Collapsible>
                      {hasActiveShopifyFilters && (
                        <Button variant="ghost" size="default" onClick={clearShopifyFilters} className="gap-2 h-11 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-xl">
                          <X className="h-4 w-4" />
                          <span className="hidden sm:inline">Clear All</span>
                        </Button>
                      )}
                      <div className="flex items-center gap-1 border border-muted-foreground/20 rounded-xl p-1 bg-muted/30">
                        <Button
                          variant={shopifyViewMode === 'cards' ? 'default' : 'ghost'}
                          size="sm"
                          onClick={() => setShopifyViewMode('cards')}
                          className={`h-9 w-9 p-0 rounded-lg ${shopifyViewMode === 'cards' ? 'shadow-sm' : 'hover:bg-muted/50'}`}
                        >
                          <LayoutGrid className="h-4 w-4" />
                        </Button>
                        <Button
                          variant={shopifyViewMode === 'table' ? 'default' : 'ghost'}
                          size="sm"
                          onClick={() => setShopifyViewMode('table')}
                          className={`h-9 w-9 p-0 rounded-lg ${shopifyViewMode === 'table' ? 'shadow-sm' : 'hover:bg-muted/50'}`}
                        >
                          <Table className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <Collapsible open={shopifyFiltersOpen} onOpenChange={setShopifyFiltersOpen}>
                    <CollapsibleContent className="animate-in slide-in-from-top-2 duration-200">
                     <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-5 border-t border-border/50">
                        <Select value={shopifyStatusFilter} onValueChange={setShopifyStatusFilter}>
                          <SelectTrigger className="bg-background h-10 rounded-lg border-muted-foreground/20">
                            <SelectValue placeholder="Order Status" />
                          </SelectTrigger>
                          <SelectContent className="bg-popover">
                            <SelectItem value="all">All Statuses</SelectItem>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={shopifyPaymentStatusFilter} onValueChange={setShopifyPaymentStatusFilter}>
                          <SelectTrigger className="bg-background h-10 rounded-lg border-muted-foreground/20">
                            <SelectValue placeholder="Payment" />
                          </SelectTrigger>
                          <SelectContent className="bg-popover">
                            <SelectItem value="all">All Payment Status</SelectItem>
                            <SelectItem value="full">Paid</SelectItem>
                            <SelectItem value="partial">Partially Paid</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="mt-5 pt-5 border-t border-border/50">
                        <DateRangeFilter
                          startDate={shopifyStartDate}
                          endDate={shopifyEndDate}
                          onStartDateChange={setShopifyStartDate}
                          onEndDateChange={setShopifyEndDate}
                          onClear={clearShopifyFilters}
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </CardContent>
            </Card>

            {/* Shopify Pagination - Top */}
            {shopifyTotalPages > 1 && !shopifyLoading && filteredShopifyOrders.length > 0 && (
              <div className="flex items-center justify-between flex-wrap gap-3">
                <p className="text-sm text-muted-foreground">
                  Showing <span className="font-semibold text-foreground">{((shopifyPage - 1) * SHOPIFY_PAGE_SIZE) + 1}–{Math.min(shopifyPage * SHOPIFY_PAGE_SIZE, filteredShopifyOrders.length)}</span> of <span className="font-semibold text-foreground">{shopifyTotalCount.toLocaleString()}</span> orders
                </p>
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => setShopifyPage(1)} disabled={shopifyPage === 1} className="h-8 px-3 rounded-lg text-xs">«</Button>
                  <Button variant="outline" size="sm" onClick={() => setShopifyPage(p => Math.max(1, p - 1))} disabled={shopifyPage === 1} className="h-8 px-3 rounded-lg text-xs">‹ Prev</Button>
                  {Array.from({ length: Math.min(5, shopifyTotalPages) }, (_, i) => {
                    let pageNum: number;
                    if (shopifyTotalPages <= 5) pageNum = i + 1;
                    else if (shopifyPage <= 3) pageNum = i + 1;
                    else if (shopifyPage >= shopifyTotalPages - 2) pageNum = shopifyTotalPages - 4 + i;
                    else pageNum = shopifyPage - 2 + i;
                    return (
                      <Button key={pageNum} variant={shopifyPage === pageNum ? 'default' : 'outline'} size="sm" onClick={() => setShopifyPage(pageNum)} className="h-8 w-8 p-0 rounded-lg text-xs">{pageNum}</Button>
                    );
                  })}
                  <Button variant="outline" size="sm" onClick={() => setShopifyPage(p => Math.min(shopifyTotalPages, p + 1))} disabled={shopifyPage === shopifyTotalPages} className="h-8 px-3 rounded-lg text-xs">Next ›</Button>
                  <Button variant="outline" size="sm" onClick={() => setShopifyPage(shopifyTotalPages)} disabled={shopifyPage === shopifyTotalPages} className="h-8 px-3 rounded-lg text-xs">»</Button>
                </div>
              </div>
            )}

            {/* Shopify Orders Results */}
            {shopifyLoading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="mt-6 text-sm text-muted-foreground font-medium">Loading Shopify orders...</p>
              </div>
            ) : filteredShopifyOrders.length === 0 ? (
              <Card className="border-dashed border-2 bg-gradient-to-br from-muted/30 to-muted/10">
                <CardContent className="flex flex-col items-center justify-center py-20">
                  <div className="p-6 rounded-2xl bg-gradient-to-br from-muted to-muted/50 mb-6 shadow-inner">
                    <ShoppingBag className="h-12 w-12 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">No Shopify orders found</h3>
                  <p className="text-muted-foreground text-center max-w-md leading-relaxed">
                    {hasActiveShopifyFilters ? 'Try adjusting your filters' : 'No orders have been synced from Shopify yet'}
                  </p>
                  {hasActiveShopifyFilters && (
                    <Button variant="outline" onClick={clearShopifyFilters} className="mt-6 gap-2 rounded-xl h-11 px-6">
                      <X className="h-4 w-4" />
                      Clear Filters
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : shopifyViewMode === 'table' ? (
              <Card className="shadow-sm border-border/60 overflow-hidden">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 border-b border-border/60">
                        <tr>
                          <th className="text-left p-3 font-semibold text-muted-foreground">Order #</th>
                          <th className="text-left p-3 font-semibold text-muted-foreground">Customer</th>
                          <th className="text-left p-3 font-semibold text-muted-foreground">Product</th>
                          <th className="text-left p-3 font-semibold text-muted-foreground">Qty</th>
                          <th className="text-left p-3 font-semibold text-muted-foreground">Amount</th>
                          <th className="text-left p-3 font-semibold text-muted-foreground">Payment</th>
                          <th className="text-left p-3 font-semibold text-muted-foreground">Fulfillment</th>
                          <th className="text-left p-3 font-semibold text-muted-foreground">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedShopifyOrders.map((order) => (
                          <tr
                            key={order.id}
                            onClick={() => { setSelectedShopifyOrder(order); setShopifyDetailOpen(true); }}
                            className="border-b border-border/40 hover:bg-muted/30 transition-colors cursor-pointer"
                          >
                            <td className="p-3 font-mono font-medium text-primary">#{order.order_number || order.shopify_order_id}</td>
                            <td className="p-3">
                              <div className="font-medium">{order.customer_name}</div>
                              {order.customer_company && <div className="text-xs text-muted-foreground">{order.customer_company}</div>}
                            </td>
                            <td className="p-3">
                              <div className="font-medium">{order.product_name}</div>
                              {order.product_code && <div className="text-xs text-muted-foreground">{order.product_code}</div>}
                            </td>
                            <td className="p-3">{order.quantity}</td>
                            <td className="p-3 font-semibold">₹{(order.total_sales_amount || 0).toLocaleString()}</td>
                            <td className="p-3">
                              <Badge variant={order.payment_status === 'full' ? 'default' : 'secondary'} className="capitalize">
                                {order.payment_status || 'pending'}
                              </Badge>
                            </td>
                            <td className="p-3">
                              <Badge variant="outline" className="capitalize">
                                {order.fulfillment_status || 'unfulfilled'}
                              </Badge>
                            </td>
                            <td className="p-3 text-muted-foreground text-xs">{new Date(order.created_at).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {paginatedShopifyOrders.map((order, index) => (
                  <div
                    key={order.id}
                    className="animate-in fade-in slide-in-from-bottom-2"
                    style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
                  >
                    <Card
                      onClick={() => { setSelectedShopifyOrder(order); setShopifyDetailOpen(true); }}
                      className="hover:shadow-lg transition-all duration-200 cursor-pointer border-border/60 hover:-translate-y-0.5"
                    >
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-mono text-sm font-bold text-primary">#{order.order_number || order.shopify_order_id}</div>
                          <Badge variant={order.payment_status === 'full' ? 'default' : 'secondary'} className="capitalize text-xs">
                            {order.payment_status || 'pending'}
                          </Badge>
                        </div>
                        <div>
                          <p className="font-semibold text-sm leading-tight">{order.customer_name}</p>
                          {order.customer_company && <p className="text-xs text-muted-foreground">{order.customer_company}</p>}
                        </div>
                        <div className="text-xs text-muted-foreground space-y-1">
                          <p className="font-medium text-foreground/80 truncate">{order.product_name}</p>
                          <p>Qty: {order.quantity}</p>
                        </div>
                        <div className="flex items-center justify-between pt-1 border-t border-border/40">
                          <span className="font-bold text-sm">₹{(order.total_sales_amount || 0).toLocaleString()}</span>
                          <Badge variant="outline" className="capitalize text-xs">
                            {order.fulfillment_status || 'unfulfilled'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleDateString()}</p>
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {shopifyTotalPages > 1 && (
              <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
                <p className="text-sm text-muted-foreground">
                  Showing <span className="font-semibold text-foreground">{((shopifyPage - 1) * SHOPIFY_PAGE_SIZE) + 1}–{Math.min(shopifyPage * SHOPIFY_PAGE_SIZE, filteredShopifyOrders.length)}</span> of <span className="font-semibold text-foreground">{shopifyTotalCount.toLocaleString()}</span> orders
                </p>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShopifyPage(1)}
                    disabled={shopifyPage === 1}
                    className="h-8 px-3 rounded-lg text-xs"
                  >
                    «
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShopifyPage(p => Math.max(1, p - 1))}
                    disabled={shopifyPage === 1}
                    className="h-8 px-3 rounded-lg text-xs"
                  >
                    ‹ Prev
                  </Button>

                  {/* Page number buttons */}
                  {Array.from({ length: Math.min(5, shopifyTotalPages) }, (_, i) => {
                    let pageNum: number;
                    if (shopifyTotalPages <= 5) {
                      pageNum = i + 1;
                    } else if (shopifyPage <= 3) {
                      pageNum = i + 1;
                    } else if (shopifyPage >= shopifyTotalPages - 2) {
                      pageNum = shopifyTotalPages - 4 + i;
                    } else {
                      pageNum = shopifyPage - 2 + i;
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={shopifyPage === pageNum ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setShopifyPage(pageNum)}
                        className="h-8 w-8 p-0 rounded-lg text-xs"
                      >
                        {pageNum}
                      </Button>
                    );
                  })}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShopifyPage(p => Math.min(shopifyTotalPages, p + 1))}
                    disabled={shopifyPage === shopifyTotalPages}
                    className="h-8 px-3 rounded-lg text-xs"
                  >
                    Next ›
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShopifyPage(shopifyTotalPages)}
                    disabled={shopifyPage === shopifyTotalPages}
                    className="h-8 px-3 rounded-lg text-xs"
                  >
                    »
                  </Button>
                </div>
              </div>
            )}
            <ShopifyOrderDetailDialog
              order={selectedShopifyOrder}
              open={shopifyDetailOpen}
              onOpenChange={setShopifyDetailOpen}
              onUpdated={() => refetchShopifyOrders()}
            />
          </TabsContent>

           {/* XBoom Website Orders Tab */}
          <TabsContent value="website" className="space-y-6 mt-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10">
                  <Globe className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">XBoom Website Orders</h2>
                  <p className="text-xs text-muted-foreground">{wooTotalCount.toLocaleString()} orders from xboom.in website</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-muted-foreground hidden sm:inline">
                  Last synced: <span className="font-medium text-foreground">{timeAgo(wooStats.lastSyncedAt)}</span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleWooManualSync}
                  disabled={wooSyncing || wooLoading}
                  className="h-9 gap-2 rounded-lg"
                >
                  <RefreshCw className={`h-4 w-4 ${wooSyncing ? 'animate-spin' : ''}`} />
                  {wooSyncing ? 'Syncing…' : 'Sync Now'}
                </Button>
              </div>
            </div>

            {/* Sync health dashboard — Woo total vs DB, gap, last sync, status */}
            <WooSyncHealthCard onSyncTriggered={() => refetchWooOrders()} />

            {/* Sync gap warnings */}
            {wooGap !== null && wooGap > 0 && (
              <div
                className={`rounded-lg border p-3 text-sm flex items-start gap-2 ${
                  wooGap > 100
                    ? 'border-red-500/40 bg-red-500/5 text-red-700 dark:text-red-400'
                    : 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400'
                }`}
              >
                <span className="font-bold">⚠</span>
                <div className="flex-1">
                  <p className="font-semibold">
                    {wooGap > 100 ? 'Data mismatch detected.' : 'Data still syncing.'}
                  </p>
                  <p className="text-xs opacity-90">
                    WooCommerce reports {wooApiTotal?.toLocaleString('en-IN') ?? '—'} orders,
                    XBoom has {wooDbTotal?.toLocaleString('en-IN') ?? '—'} ({wooGap.toLocaleString('en-IN')} missing).
                    {wooGap > 100
                      ? ' Run a Full backfill from the Sync Health card above.'
                      : ' Some orders may not be visible until the next sync completes.'}
                  </p>
                </div>
              </div>
            )}

            {/* Primary metrics — business-friendly, simplified */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">Total Orders</p>
                  <p className="text-2xl font-bold text-primary">{wooTotalCount.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">Processing</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{wooStats.grouped.processing.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">Completed</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{wooStats.grouped.success.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground/80 mt-0.5">incl. delivered</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">Today's Orders</p>
                  <p className="text-2xl font-bold text-foreground">{wooStats.todayOrders.toLocaleString()}</p>
                </CardContent>
              </Card>
            </div>

            {/* Revenue metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Total Revenue</p>
                  <p className="text-xl font-bold text-primary mt-1">{formatINR(wooStats.revenue.total)}</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Completed Revenue</p>
                  <p className="text-xl font-bold text-green-600 dark:text-green-400 mt-1">{formatINR(wooStats.revenue.completed)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Secondary statuses — collapsible so it doesn't overwhelm */}
            {Object.keys(wooStats.statusCounts).length > 0 && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1.5 h-8">
                    <ChevronDown className="h-3.5 w-3.5" />
                    Show all statuses ({Object.keys(wooStats.statusCounts).length})
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-2">
                    {Object.entries(wooStats.statusCounts)
                      .sort((a, b) => b[1] - a[1])
                      .map(([status, count]) => (
                        <Card key={status} className="bg-muted/20">
                          <CardContent className="p-3 text-center">
                            <p className="text-[11px] text-muted-foreground capitalize truncate">{status.replace(/-/g, ' ')}</p>
                            <p className="text-base font-semibold text-foreground">{count.toLocaleString()}</p>
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Filters */}
            <Card className="border border-border/60 shadow-sm bg-gradient-to-br from-card to-muted/10 backdrop-blur-sm">
              <CardContent className="p-5">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                  <div className="relative flex-1 max-w-lg">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search order no, product, customer..."
                      value={wooSearchQuery}
                      onChange={(e) => setWooSearchQuery(e.target.value)}
                      className="pl-11 pr-10 h-11 bg-background border-muted-foreground/20 focus:border-primary/50 rounded-xl shadow-sm transition-all"
                    />
                    {wooSearchQuery && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 p-0 hover:bg-muted rounded-full"
                        onClick={() => setWooSearchQuery('')}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <Select value={wooPaymentStatusFilter} onValueChange={setWooPaymentStatusFilter}>
                    <SelectTrigger className="w-[160px] h-11 rounded-xl">
                      <SelectValue placeholder="Payment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Payments</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="refunded">Refunded</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={wooViewMode === 'cards' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setWooViewMode('cards')}
                      className={`h-9 w-9 p-0 rounded-lg ${wooViewMode === 'cards' ? 'shadow-sm' : 'hover:bg-muted/50'}`}
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={wooViewMode === 'table' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setWooViewMode('table')}
                      className={`h-9 w-9 p-0 rounded-lg ${wooViewMode === 'table' ? 'shadow-sm' : 'hover:bg-muted/50'}`}
                    >
                      <Table className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {/* Status filter chips — grouped buckets first, individual statuses below */}
                <div className="flex flex-wrap items-center gap-2 mt-4">
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground mr-1">
                    Status:
                  </span>
                  <Select value={wooStatusFilter} onValueChange={setWooStatusFilter}>
                    <SelectTrigger className="w-[200px] h-9 rounded-lg">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        Processing + Pending + Shipped ({((wooStats.statusCounts['processing'] || 0) + (wooStats.statusCounts['pending'] || 0) + (wooStats.statusCounts['shipped'] || 0)).toLocaleString()})
                      </SelectItem>
                      {WOO_STATUS_OPTIONS
                        .filter((s) => s.value === 'processing' || s.value === 'pending' || s.value === 'shipped')
                        .map((s) => {
                          const count = wooStats.statusCounts[s.value] || 0;
                          return (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label} ({count.toLocaleString()})
                            </SelectItem>
                          );
                        })}
                    </SelectContent>
                  </Select>
                </div>

                {/* WhatsApp notification filters + bulk retry */}
                <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border/40">
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground mr-1">
                    WhatsApp:
                  </span>
                  <Button
                    variant={wooNotifFilter === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setWooNotifFilter('all')}
                    className="h-8 rounded-full text-xs px-3"
                  >
                    All
                  </Button>
                  <Button
                    variant={wooNotifFilter === 'failed' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setWooNotifFilter('failed')}
                    className="h-8 rounded-full text-xs px-3"
                  >
                    ❌ Failed ({wooFailedNotifCount.toLocaleString()})
                  </Button>
                  <Button
                    variant={wooNotifFilter === 'pending' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setWooNotifFilter('pending')}
                    className="h-8 rounded-full text-xs px-3"
                  >
                    ⏳ Pending ({wooPendingNotifCount.toLocaleString()})
                  </Button>
                  <div className="ml-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRetryAllFailedWhatsapp}
                      disabled={wooBulkRetrying || wooFailedNotifCount === 0}
                      className="h-8 rounded-full text-xs px-3 gap-1.5"
                    >
                      {wooBulkRetrying ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      Retry all failed
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Results info */}
            {!wooLoading && filteredWooOrders.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Showing <span className="font-semibold text-foreground">{((wooPage - 1) * WOO_PAGE_SIZE) + 1}–{Math.min(wooPage * WOO_PAGE_SIZE, filteredWooOrders.length)}</span> of <span className="font-semibold text-foreground">{filteredWooOrders.length}</span> orders
              </p>
            )}

            {/* Content */}
            {wooLoading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="mt-6 text-sm text-muted-foreground font-medium">Loading website orders...</p>
              </div>
            ) : filteredWooOrders.length === 0 ? (
              <Card className="border-dashed border-2 bg-gradient-to-br from-muted/30 to-muted/10">
                <CardContent className="flex flex-col items-center justify-center py-20">
                  <Globe className="h-16 w-16 text-muted-foreground/30 mb-6" />
                  {wooOrders.length === 0 ? (
                    <>
                      <p className="text-lg font-semibold text-muted-foreground mb-2">
                        No orders synced yet
                      </p>
                      <p className="text-sm text-muted-foreground/70 max-w-md text-center">
                        Orders placed on xboom.in will appear here automatically. You can also pull the latest data manually.
                      </p>
                      <Button
                        variant="default"
                        size="sm"
                        className="mt-5 gap-2"
                        onClick={handleWooManualSync}
                        disabled={wooSyncing}
                      >
                        <RefreshCw className={`h-4 w-4 ${wooSyncing ? 'animate-spin' : ''}`} />
                        {wooSyncing ? 'Syncing…' : 'Sync Now'}
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-lg font-semibold text-muted-foreground mb-2">
                        No orders match your filters
                      </p>
                      <p className="text-sm text-muted-foreground/70 max-w-md text-center">
                        {wooOrders.length.toLocaleString()} orders exist, but the current search or status filters are hiding them. Try clearing filters to see all data.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-5"
                        onClick={() => {
                          setWooSearchQuery('');
                          setWooStatusFilter('all');
                          setWooPaymentStatusFilter('all');
                        }}
                      >
                        Clear filters
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            ) : wooViewMode === 'table' ? (
              <Card className="shadow-sm border-border/60 overflow-hidden">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/60 bg-muted/30">
                          <th className="p-3 text-left font-semibold text-muted-foreground">Order ID</th>
                          <th className="p-3 text-left font-semibold text-muted-foreground">Customer</th>
                          <th className="p-3 text-left font-semibold text-muted-foreground">Product</th>
                          <th className="p-3 text-left font-semibold text-muted-foreground">Amount</th>
                          <th className="p-3 text-left font-semibold text-muted-foreground">Status</th>
                          <th className="p-3 text-left font-semibold text-muted-foreground">Payment</th>
                          <th className="p-3 text-left font-semibold text-muted-foreground">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedWooOrders.map((order) => {
                          const customerName = (!order.customer_name || order.customer_name === 'Unknown') ? (order.customer_email || `Order #${order.woo_order_id}`) : order.customer_name;
                          const productName = (!order.product_name || order.product_name === 'Unknown Product') ? `Order #${order.order_number || order.woo_order_id}` : order.product_name;
                          return (
                          <tr key={order.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                            <td className="p-3 font-mono font-medium text-primary">#{order.order_number || order.woo_order_id}</td>
                            <td className="p-3">
                              <div className="font-medium">{customerName}</div>
                              {order.customer_email && customerName !== order.customer_email && <div className="text-xs text-muted-foreground">{order.customer_email}</div>}
                            </td>
                            <td className="p-3">
                              <div className="max-w-[200px] truncate">{productName}</div>
                              {order.quantity > 1 && <div className="text-xs text-muted-foreground">Qty: {order.quantity}</div>}
                            </td>
                            <td className="p-3 font-semibold">₹{(order.total_sales_amount || 0).toLocaleString('en-IN')}</td>
                            <td className="p-3">
                              <Badge variant="outline" className={`text-xs capitalize ${
                                order.order_status === 'completed' ? 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400' :
                                order.order_status === 'processing' ? 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400' :
                                order.order_status === 'failed' || order.order_status === 'cancelled' ? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400' :
                                order.order_status === 'refunded' ? 'border-muted-foreground/40 bg-muted/30 text-muted-foreground' :
                                'border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
                              }`}>
                                {order.order_status || 'pending'}
                              </Badge>
                            </td>
                            <td className="p-3">
                              <Badge variant="outline" className={`text-xs capitalize ${
                                order.payment_status === 'paid' ? 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400' :
                                order.payment_status === 'failed' ? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400' :
                                'border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
                              }`}>
                                {order.payment_status || 'pending'}
                              </Badge>
                            </td>
                            <td className="p-3 text-muted-foreground text-xs">{order.woo_created_at ? new Date(order.woo_created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {paginatedWooOrders.map((order) => (
                  <WooOrderCard
                    key={order.id}
                    order={order}
                    onClick={(o) => handleWooOrderClick(o)}
                    onUpdated={() => {
                      refetchWooOrders();
                      refetchWooSync();
                    }}
                  />
                ))}
              </div>
            )}
            {/* Pagination */}
            {wooTotalPages > 1 && !wooLoading && filteredWooOrders.length > 0 && (
              <div className="flex items-center justify-center gap-1.5">
                <Button variant="outline" size="sm" onClick={() => setWooPage(1)} disabled={wooPage === 1} className="h-8 px-3 rounded-lg text-xs">«</Button>
                <Button variant="outline" size="sm" onClick={() => setWooPage(p => Math.max(1, p - 1))} disabled={wooPage === 1} className="h-8 px-3 rounded-lg text-xs">‹ Prev</Button>
                {Array.from({ length: Math.min(5, wooTotalPages) }, (_, i) => {
                  let pageNum: number;
                  if (wooTotalPages <= 5) pageNum = i + 1;
                  else if (wooPage <= 3) pageNum = i + 1;
                  else if (wooPage >= wooTotalPages - 2) pageNum = wooTotalPages - 4 + i;
                  else pageNum = wooPage - 2 + i;
                  return (
                    <Button key={pageNum} variant={wooPage === pageNum ? 'default' : 'outline'} size="sm" onClick={() => setWooPage(pageNum)} className="h-8 w-8 p-0 rounded-lg text-xs">{pageNum}</Button>
                  );
                })}
                <Button variant="outline" size="sm" onClick={() => setWooPage(p => Math.min(wooTotalPages, p + 1))} disabled={wooPage === wooTotalPages} className="h-8 px-3 rounded-lg text-xs">Next ›</Button>
                <Button variant="outline" size="sm" onClick={() => setWooPage(wooTotalPages)} disabled={wooPage === wooTotalPages} className="h-8 px-3 rounded-lg text-xs">»</Button>
              </div>
            )}

            {/* Order detail + status history dialog */}
            <WooOrderDetailDialog
              order={selectedWooOrder}
              open={wooDetailOpen}
              onOpenChange={setWooDetailOpen}
              onUpdated={() => {
                refetchWooOrders();
                refetchWooSync();
              }}
            />
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
                showProcurementRate={false}
                userRole={role || 'sales'}
                preSelectEnquiryId={preSelectEnquiryId || undefined}
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
              <OrderProfitAnalytics orders={manualOrders} onCardClick={handleAnalyticsCardClick} />
            </TabsContent>
          )}

          {canViewPipelineAnalytics && (
            <TabsContent value="pipeline_analytics" className="mt-0">
              <OrderPipelineAnalytics />
            </TabsContent>
          )}

          {(role === 'supply_chain' || role === 'admin') && (
            <TabsContent value="support_calls" className="space-y-6 mt-0">
              <SupportCallsDashboard logs={supportCallLogs} />
              <CallLogsPanel defaultDepartment="support" onLogsLoaded={setSupportCallLogs} />
            </TabsContent>
          )}

          <TabsContent value="deleted" className="mt-0">
            <DeletedOrdersTab />
          </TabsContent>
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
