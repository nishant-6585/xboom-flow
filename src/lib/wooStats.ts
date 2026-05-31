import type { WooCommerceOrder } from '@/hooks/useWooCommerceOrders';
import type { WooStats } from '@/components/orders/tabs/OrdersWebsiteTab';

export function computeWooStats(wooOrders: WooCommerceOrder[]): WooStats {
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
}

export function formatINR(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(2)} L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

export function timeAgo(iso: string | null): string {
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
}