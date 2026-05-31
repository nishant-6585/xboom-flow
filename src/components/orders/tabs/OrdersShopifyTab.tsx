import { useState } from 'react';
import { TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { ShopifyPipelineWidget } from '@/components/shopify/ShopifyPipelineWidget';
import { ShopifyOrderDetailDialog } from '@/components/orders/ShopifyOrderDetailDialog';
import {
  Loader2, ShoppingBag, Search, Filter, X, ChevronDown, LayoutGrid, Table,
} from 'lucide-react';
import type { ShopifyOrder } from '@/hooks/useShopifyOrders';

export interface OrdersShopifyTabProps {
  isAdmin: boolean;
  shopifyTotalCount: number;
  shopifyLoading: boolean;
  filteredShopifyOrders: ShopifyOrder[];
  paginatedShopifyOrders: ShopifyOrder[];
  shopifyTotalPages: number;
  SHOPIFY_PAGE_SIZE: number;
  shopifyPage: number;
  setShopifyPage: (n: number | ((p: number) => number)) => void;
  shopifySearchQuery: string;
  setShopifySearchQuery: (v: string) => void;
  shopifyStatusFilter: string;
  setShopifyStatusFilter: (v: string) => void;
  shopifyPaymentStatusFilter: string;
  setShopifyPaymentStatusFilter: (v: string) => void;
  shopifyStartDate: Date | undefined;
  shopifyEndDate: Date | undefined;
  setShopifyStartDate: (d: Date | undefined) => void;
  setShopifyEndDate: (d: Date | undefined) => void;
  shopifyViewMode: 'cards' | 'table';
  setShopifyViewMode: (m: 'cards' | 'table') => void;
  hasActiveShopifyFilters: boolean;
  clearShopifyFilters: () => void;
  refetchShopifyOrders: () => void;
}

export default function OrdersShopifyTab(props: OrdersShopifyTabProps) {
  const {
    isAdmin, shopifyTotalCount, shopifyLoading,
    filteredShopifyOrders, paginatedShopifyOrders, shopifyTotalPages,
    SHOPIFY_PAGE_SIZE, shopifyPage, setShopifyPage,
    shopifySearchQuery, setShopifySearchQuery,
    shopifyStatusFilter, setShopifyStatusFilter,
    shopifyPaymentStatusFilter, setShopifyPaymentStatusFilter,
    shopifyStartDate, shopifyEndDate, setShopifyStartDate, setShopifyEndDate,
    shopifyViewMode, setShopifyViewMode,
    hasActiveShopifyFilters, clearShopifyFilters,
    refetchShopifyOrders,
  } = props;

  // Locally-owned: detail dialog state — only consumed in this tab
  const [shopifyFiltersOpen, setShopifyFiltersOpen] = useState(false);
  const [selectedShopifyOrder, setSelectedShopifyOrder] = useState<ShopifyOrder | null>(null);
  const [shopifyDetailOpen, setShopifyDetailOpen] = useState(false);

  return (
    <TabsContent value="shopify" className="space-y-6 mt-0">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-xl bg-green-500/10">
          <ShoppingBag className="h-5 w-5 text-green-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Shopify Orders</h2>
          <p className="text-xs text-muted-foreground">{shopifyTotalCount.toLocaleString()} orders synced from Shopify (separate database)</p>
        </div>
      </div>

      {isAdmin && <ShopifyPipelineWidget />}

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
                  <Button variant="ghost" size="sm" className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 p-0 hover:bg-muted rounded-full" onClick={() => setShopifySearchQuery('')}>
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
                  <Button variant={shopifyViewMode === 'cards' ? 'default' : 'ghost'} size="sm" onClick={() => setShopifyViewMode('cards')} className={`h-9 w-9 p-0 rounded-lg ${shopifyViewMode === 'cards' ? 'shadow-sm' : 'hover:bg-muted/50'}`}>
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button variant={shopifyViewMode === 'table' ? 'default' : 'ghost'} size="sm" onClick={() => setShopifyViewMode('table')} className={`h-9 w-9 p-0 rounded-lg ${shopifyViewMode === 'table' ? 'shadow-sm' : 'hover:bg-muted/50'}`}>
                    <Table className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <Collapsible open={shopifyFiltersOpen} onOpenChange={setShopifyFiltersOpen}>
              <CollapsibleContent className="animate-in slide-in-from-top-2 duration-200">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-5 border-t border-border/50">
                  <Select value={shopifyStatusFilter} onValueChange={setShopifyStatusFilter}>
                    <SelectTrigger className="bg-background h-10 rounded-lg border-muted-foreground/20"><SelectValue placeholder="Order Status" /></SelectTrigger>
                    <SelectContent className="bg-popover">
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={shopifyPaymentStatusFilter} onValueChange={setShopifyPaymentStatusFilter}>
                    <SelectTrigger className="bg-background h-10 rounded-lg border-muted-foreground/20"><SelectValue placeholder="Payment" /></SelectTrigger>
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

      {shopifyTotalPages > 1 && !shopifyLoading && filteredShopifyOrders.length > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{((shopifyPage - 1) * SHOPIFY_PAGE_SIZE) + 1}–{Math.min(shopifyPage * SHOPIFY_PAGE_SIZE, filteredShopifyOrders.length)}</span> of <span className="font-semibold text-foreground">{shopifyTotalCount.toLocaleString()}</span> orders
          </p>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setShopifyPage(1)} disabled={shopifyPage === 1} className="h-8 px-3 rounded-lg text-xs">«</Button>
            <Button variant="outline" size="sm" onClick={() => setShopifyPage((p) => Math.max(1, p - 1))} disabled={shopifyPage === 1} className="h-8 px-3 rounded-lg text-xs">‹ Prev</Button>
            {Array.from({ length: Math.min(5, shopifyTotalPages) }, (_, i) => {
              let pageNum: number;
              if (shopifyTotalPages <= 5) pageNum = i + 1;
              else if (shopifyPage <= 3) pageNum = i + 1;
              else if (shopifyPage >= shopifyTotalPages - 2) pageNum = shopifyTotalPages - 4 + i;
              else pageNum = shopifyPage - 2 + i;
              return (<Button key={pageNum} variant={shopifyPage === pageNum ? 'default' : 'outline'} size="sm" onClick={() => setShopifyPage(pageNum)} className="h-8 w-8 p-0 rounded-lg text-xs">{pageNum}</Button>);
            })}
            <Button variant="outline" size="sm" onClick={() => setShopifyPage((p) => Math.min(shopifyTotalPages, p + 1))} disabled={shopifyPage === shopifyTotalPages} className="h-8 px-3 rounded-lg text-xs">Next ›</Button>
            <Button variant="outline" size="sm" onClick={() => setShopifyPage(shopifyTotalPages)} disabled={shopifyPage === shopifyTotalPages} className="h-8 px-3 rounded-lg text-xs">»</Button>
          </div>
        </div>
      )}

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

      {shopifyTotalPages > 1 && (
        <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{((shopifyPage - 1) * SHOPIFY_PAGE_SIZE) + 1}–{Math.min(shopifyPage * SHOPIFY_PAGE_SIZE, filteredShopifyOrders.length)}</span> of <span className="font-semibold text-foreground">{shopifyTotalCount.toLocaleString()}</span> orders
          </p>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setShopifyPage(1)} disabled={shopifyPage === 1} className="h-8 px-3 rounded-lg text-xs">«</Button>
            <Button variant="outline" size="sm" onClick={() => setShopifyPage((p) => Math.max(1, p - 1))} disabled={shopifyPage === 1} className="h-8 px-3 rounded-lg text-xs">‹ Prev</Button>
            {Array.from({ length: Math.min(5, shopifyTotalPages) }, (_, i) => {
              let pageNum: number;
              if (shopifyTotalPages <= 5) pageNum = i + 1;
              else if (shopifyPage <= 3) pageNum = i + 1;
              else if (shopifyPage >= shopifyTotalPages - 2) pageNum = shopifyTotalPages - 4 + i;
              else pageNum = shopifyPage - 2 + i;
              return (<Button key={pageNum} variant={shopifyPage === pageNum ? 'default' : 'outline'} size="sm" onClick={() => setShopifyPage(pageNum)} className="h-8 w-8 p-0 rounded-lg text-xs">{pageNum}</Button>);
            })}
            <Button variant="outline" size="sm" onClick={() => setShopifyPage((p) => Math.min(shopifyTotalPages, p + 1))} disabled={shopifyPage === shopifyTotalPages} className="h-8 px-3 rounded-lg text-xs">Next ›</Button>
            <Button variant="outline" size="sm" onClick={() => setShopifyPage(shopifyTotalPages)} disabled={shopifyPage === shopifyTotalPages} className="h-8 px-3 rounded-lg text-xs">»</Button>
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
  );
}