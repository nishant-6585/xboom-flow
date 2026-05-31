import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Package, Plus, BarChart3, LayoutGrid, Target, ArrowLeft, RotateCcw,
  ShoppingBag, Globe, Phone, Trash2,
} from 'lucide-react';
import { startOfDay, endOfDay, isWithinInterval, startOfMonth } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

import { OrderDialog } from '@/components/OrderDialog';
import { OrdersDashboardStats } from '@/components/orders/OrdersDashboardStats';
import { MissingPhoneBanner } from '@/components/orders/MissingPhoneBanner';
import { OrdersExportButton } from '@/components/orders/OrdersExportButton';
import { OrderPipelineAnalytics } from '@/components/orders/OrderPipelineAnalytics';

import OrdersListTab from '@/components/orders/tabs/OrdersListTab';
import OrdersShopifyTab from '@/components/orders/tabs/OrdersShopifyTab';
import OrdersWebsiteTab from '@/components/orders/tabs/OrdersWebsiteTab';
import OrdersPipelineTab from '@/components/orders/tabs/OrdersPipelineTab';
import OrdersNewOrderTab from '@/components/orders/tabs/OrdersNewOrderTab';
import OrdersRefundsTab from '@/components/orders/tabs/OrdersRefundsTab';
import OrdersAnalyticsTab from '@/components/orders/tabs/OrdersAnalyticsTab';
import OrdersSupportCallsTab from '@/components/orders/tabs/OrdersSupportCallsTab';
import OrdersDeletedTab from '@/components/orders/tabs/OrdersDeletedTab';

import {
  useOrders, Order, OrderOutcome, LostReason,
} from '@/hooks/useOrders';
import { useShopifyOrders } from '@/hooks/useShopifyOrders';
import { useWooCommerceOrders } from '@/hooks/useWooCommerceOrders';
import { useWooSyncHealth } from '@/hooks/useWooSyncHealth';
import { useNotificationOrderSets } from '@/hooks/useNotificationOrderSets';
import { useEnquiries } from '@/hooks/useEnquiries';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useAuth } from '@/hooks/useAuth';

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

  const wooOrders = wooOrdersAll;
  const wooTotalCount = wooOrders.length;

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
      grouped: { success: successCount, failed: 0, pending: 0, processing: processingCount },
      revenue: { total: totalRevenue, completed: completedRevenue, lost: 0 },
      lastSyncedAt,
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

  const [shopifyStatusFilter, setShopifyStatusFilter] = useState<string>('all');
  const [shopifyPaymentStatusFilter, setShopifyPaymentStatusFilter] = useState<string>('all');
  const [shopifySearchQuery, setShopifySearchQuery] = useState<string>('');
  const [shopifyViewMode, setShopifyViewMode] = useState<'cards' | 'table'>('cards');
  const [shopifyStartDate, setShopifyStartDate] = useState<Date | undefined>(undefined);
  const [shopifyEndDate, setShopifyEndDate] = useState<Date | undefined>(undefined);
  const [shopifyPage, setShopifyPage] = useState(1);
  const SHOPIFY_PAGE_SIZE = 100;

  const [wooSearchQuery, setWooSearchQuery] = useState<string>('');
  const [wooStatusFilter, setWooStatusFilter] = useState<string>('processing');
  const [wooPaymentStatusFilter, setWooPaymentStatusFilter] = useState<string>('all');
  const [wooViewMode, setWooViewMode] = useState<'cards' | 'table'>('cards');
  const [wooPage, setWooPage] = useState(1);
  const WOO_PAGE_SIZE = 50;
  const [wooSyncing, setWooSyncing] = useState(false);

  const [sourceFilter, setSourceFilter] = useState<'all' | 'manual' | 'website'>('all');

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

  const [manualPage, setManualPage] = useState(1);
  const MANUAL_PAGE_SIZE = 50;

  useEffect(() => { setShopifyPage(1); }, [shopifySearchQuery, shopifyStatusFilter, shopifyPaymentStatusFilter, shopifyStartDate, shopifyEndDate]);
  useEffect(() => { setManualPage(1); }, [searchQuery, statusFilter, paymentStatusFilter, orderTypeFilter, outcomeFilter, salesPersonFilter, paymentTermsFilter, customerTypeFilter, categoryFilter, startDate, endDate, sourceFilter]);
  useEffect(() => { setWooPage(1); }, [wooSearchQuery, wooStatusFilter, wooPaymentStatusFilter, wooNotifFilter]);

  useEffect(() => {
    if (tabFromUrl === 'pipeline') setActiveTab('pipeline');
    else if (tabFromUrl === 'new') setActiveTab('new');
  }, [tabFromUrl]);

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

  const manualOrders = orders;

  const filteredOrders = manualOrders.filter(o => {
    if (enquiryIdFromUrl && activeTab === 'list') return o.enquiry_id === enquiryIdFromUrl;
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
    if (startDate && endDate) matchesDate = isWithinInterval(orderDate, { start: startOfDay(startDate), end: endOfDay(endDate) });
    else if (startDate) matchesDate = orderDate >= startOfDay(startDate);
    else if (endDate) matchesDate = orderDate <= endOfDay(endDate);
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
    if (shopifyStartDate && shopifyEndDate) matchesDate = isWithinInterval(orderDate, { start: startOfDay(shopifyStartDate), end: endOfDay(shopifyEndDate) });
    else if (shopifyStartDate) matchesDate = orderDate >= startOfDay(shopifyStartDate);
    else if (shopifyEndDate) matchesDate = orderDate <= endOfDay(shopifyEndDate);
    return matchesSearch && matchesStatus && matchesPaymentStatus && matchesDate;
  });

  const clearFilters = () => {
    setStartDate(undefined); setEndDate(undefined);
    setPaymentTermsFilter('all'); setPaymentStatusFilter('all');
    setOrderTypeFilter('all'); setOutcomeFilter('all');
    setSalesPersonFilter('all'); setStatusFilter('all');
    setCustomerTypeFilter('all'); setCategoryFilter('all');
    setSearchQuery('');
    setSearchParams({});
  };

  const clearShopifyFilters = () => {
    setShopifyStartDate(undefined); setShopifyEndDate(undefined);
    setShopifyStatusFilter('all'); setShopifyPaymentStatusFilter('all');
    setShopifySearchQuery(''); setShopifyPage(1);
  };

  const manualTotalPages = Math.ceil(filteredOrders.length / MANUAL_PAGE_SIZE);
  const paginatedManualOrders = filteredOrders.slice((manualPage - 1) * MANUAL_PAGE_SIZE, manualPage * MANUAL_PAGE_SIZE);

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
      const ALL_ORDERS_WEBSITE_STATUSES = new Set([
        'processing', 'on-hold', 'shipped', 'completed', 'delivered',
      ]);
      const mirroredWooIds = new Set(
        (orders as any[])
          .filter((o) => (o as any).source === 'website')
          .map((o) => String((o as any).external_id || '')),
      );
      const searchLower = searchQuery.toLowerCase().trim();
      for (const o of wooOrders) {
        const s = (o.order_status || '').toLowerCase();
        if (!ALL_ORDERS_WEBSITE_STATUSES.has(s)) continue;
        if (mirroredWooIds.has(String(o.woo_order_id || ''))) continue;
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
  const paginatedUnified = unifiedRows.slice((manualPage - 1) * MANUAL_PAGE_SIZE, manualPage * MANUAL_PAGE_SIZE);

  const shopifyTotalPages = Math.ceil(filteredShopifyOrders.length / SHOPIFY_PAGE_SIZE);
  const paginatedShopifyOrders = filteredShopifyOrders.slice((shopifyPage - 1) * SHOPIFY_PAGE_SIZE, shopifyPage * SHOPIFY_PAGE_SIZE);

  const WEBSITE_TAB_STATUSES = ['processing', 'pending', 'shipped'] as const;
  const filteredWooOrders = wooOrders.filter(o => {
    const searchLower = wooSearchQuery.toLowerCase().trim();
    const matchesSearch = wooSearchQuery === '' ||
      (o.order_number?.toLowerCase().includes(searchLower)) ||
      (o.woo_order_id?.toLowerCase().includes(searchLower) ?? false) ||
      (o.product_name?.toLowerCase().includes(searchLower) ?? false) ||
      (o.customer_name?.toLowerCase().includes(searchLower) ?? false) ||
      (o.customer_email?.toLowerCase().includes(searchLower) ?? false);
    const status = (o.order_status || '').toLowerCase();
    if (!(WEBSITE_TAB_STATUSES as readonly string[]).includes(status)) return false;
    const matchesStatus = wooStatusFilter === 'all' ? true : status === wooStatusFilter;
    const matchesPayment = wooPaymentStatusFilter === 'all' || o.payment_status === wooPaymentStatusFilter;
    const matchesNotif =
      wooNotifFilter === 'all' ? true
      : wooNotifFilter === 'failed' ? wooFailedNotifIds.has(o.woo_order_id)
      : wooPendingNotifIds.has(o.woo_order_id);
    return matchesSearch && matchesStatus && matchesPayment && matchesNotif;
  });

  const wooTotalPages = Math.ceil(filteredWooOrders.length / WOO_PAGE_SIZE);
  const paginatedWooOrders = filteredWooOrders.slice((wooPage - 1) * WOO_PAGE_SIZE, wooPage * WOO_PAGE_SIZE);

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
    if (filter.type === 'model') setSearchQuery(filter.value);
    else setSearchQuery('');
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
    setSelectedOrder(order); setDialogOpen(true);
  };

  const handleWooOrderClick = (wooOrder: typeof wooOrders[number]) => {
    const mirrored = (orders as any[]).find(
      (o) => (o.source === 'website') && String(o.external_id || '') === String(wooOrder.woo_order_id || ''),
    );
    if (mirrored) {
      setSelectedOrder(mirrored as Order); setDialogOpen(true); return;
    }
    setSelectedWooOrder(wooOrder); setWooDetailOpen(true);
  };

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dashTimePeriod, setDashTimePeriod] = useState<'this_week' | 'this_month' | 'prev_month'>('this_month');
  const [dashSalesPersonFilter, setDashSalesPersonFilter] = useState<string>('all');

  const hasActiveFilters = statusFilter !== 'all' || paymentStatusFilter !== 'all' ||
    orderTypeFilter !== 'all' || outcomeFilter !== 'all' ||
    paymentTermsFilter !== 'all' || salesPersonFilter !== 'all' ||
    customerTypeFilter !== 'all' || categoryFilter !== 'all' ||
    !!startDate || !!endDate || !!searchQuery;

  const hasActiveShopifyFilters = shopifyStatusFilter !== 'all' || shopifyPaymentStatusFilter !== 'all' ||
    !!shopifyStartDate || !!shopifyEndDate || !!shopifySearchQuery;

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
      const { data, error } = await supabase.functions.invoke('sync-website-orders', { body: { incremental: true } });
      if (error) throw error;
      toast({ title: 'Sync triggered', description: data?.message || 'Pulling latest orders from WooCommerce…' });
      setTimeout(() => { refetchWooOrders(); refetchWooSync(); }, 3000);
    } catch (err: any) {
      toast({ title: 'Sync failed', description: err?.message || 'Could not start sync', variant: 'destructive' });
    } finally {
      setWooSyncing(false);
    }
  };

  const handleRetryAllFailedWhatsapp = async () => {
    if (wooBulkRetrying) return;
    setWooBulkRetrying(true);
    try {
      const ids: string[] = [];
      let from = 0;
      const PAGE = 1000;
      for (let i = 0; i < 10; i++) {
        const { data, error } = await supabase
          .from('order_notifications').select('id')
          .eq('channel', 'whatsapp').eq('status', 'failed')
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
      let totalSent = 0, totalRetried = 0, totalFailed = 0;
      const CHUNK = 50;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const { data, error } = await supabase.functions.invoke('send-order-status-whatsapp', { body: { notification_ids: chunk } });
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
            <OrdersAnalyticsTab orders={manualOrders} onCardClick={handleAnalyticsCardClick} />
          )}

          {canViewPipelineAnalytics && (
            <TabsContent value="pipeline_analytics" className="mt-0">
              <OrderPipelineAnalytics />
            </TabsContent>
          )}

          {(role === 'supply_chain' || role === 'admin') && <OrdersSupportCallsTab />}

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
