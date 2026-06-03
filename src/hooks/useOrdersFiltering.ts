import { startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import type { Order } from '@/hooks/useOrders';
import type { ShopifyOrder } from '@/hooks/useShopifyOrders';
import type { WooCommerceOrder } from '@/hooks/useWooCommerceOrders';

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

const isWebsiteMirror = (o: Order) => o.source === 'website';

const isWebsiteMirrorPaid = (o: Order) => {
  const total = Number(o.total_sales_amount) || 0;
  const paid = Number(o.amount_paid) || 0;
  return o.payment_status === 'full' || (total > 0 && paid >= total);
};

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

  const filteredOrders = a.orders.filter(o => {
    if (!passesManualOrderFilters(o)) return false;
    const isWebsite = isWebsiteMirror(o);
    if (a.sourceFilter === 'manual') return !isWebsite;
    if (a.sourceFilter === 'website_auto') return isWebsite && isWebsiteMirrorPaid(o);
    return !isWebsite || isWebsiteMirrorPaid(o);
  });

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

  const unifiedRows: UnifiedRow[] = (() => {
    const rows: UnifiedRow[] = [];
    // Orders table rows are already source-filtered above. This includes
    // paid Website (Auto) mirrors, which must be counted in the same way they
    // are displayed in the list.
    for (const o of filteredOrders) {
      const d = new Date(o.order_date || o.created_at).getTime() || 0;
      rows.push({ kind: 'manual', date: d, row: o });
    }
    // Live Woo feed — only include for 'all' and 'website_auto'.
    if (a.sourceFilter === 'all' || a.sourceFilter === 'website_auto') {
      const mirroredWooIds = new Set(
        a.orders
          .filter((o) => o.source === 'website')
          .map((o) => String(o.external_id || '')),
      );
      const sl = a.searchQuery.toLowerCase().trim();
      for (const o of a.wooOrders) {
        const s = (o.order_status || '').toLowerCase();
        if (!ALL_ORDERS_WEBSITE_STATUSES.has(s)) continue;
        if (mirroredWooIds.has(String(o.woo_order_id || ''))) continue;
        // Website (Auto) entries must be paid orders only.
        if ((o.payment_status || '').toLowerCase() !== 'paid') continue;
        if (sl) {
          const hit =
            (o.order_number?.toLowerCase().includes(sl)) ||
            (o.woo_order_id?.toLowerCase().includes(sl) ?? false) ||
            (o.product_name?.toLowerCase().includes(sl) ?? false) ||
            (o.customer_name?.toLowerCase().includes(sl) ?? false) ||
            (o.customer_email?.toLowerCase().includes(sl) ?? false);
          if (!hit) continue;
        }
        const dIso = o.woo_created_at || o.created_at;
        const d = dIso ? new Date(dIso).getTime() : 0;
        if (a.startDate && d < startOfDay(a.startDate).getTime()) continue;
        if (a.endDate && d > endOfDay(a.endDate).getTime()) continue;
        rows.push({ kind: 'woo', date: d, row: o });
      }
    }
    rows.sort((x, y) => y.date - x.date);
    return rows;
  })();

  // === Counts for the source-filter dropdown =====================================
  // These reflect what the user will actually see when each source is selected
  // (date / search / status / paid filters all respected), independent of the
  // currently-selected sourceFilter — so the dropdown is never misleading.
  const dateOk = (d: number) => {
    if (a.startDate && d < startOfDay(a.startDate).getTime()) return false;
    if (a.endDate && d > endOfDay(a.endDate).getTime()) return false;
    return true;
  };

  const manualCount = a.orders.reduce((n, o) => {
    if (!passesManualOrderFilters(o)) return n;
    if (isWebsiteMirror(o)) return n;
    return n + 1;
  }, 0);

  const websiteMirrorPaidIds = new Set<string>();
  let websiteAutoCount = 0;
  for (const o of a.orders) {
    if (!passesManualOrderFilters(o)) continue;
    if (!isWebsiteMirror(o)) continue;
    if (!isWebsiteMirrorPaid(o)) continue;
    websiteAutoCount++;
    const ext = String(o.external_id || '');
    if (ext) websiteMirrorPaidIds.add(ext);
  }

  const sl = a.searchQuery.toLowerCase().trim();
  const mirroredWooIds = new Set(
    a.orders
      .filter((o) => o.source === 'website')
      .map((o) => String(o.external_id || '')),
  );
  for (const o of a.wooOrders) {
    const s = (o.order_status || '').toLowerCase();
    if (!ALL_ORDERS_WEBSITE_STATUSES.has(s)) continue;
    if (mirroredWooIds.has(String(o.woo_order_id || ''))) continue;
    if ((o.payment_status || '').toLowerCase() !== 'paid') continue;
    if (sl) {
      const hit =
        (o.order_number?.toLowerCase().includes(sl)) ||
        (o.woo_order_id?.toLowerCase().includes(sl) ?? false) ||
        (o.product_name?.toLowerCase().includes(sl) ?? false) ||
        (o.customer_name?.toLowerCase().includes(sl) ?? false) ||
        (o.customer_email?.toLowerCase().includes(sl) ?? false);
      if (!hit) continue;
    }
    const dIso = o.woo_created_at || o.created_at;
    const d = dIso ? new Date(dIso).getTime() : 0;
    if (!dateOk(d)) continue;
    websiteAutoCount++;
  }

  const sourceCounts = {
    manual: manualCount,
    website_auto: websiteAutoCount,
    all: manualCount + websiteAutoCount,
  };

  return { filteredOrders, filteredShopifyOrders, filteredWooOrders, unifiedRows, sourceCounts };
}