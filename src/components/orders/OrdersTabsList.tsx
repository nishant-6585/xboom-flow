import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  LayoutGrid, ShoppingBag, Globe, Target, BarChart3, Plus, RotateCcw, Phone, Trash2,
} from 'lucide-react';

export interface OrdersTabsListProps {
  sourceFilter: 'all' | 'manual' | 'website_synced' | 'website_manual';
  filteredOrdersCount: number;
  wooTotalCount: number;
  shopifyTotalCount: number;
  refundCount: number;
  canViewPipelineAnalytics: boolean;
  canCreateOrder: boolean;
  canViewRefunds: boolean;
  canViewSupportCalls: boolean;
  isAdmin: boolean;
}

export function OrdersTabsList(props: OrdersTabsListProps) {
  const {
    sourceFilter, filteredOrdersCount, wooTotalCount, shopifyTotalCount, refundCount,
    canViewPipelineAnalytics, canCreateOrder, canViewRefunds, canViewSupportCalls, isAdmin,
  } = props;

  const allOrdersBadge =
    sourceFilter === 'manual' ? filteredOrdersCount
    : sourceFilter === 'website_synced' ? wooTotalCount
    : sourceFilter === 'website_manual' ? filteredOrdersCount
    : filteredOrdersCount + wooTotalCount;

  return (
    <TabsList className="bg-muted/60 backdrop-blur-sm p-1.5 h-auto flex-wrap rounded-xl border border-border/50 shadow-sm">
      <TabsTrigger value="list" className="gap-2">
        <LayoutGrid className="h-4 w-4" />
        <span className="hidden sm:inline font-medium">All Orders</span>
        <Badge variant="secondary" className="ml-1 h-5 px-2 text-xs bg-primary/10 text-primary font-semibold">
          {allOrdersBadge.toLocaleString()}
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
      {canViewSupportCalls && (
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
  );
}