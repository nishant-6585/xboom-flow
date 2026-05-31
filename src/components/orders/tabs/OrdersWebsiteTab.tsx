import { TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { WooSyncHealthCard } from '@/components/orders/WooSyncHealthCard';
import { WooOrderCard } from '@/components/orders/WooOrderCard';
import { WooOrderDetailDialog } from '@/components/orders/WooOrderDetailDialog';
import { WOO_STATUS_OPTIONS } from '@/components/orders/WooOrderStatusActions';
import {
  Loader2, Globe, Search, X, ChevronDown, LayoutGrid, Table, RefreshCw,
} from 'lucide-react';
import type { WooCommerceOrder } from '@/hooks/useWooCommerceOrders';

export interface WooStats {
  totalOrders: number;
  statusCounts: Record<string, number>;
  grouped: { success: number; failed: number; pending: number; processing: number };
  revenue: { total: number; completed: number; lost: number };
  lastSyncedAt: string | null;
  todayOrders: number;
}

export interface OrdersWebsiteTabProps {
  wooOrders: WooCommerceOrder[];
  wooLoading: boolean;
  wooTotalCount: number;
  wooStats: WooStats;
  wooGap: number | null;
  wooApiTotal: number | null;
  wooDbTotal: number | null;
  wooFailedNotifCount: number;
  wooPendingNotifCount: number;
  filteredWooOrders: WooCommerceOrder[];
  paginatedWooOrders: WooCommerceOrder[];
  wooTotalPages: number;
  WOO_PAGE_SIZE: number;
  wooPage: number;
  setWooPage: (n: number | ((p: number) => number)) => void;
  wooSearchQuery: string;
  setWooSearchQuery: (v: string) => void;
  wooStatusFilter: string;
  setWooStatusFilter: (v: string) => void;
  wooPaymentStatusFilter: string;
  setWooPaymentStatusFilter: (v: string) => void;
  wooNotifFilter: 'all' | 'failed' | 'pending';
  setWooNotifFilter: (v: 'all' | 'failed' | 'pending') => void;
  wooViewMode: 'cards' | 'table';
  setWooViewMode: (m: 'cards' | 'table') => void;
  wooSyncing: boolean;
  wooBulkRetrying: boolean;
  handleWooManualSync: () => void;
  handleRetryAllFailedWhatsapp: () => void;
  handleWooOrderClick: (o: WooCommerceOrder) => void;
  refetchWooOrders: () => void;
  refetchWooSync: () => void;
  selectedWooOrder: WooCommerceOrder | null;
  wooDetailOpen: boolean;
  setWooDetailOpen: (open: boolean) => void;
  formatINR: (n: number) => string;
  timeAgo: (iso: string | null) => string;
}

export default function OrdersWebsiteTab(props: OrdersWebsiteTabProps) {
  const {
    wooOrders, wooLoading, wooTotalCount, wooStats,
    wooGap, wooApiTotal, wooDbTotal,
    wooFailedNotifCount, wooPendingNotifCount,
    filteredWooOrders, paginatedWooOrders, wooTotalPages, WOO_PAGE_SIZE,
    wooPage, setWooPage,
    wooSearchQuery, setWooSearchQuery,
    wooStatusFilter, setWooStatusFilter,
    wooPaymentStatusFilter, setWooPaymentStatusFilter,
    wooNotifFilter, setWooNotifFilter,
    wooViewMode, setWooViewMode,
    wooSyncing, wooBulkRetrying,
    handleWooManualSync, handleRetryAllFailedWhatsapp, handleWooOrderClick,
    refetchWooOrders, refetchWooSync,
    selectedWooOrder, wooDetailOpen, setWooDetailOpen,
    formatINR, timeAgo,
  } = props;

  return (
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
          <Button variant="outline" size="sm" onClick={handleWooManualSync} disabled={wooSyncing || wooLoading} className="h-9 gap-2 rounded-lg">
            <RefreshCw className={`h-4 w-4 ${wooSyncing ? 'animate-spin' : ''}`} />
            {wooSyncing ? 'Syncing…' : 'Sync Now'}
          </Button>
        </div>
      </div>

      <WooSyncHealthCard onSyncTriggered={() => refetchWooOrders()} />

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
            <p className="font-semibold">{wooGap > 100 ? 'Data mismatch detected.' : 'Data still syncing.'}</p>
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
                <Button variant="ghost" size="sm" className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 p-0 hover:bg-muted rounded-full" onClick={() => setWooSearchQuery('')}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Select value={wooPaymentStatusFilter} onValueChange={setWooPaymentStatusFilter}>
              <SelectTrigger className="w-[160px] h-11 rounded-xl"><SelectValue placeholder="Payment" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Payments</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="refunded">Refunded</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Button variant={wooViewMode === 'cards' ? 'default' : 'ghost'} size="sm" onClick={() => setWooViewMode('cards')} className={`h-9 w-9 p-0 rounded-lg ${wooViewMode === 'cards' ? 'shadow-sm' : 'hover:bg-muted/50'}`}>
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button variant={wooViewMode === 'table' ? 'default' : 'ghost'} size="sm" onClick={() => setWooViewMode('table')} className={`h-9 w-9 p-0 rounded-lg ${wooViewMode === 'table' ? 'shadow-sm' : 'hover:bg-muted/50'}`}>
                <Table className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground mr-1">Status:</span>
            <Select value={wooStatusFilter} onValueChange={setWooStatusFilter}>
              <SelectTrigger className="w-[200px] h-9 rounded-lg"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  Processing + Pending + Shipped ({((wooStats.statusCounts['processing'] || 0) + (wooStats.statusCounts['pending'] || 0) + (wooStats.statusCounts['shipped'] || 0)).toLocaleString()})
                </SelectItem>
                {WOO_STATUS_OPTIONS
                  .filter((s) => s.value === 'processing' || s.value === 'pending' || s.value === 'shipped')
                  .map((s) => {
                    const count = wooStats.statusCounts[s.value] || 0;
                    return (<SelectItem key={s.value} value={s.value}>{s.label} ({count.toLocaleString()})</SelectItem>);
                  })}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border/40">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground mr-1">WhatsApp:</span>
            <Button variant={wooNotifFilter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setWooNotifFilter('all')} className="h-8 rounded-full text-xs px-3">All</Button>
            <Button variant={wooNotifFilter === 'failed' ? 'default' : 'outline'} size="sm" onClick={() => setWooNotifFilter('failed')} className="h-8 rounded-full text-xs px-3">❌ Failed ({wooFailedNotifCount.toLocaleString()})</Button>
            <Button variant={wooNotifFilter === 'pending' ? 'default' : 'outline'} size="sm" onClick={() => setWooNotifFilter('pending')} className="h-8 rounded-full text-xs px-3">⏳ Pending ({wooPendingNotifCount.toLocaleString()})</Button>
            <div className="ml-auto">
              <Button variant="outline" size="sm" onClick={handleRetryAllFailedWhatsapp} disabled={wooBulkRetrying || wooFailedNotifCount === 0} className="h-8 rounded-full text-xs px-3 gap-1.5">
                {wooBulkRetrying ? (<Loader2 className="h-3.5 w-3.5 animate-spin" />) : (<RefreshCw className="h-3.5 w-3.5" />)}
                Retry all failed
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {!wooLoading && filteredWooOrders.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Showing <span className="font-semibold text-foreground">{((wooPage - 1) * WOO_PAGE_SIZE) + 1}–{Math.min(wooPage * WOO_PAGE_SIZE, filteredWooOrders.length)}</span> of <span className="font-semibold text-foreground">{filteredWooOrders.length}</span> orders
        </p>
      )}

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
                <p className="text-lg font-semibold text-muted-foreground mb-2">No orders synced yet</p>
                <p className="text-sm text-muted-foreground/70 max-w-md text-center">
                  Orders placed on xboom.in will appear here automatically. You can also pull the latest data manually.
                </p>
                <Button variant="default" size="sm" className="mt-5 gap-2" onClick={handleWooManualSync} disabled={wooSyncing}>
                  <RefreshCw className={`h-4 w-4 ${wooSyncing ? 'animate-spin' : ''}`} />
                  {wooSyncing ? 'Syncing…' : 'Sync Now'}
                </Button>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold text-muted-foreground mb-2">No orders match your filters</p>
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
              onUpdated={() => { refetchWooOrders(); refetchWooSync(); }}
            />
          ))}
        </div>
      )}

      {wooTotalPages > 1 && !wooLoading && filteredWooOrders.length > 0 && (
        <div className="flex items-center justify-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => setWooPage(1)} disabled={wooPage === 1} className="h-8 px-3 rounded-lg text-xs">«</Button>
          <Button variant="outline" size="sm" onClick={() => setWooPage((p) => Math.max(1, p - 1))} disabled={wooPage === 1} className="h-8 px-3 rounded-lg text-xs">‹ Prev</Button>
          {Array.from({ length: Math.min(5, wooTotalPages) }, (_, i) => {
            let pageNum: number;
            if (wooTotalPages <= 5) pageNum = i + 1;
            else if (wooPage <= 3) pageNum = i + 1;
            else if (wooPage >= wooTotalPages - 2) pageNum = wooTotalPages - 4 + i;
            else pageNum = wooPage - 2 + i;
            return (<Button key={pageNum} variant={wooPage === pageNum ? 'default' : 'outline'} size="sm" onClick={() => setWooPage(pageNum)} className="h-8 w-8 p-0 rounded-lg text-xs">{pageNum}</Button>);
          })}
          <Button variant="outline" size="sm" onClick={() => setWooPage((p) => Math.min(wooTotalPages, p + 1))} disabled={wooPage === wooTotalPages} className="h-8 px-3 rounded-lg text-xs">Next ›</Button>
          <Button variant="outline" size="sm" onClick={() => setWooPage(wooTotalPages)} disabled={wooPage === wooTotalPages} className="h-8 px-3 rounded-lg text-xs">»</Button>
        </div>
      )}

      <WooOrderDetailDialog
        order={selectedWooOrder}
        open={wooDetailOpen}
        onOpenChange={setWooDetailOpen}
        onUpdated={() => { refetchWooOrders(); refetchWooSync(); }}
      />
    </TabsContent>
  );
}