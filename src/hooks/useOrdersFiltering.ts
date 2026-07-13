import { startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import type { Order } from '@/hooks/useOrders';
import type { ShopifyOrder } from '@/hooks/useShopifyOrders';
import type { WooCommerceOrder } from '@/hooks/useWooCommerceOrders';
import { SYSTEM_USER_ID } from '@/lib/orderSource';

export type UnifiedRow =
  | { kind: 'manual'; date: number; row: Order }
  | { kind: 'woo'; date: number; row: WooCommerceOrder };

export interface UseOrdersFilteringArgs {
  orders: Order[];
  shopifyOrders: ShopifyOrder[];
  wooOrders: WooCommerceOrder[];
  wooFailedNotifIds: Set<string>;
  wooPendingNotifIds: Set<string>;
  // manual filters
  enquiryIdFromUrl: string | null;
  activeTab: string;
  searchQuery: string;
  statusFilter: string;
  paymentTermsFilter: string;
  paymentStatusFilter: string;
  orderTypeFilter: string;
  outcomeFilter: string;
  salesPersonFilter: string;
  customerTypeFilter: string;
  categoryFilter: string;
  startDate: Date | undefined;
  endDate: Date | undefined;
  sourceFilter: 'all' | 'manual' | 'website_auto';
  // shopify
  shopifySearchQuery: string;
  shopifyStatusFilter: string;
  shopifyPaymentStatusFilter: string;
  shopifyStartDate: Date | undefined;
  shopifyEndDate: Date | undefined;
  // woo
  wooSearchQuery: string;
  wooStatusFilter: string;
  wooPaymentStatusFilter: string;
  wooNotifFilter: 'all' | 'failed' | 'pending';
}

const WEBSITE_TAB_STATUSES = new Set(['processing', 'pending', 'shipped']);
const ALL_ORDERS_WEBSITE_STATUSES = new Set([
  'processing', 'on-hold', 'shipped', 'completed', 'delivered',
]);

// "WooCommerce (Vishal)" bucket is defined by OWNERSHIP, not by source
// string: any order still assigned to the system ingestion user belongs
// here regardless of whether it was created as a live website mirror
// (source='website') or as a manual backfill row (source='manual').
// Attribution flips sales_person_id to the real rep, which is what
// removes the row from the pool. Note: the older website-mirror
// visibility rules (paid / post-procurement + pre-2026-04-30 cutoff)
// still live in useOrders itself — they apply upstream to source='website'
// rows before they reach us here.
const isSystemOwned = (o: Order) => o.sales_person_id === SYSTEM_USER_ID;

export function useOrdersFiltering(a: UseOrdersFilteringArgs) {
  const passesManualOrderFilters = (o: Order) => {
    if (a.enquiryIdFromUrl && a.activeTab === 'list') return o.enquiry_id === a.enquiryIdFromUrl;
    const sl = a.searchQuery.toLowerCase().trim();
    const matchesSearch = a.searchQuery === '' ||
      (o.order_number?.toLowerCase().includes(sl)) ||
      (o.product_name?.toLowerCase().includes(sl) ?? false) ||
      (o.customer_name?.toLowerCase().includes(sl) ?? false) ||
      (o.customer_company?.toLowerCase().includes(sl) ?? false) ||
      (o.product_code?.toLowerCase().includes(sl) ?? false);
    if (!matchesSearch) return false;
    if (a.statusFilter !== 'all' && o.status !== a.statusFilter) return false;
    if (a.paymentTermsFilter !== 'all' && o.payment_terms !== a.paymentTermsFilter) return false;
    if (a.paymentStatusFilter !== 'all' && o.payment_status !== a.paymentStatusFilter) return false;
    if (a.orderTypeFilter !== 'all' && o.order_type !== a.orderTypeFilter) return false;
    if (a.outcomeFilter !== 'all' && o.order_outcome !== a.outcomeFilter) return false;
    if (a.salesPersonFilter !== 'all' && o.sales_person_name !== a.salesPersonFilter) return false;
    if (a.customerTypeFilter !== 'all' && o.customer_type !== a.customerTypeFilter) return false;
    if (a.categoryFilter !== 'all' && o.product_category !== a.categoryFilter) return false;
    const od = new Date(o.order_date || o.created_at);
    if (a.startDate && a.endDate) return isWithinInterval(od, { start: startOfDay(a.startDate), end: endOfDay(a.endDate) });
    if (a.startDate) return od >= startOfDay(a.startDate);
    if (a.endDate) return od <= endOfDay(a.endDate);
    return true;
  };

  // Bucket every manual-table order that passes the shared filters. We keep the
  // per-source buckets so that both the visible list AND the source-filter
  // count come from the exact same predicate — they can never disagree.
  const manualBucket: Order[] = [];
  const websiteAutoManualBucket: Order[] = [];
  for (const o of a.orders) {
    if (!passesManualOrderFilters(o)) continue;
    if (isSystemOwned(o)) websiteAutoManualBucket.push(o);
    else manualBucket.push(o);
  }

  const filteredOrders =
    a.sourceFilter === 'manual'
      ? manualBucket
      : a.sourceFilter === 'website_auto'
        ? websiteAutoManualBucket
        : [...manualBucket, ...websiteAutoManualBucket];

  const filteredShopifyOrders = a.shopifyOrders.filter(o => {
    const sl = a.shopifySearchQuery.toLowerCase().trim();
    const matchesSearch = a.shopifySearchQuery === '' ||
      (o.order_number?.toLowerCase().includes(sl)) ||
      (o.product_name?.toLowerCase().includes(sl) ?? false) ||
      (o.customer_name?.toLowerCase().includes(sl) ?? false) ||
      (o.customer_company?.toLowerCase().includes(sl) ?? false) ||
      (o.product_code?.toLowerCase().includes(sl) ?? false);
    if (!matchesSearch) return false;
    if (a.shopifyStatusFilter !== 'all' && o.order_status !== a.shopifyStatusFilter) return false;
    if (a.shopifyPaymentStatusFilter !== 'all' && o.payment_status !== a.shopifyPaymentStatusFilter) return false;
    const od = new Date(o.created_at);
    if (a.shopifyStartDate && a.shopifyEndDate) return isWithinInterval(od, { start: startOfDay(a.shopifyStartDate), end: endOfDay(a.shopifyEndDate) });
    if (a.shopifyStartDate) return od >= startOfDay(a.shopifyStartDate);
    if (a.shopifyEndDate) return od <= endOfDay(a.shopifyEndDate);
    return true;
  });

  const filteredWooOrders = a.wooOrders.filter(o => {
    const sl = a.wooSearchQuery.toLowerCase().trim();
    const matchesSearch = a.wooSearchQuery === '' ||
      (o.order_number?.toLowerCase().includes(sl)) ||
      (o.woo_order_id?.toLowerCase().includes(sl) ?? false) ||
      (o.product_name?.toLowerCase().includes(sl) ?? false) ||
      (o.customer_name?.toLowerCase().includes(sl) ?? false) ||
      (o.customer_email?.toLowerCase().includes(sl) ?? false);
    if (!matchesSearch) return false;
    const status = (o.order_status || '').toLowerCase();
    if (!WEBSITE_TAB_STATUSES.has(status)) return false;
    if (a.wooStatusFilter !== 'all' && status !== a.wooStatusFilter) return false;
    if (a.wooPaymentStatusFilter !== 'all' && o.payment_status !== a.wooPaymentStatusFilter) return false;
    if (a.wooNotifFilter === 'failed' && !a.wooFailedNotifIds.has(o.woo_order_id)) return false;
    if (a.wooNotifFilter === 'pending' && !a.wooPendingNotifIds.has(o.woo_order_id)) return false;
    return true;
  });

  // Live Woo feed — compute the eligible rows once, independent of the current
  // sourceFilter selection. The same array feeds both the unified list (when
  // the user is on 'all' or 'website_auto') AND the dropdown count for
  // 'website_auto', so the count can never drift from the list.
  const wooSl = a.searchQuery.toLowerCase().trim();
  const mirroredWooIds = new Set(
    a.orders.filter((o) => !!o.external_id).map((o) => String(o.external_id)),
  );
  const wooLiveEligible: { row: WooCommerceOrder; date: number }[] = [];
  for (const o of a.wooOrders) {
    const s = (o.order_status || '').toLowerCase();
    if (!ALL_ORDERS_WEBSITE_STATUSES.has(s)) continue;
    if (mirroredWooIds.has(String(o.woo_order_id || ''))) continue;
    if ((o.payment_status || '').toLowerCase() !== 'paid') continue;
    if (wooSl) {
      const hit =
        (o.order_number?.toLowerCase().includes(wooSl)) ||
        (o.woo_order_id?.toLowerCase().includes(wooSl) ?? false) ||
        (o.product_name?.toLowerCase().includes(wooSl) ?? false) ||
        (o.customer_name?.toLowerCase().includes(wooSl) ?? false) ||
        (o.customer_email?.toLowerCase().includes(wooSl) ?? false);
      if (!hit) continue;
    }
    const dIso = o.woo_created_at || o.created_at;
    const d = dIso ? new Date(dIso).getTime() : 0;
    if (a.startDate && d < startOfDay(a.startDate).getTime()) continue;
    if (a.endDate && d > endOfDay(a.endDate).getTime()) continue;
    wooLiveEligible.push({ row: o, date: d });
  }

  const includeWooLive = a.sourceFilter === 'all' || a.sourceFilter === 'website_auto';
  const unifiedRows: UnifiedRow[] = (() => {
    const rows: UnifiedRow[] = [];
    for (const o of filteredOrders) {
      const d = new Date(o.order_date || o.created_at).getTime() || 0;
      rows.push({ kind: 'manual', date: d, row: o });
    }
    if (includeWooLive) {
      for (const w of wooLiveEligible) rows.push({ kind: 'woo', date: w.date, row: w.row });
    }
    rows.sort((x, y) => y.date - x.date);
    return rows;
  })();

  // === Counts for the source-filter dropdown ===================================
  // Derived from the SAME buckets that feed unifiedRows above, so switching
  // the source filter always yields exactly the count shown in the dropdown.
  const manualCount = manualBucket.length;
  const websiteAutoCount = websiteAutoManualBucket.length + wooLiveEligible.length;
  const sourceCounts = {
    manual: manualCount,
    website_auto: websiteAutoCount,
    all: manualCount + websiteAutoCount,
  };

  return { filteredOrders, filteredShopifyOrders, filteredWooOrders, unifiedRows, sourceCounts };
}