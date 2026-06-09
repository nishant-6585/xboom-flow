import { TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { OrderCard } from '@/components/OrderCard';
import { OrderTable } from '@/components/OrderTable';
import { WooOrderCard } from '@/components/orders/WooOrderCard';
import { WooOrderDetailDialog } from '@/components/orders/WooOrderDetailDialog';
import { UnlinkedOrdersWidget } from '@/components/procurement/UnlinkedOrdersWidget';
import { OrdersDashboardStats } from '@/components/orders/OrdersDashboardStats';
import {
  Loader2, Package, Search, Filter, X, ChevronDown, LayoutGrid, Table,
} from 'lucide-react';
import {
  ORDER_STATUSES, PAYMENT_STATUSES, ORDER_TYPES, ORDER_OUTCOMES, CUSTOMER_TYPES,
  type Order, type OrderOutcome, type LostReason,
} from '@/hooks/useOrders';
import type { WooCommerceOrder } from '@/hooks/useWooCommerceOrders';

export type UnifiedRow =
  | { kind: 'manual'; date: number; row: Order }
  | { kind: 'woo'; date: number; row: WooCommerceOrder };

export interface OrdersListTabProps {
  // gating + ux
  canViewProcurementWidget: boolean;
  canCreateOrder: boolean;
  // search + filters
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  sourceFilter: 'all' | 'manual' | 'website_auto';
  setSourceFilter: (v: 'all' | 'manual' | 'website_auto') => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  paymentStatusFilter: string;
  setPaymentStatusFilter: (v: string) => void;
  orderTypeFilter: string;
  setOrderTypeFilter: (v: string) => void;
  outcomeFilter: string;
  setOutcomeFilter: (v: string) => void;
  paymentTermsFilter: string;
  setPaymentTermsFilter: (v: string) => void;
  salesPersonFilter: string;
  setSalesPersonFilter: (v: string) => void;
  customerTypeFilter: string;
  setCustomerTypeFilter: (v: string) => void;
  categoryFilter: string;
  setCategoryFilter: (v: string) => void;
  paymentTermsOptions: string[];
  salesPersonOptions: string[];
  categoryOptions: string[];
  hasActiveFilters: boolean;
  clearFilters: () => void;
  filtersOpen: boolean;
  setFiltersOpen: (v: boolean) => void;
  // date
  startDate: Date | undefined;
  endDate: Date | undefined;
  setStartDate: (d: Date | undefined) => void;
  setEndDate: (d: Date | undefined) => void;
  // view + counts
  viewMode: 'cards' | 'table';
  setViewMode: (m: 'cards' | 'table') => void;
  loading: boolean;
  filteredOrders: Order[];
  allOrders: Order[];
  wooTotalCount: number;
  sourceCounts: { all: number; manual: number; website_auto: number };
  // pagination
  manualPage: number;
  setManualPage: (n: number | ((p: number) => number)) => void;
  MANUAL_PAGE_SIZE: number;
  manualTotalPages: number;
  paginatedManualOrders: Order[];
  unifiedRows: UnifiedRow[];
  unifiedTotalPages: number;
  paginatedUnified: UnifiedRow[];
  // handlers
  handleOrderClick: (o: Order) => void;
  handleUpdateOutcome: (
    orderId: string,
    outcome: OrderOutcome,
    lostReason?: LostReason,
    lostReasonNotes?: string,
  ) => Promise<boolean>;
  handleWooOrderClick: (o: WooCommerceOrder) => void;
  refetchWooOrders: () => void;
  refetchWooSync: () => void;
  // dashboard stats
  dashTimePeriod: 'this_week' | 'this_month' | 'prev_month';
  setDashTimePeriod: (v: 'this_week' | 'this_month' | 'prev_month') => void;
  dashSalesPersonFilter: string;
  setDashSalesPersonFilter: (v: string) => void;
  // woo detail dialog (parent-owned because also used by website tab)
  selectedWooOrder: WooCommerceOrder | null;
  wooDetailOpen: boolean;
  setWooDetailOpen: (open: boolean) => void;
}

export default function OrdersListTab(props: OrdersListTabProps) {
  const {
    canViewProcurementWidget, canCreateOrder,
    searchQuery, setSearchQuery,
    sourceFilter, setSourceFilter,
    statusFilter, setStatusFilter,
    paymentStatusFilter, setPaymentStatusFilter,
    orderTypeFilter, setOrderTypeFilter,
    outcomeFilter, setOutcomeFilter,
    paymentTermsFilter, setPaymentTermsFilter,
    salesPersonFilter, setSalesPersonFilter,
    customerTypeFilter, setCustomerTypeFilter,
    categoryFilter, setCategoryFilter,
    paymentTermsOptions, salesPersonOptions, categoryOptions,
    hasActiveFilters, clearFilters,
    filtersOpen, setFiltersOpen,
    startDate, endDate, setStartDate, setEndDate,
    viewMode, setViewMode,
    loading, filteredOrders, wooTotalCount,
    allOrders, sourceCounts,
    manualPage, setManualPage, MANUAL_PAGE_SIZE,
    manualTotalPages, paginatedManualOrders,
    unifiedRows, unifiedTotalPages, paginatedUnified,
    handleOrderClick, handleUpdateOutcome, handleWooOrderClick,
    refetchWooOrders, refetchWooSync,
    dashTimePeriod, setDashTimePeriod,
    dashSalesPersonFilter, setDashSalesPersonFilter,
    selectedWooOrder, wooDetailOpen, setWooDetailOpen,
  } = props;

  return (
    <TabsContent value="list" className="space-y-6 mt-0">
      {canViewProcurementWidget && (
        <div className="mb-6">
          <UnlinkedOrdersWidget maxItems={3} showViewAll={true} />
        </div>
      )}

      <Card className="border border-border/60 shadow-sm bg-gradient-to-br from-card to-muted/10 backdrop-blur-sm">
        <CardContent className="p-5">
          <div className="flex flex-col gap-5">
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
                  <Button variant="ghost" size="sm" className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 p-0 hover:bg-muted rounded-full" onClick={() => setSearchQuery('')}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as 'all' | 'manual' | 'website_auto')}>
                  <SelectTrigger className="w-[200px] h-11 rounded-xl">
                    <SelectValue placeholder="Source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources ({sourceCounts.all.toLocaleString()})</SelectItem>
                    <SelectItem value="manual">Manual ({sourceCounts.manual.toLocaleString()})</SelectItem>
                    <SelectItem value="website_auto">Website (Auto) ({sourceCounts.website_auto.toLocaleString()})</SelectItem>
                  </SelectContent>
                </Select>
                <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" size="default" className="gap-2 h-11 px-4 rounded-xl border-muted-foreground/20 hover:bg-muted/50">
                      <Filter className="h-4 w-4" />
                      <span className="font-medium">Filters</span>
                      {hasActiveFilters && (
                        <Badge className="h-5 px-2 text-xs bg-primary text-primary-foreground font-semibold">Active</Badge>
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
                  <Button variant={viewMode === 'cards' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('cards')} className={`h-9 w-9 p-0 rounded-lg ${viewMode === 'cards' ? 'shadow-sm' : 'hover:bg-muted/50'}`}>
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button variant={viewMode === 'table' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('table')} className={`h-9 w-9 p-0 rounded-lg ${viewMode === 'table' ? 'shadow-sm' : 'hover:bg-muted/50'}`}>
                    <Table className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
              <CollapsibleContent className="animate-in slide-in-from-top-2 duration-200">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 pt-5 border-t border-border/50">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="bg-background h-10 rounded-lg border-muted-foreground/20"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent className="bg-popover">
                      <SelectItem value="all">All Statuses</SelectItem>
                      {ORDER_STATUSES.map(s => (<SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
                    <SelectTrigger className="bg-background h-10 rounded-lg border-muted-foreground/20"><SelectValue placeholder="Payment" /></SelectTrigger>
                    <SelectContent className="bg-popover">
                      <SelectItem value="all">All Payment Status</SelectItem>
                      {PAYMENT_STATUSES.map(s => (<SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <Select value={orderTypeFilter} onValueChange={setOrderTypeFilter}>
                    <SelectTrigger className="bg-background h-10 rounded-lg border-muted-foreground/20"><SelectValue placeholder="Type" /></SelectTrigger>
                    <SelectContent className="bg-popover">
                      <SelectItem value="all">All Types</SelectItem>
                      {ORDER_TYPES.map(t => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
                    <SelectTrigger className="bg-background h-10 rounded-lg border-muted-foreground/20"><SelectValue placeholder="Outcome" /></SelectTrigger>
                    <SelectContent className="bg-popover">
                      <SelectItem value="all">All Outcomes</SelectItem>
                      {ORDER_OUTCOMES.map(o => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <Select value={paymentTermsFilter} onValueChange={setPaymentTermsFilter}>
                    <SelectTrigger className="bg-background h-10 rounded-lg border-muted-foreground/20"><SelectValue placeholder="Terms" /></SelectTrigger>
                    <SelectContent className="bg-popover">
                      <SelectItem value="all">All Terms</SelectItem>
                      {paymentTermsOptions.map(term => (<SelectItem key={term} value={term}>{term}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <Select value={salesPersonFilter} onValueChange={setSalesPersonFilter}>
                    <SelectTrigger className="bg-background h-10 rounded-lg border-muted-foreground/20"><SelectValue placeholder="Sales Person" /></SelectTrigger>
                    <SelectContent className="bg-popover">
                      <SelectItem value="all">All Sales Persons</SelectItem>
                      {salesPersonOptions.map(name => (<SelectItem key={name} value={name}>{name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <Select value={customerTypeFilter} onValueChange={setCustomerTypeFilter}>
                    <SelectTrigger className="bg-background h-10 rounded-lg border-muted-foreground/20"><SelectValue placeholder="B2B / B2C" /></SelectTrigger>
                    <SelectContent className="bg-popover">
                      <SelectItem value="all">All Customers (B2B + B2C)</SelectItem>
                      {CUSTOMER_TYPES.map(c => (<SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="bg-background h-10 rounded-lg border-muted-foreground/20"><SelectValue placeholder="Product Category" /></SelectTrigger>
                    <SelectContent className="bg-popover">
                      <SelectItem value="all">All Categories</SelectItem>
                      {categoryOptions.map(cat => (<SelectItem key={cat} value={cat}>{cat}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="pt-4 border-t border-border/50">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-muted-foreground mr-1">Date:</span>
                <DateRangeFilter
                  startDate={startDate}
                  endDate={endDate}
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                  onClear={() => { setStartDate(undefined); setEndDate(undefined); }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <OrdersDashboardStats
        orders={(() => {
          const wooMapped = unifiedRows
            .filter((r) => r.kind === 'woo')
            .map((r: any) => {
              const w = r.row;
              return {
                id: w.id,
                order_number: w.order_number,
                status: (w.order_status || '').toLowerCase(),
                payment_status: w.payment_status,
                total_sales_amount: Number(w.total_sales_amount) || 0,
                amount_paid: Number(w.amount_paid) || 0,
                sales_person_name: w.assigned_to_name || null,
                order_date: w.woo_created_at || w.created_at,
                created_at: w.created_at,
                // Use a non-'website' token so the analytics-scope toggle
                // (which strips source='website') does not zero the
                // Total Orders / Order Value cards when the user is
                // explicitly viewing Website (Auto) feed.
                source: 'website_auto',
              } as any;
            });
          return [...filteredOrders, ...wooMapped];
        })()}
        allOrders={allOrders}
        timePeriod={dashTimePeriod}
        onTimePeriodChange={setDashTimePeriod}
        salesPersonFilter={dashSalesPersonFilter}
        onSalesPersonFilterChange={setDashSalesPersonFilter}
      />

      {!loading && filteredOrders.length > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{((manualPage - 1) * MANUAL_PAGE_SIZE) + 1}–{Math.min(manualPage * MANUAL_PAGE_SIZE, filteredOrders.length)}</span> of <span className="font-semibold text-foreground">{filteredOrders.length}</span> orders
          </p>
          {manualTotalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setManualPage(1)} disabled={manualPage === 1} className="h-8 px-3 rounded-lg text-xs">«</Button>
            <Button variant="outline" size="sm" onClick={() => setManualPage((p) => Math.max(1, p - 1))} disabled={manualPage === 1} className="h-8 px-3 rounded-lg text-xs">‹ Prev</Button>
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
            <Button variant="outline" size="sm" onClick={() => setManualPage((p) => Math.min(manualTotalPages, p + 1))} disabled={manualPage === manualTotalPages} className="h-8 px-3 rounded-lg text-xs">Next ›</Button>
            <Button variant="outline" size="sm" onClick={() => setManualPage(manualTotalPages)} disabled={manualPage === manualTotalPages} className="h-8 px-3 rounded-lg text-xs">»</Button>
          </div>
          )}
        </div>
      )}

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
      ) : viewMode === 'table' ? (
        <Card className="shadow-sm border-border/60 overflow-hidden">
          <CardContent className="p-0">
            <OrderTable
              orders={paginatedUnified.filter(u => u.kind === 'manual').map(u => u.row)}
              onOrderClick={handleOrderClick}
              onUpdateOutcome={handleUpdateOutcome}
            />
            {sourceFilter === 'website_auto' && (
              <div className="px-5 py-4 text-sm text-muted-foreground border-t">
                Table view shows manual orders only. Switch source to All or Manual, or use card view to see website orders.
              </div>
            )}
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

      {!loading && unifiedRows.length > 0 && (
        <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{((manualPage - 1) * MANUAL_PAGE_SIZE) + 1}–{Math.min(manualPage * MANUAL_PAGE_SIZE, unifiedRows.length)}</span> of <span className="font-semibold text-foreground">{unifiedRows.length}</span> orders
          </p>
          {unifiedTotalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setManualPage(1)} disabled={manualPage === 1} className="h-8 px-3 rounded-lg text-xs">«</Button>
            <Button variant="outline" size="sm" onClick={() => setManualPage((p) => Math.max(1, p - 1))} disabled={manualPage === 1} className="h-8 px-3 rounded-lg text-xs">‹ Prev</Button>
            {Array.from({ length: Math.min(5, unifiedTotalPages) }, (_, i) => {
              let pageNum: number;
              if (unifiedTotalPages <= 5) pageNum = i + 1;
              else if (manualPage <= 3) pageNum = i + 1;
              else if (manualPage >= unifiedTotalPages - 2) pageNum = unifiedTotalPages - 4 + i;
              else pageNum = manualPage - 2 + i;
              return (
                <Button key={pageNum} variant={manualPage === pageNum ? 'default' : 'outline'} size="sm" onClick={() => setManualPage(pageNum)} className="h-8 w-8 p-0 rounded-lg text-xs">{pageNum}</Button>
              );
            })}
            <Button variant="outline" size="sm" onClick={() => setManualPage((p) => Math.min(unifiedTotalPages, p + 1))} disabled={manualPage === unifiedTotalPages} className="h-8 px-3 rounded-lg text-xs">Next ›</Button>
            <Button variant="outline" size="sm" onClick={() => setManualPage(unifiedTotalPages)} disabled={manualPage === unifiedTotalPages} className="h-8 px-3 rounded-lg text-xs">»</Button>
          </div>
          )}
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