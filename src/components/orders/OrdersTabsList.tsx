import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  LayoutGrid, ShoppingBag, Globe, Target, BarChart3, RotateCcw, Phone, Trash2, Inbox,
} from 'lucide-react';

/** Plain count text — quiet, and absent entirely when the count is zero. */
function TabCount({ value }: { value: number }) {
  if (!value) return null;
  return <span className="ml-1 font-mono text-[10px] text-muted-foreground">{value.toLocaleString()}</span>;
}

const TRIGGER = 'gap-1.5 whitespace-nowrap shrink-0 h-8 px-3 text-[12.5px]';

export interface OrdersTabsListProps {
  sourceFilter: 'all' | 'manual' | 'website_auto';
  filteredOrdersCount: number;
  wooTotalCount: number;
  shopifyTotalCount: number;
  refundCount: number;
  canViewPipelineAnalytics: boolean;
  canCreateOrder: boolean;
  canViewRefunds: boolean;
  canViewSupportCalls: boolean;
  isAdmin: boolean;
  sourceCounts?: { all: number; manual: number; website_auto: number };
  attributionRequestsCount?: number;
  canManageAttribution?: boolean;
}

export function OrdersTabsList(props: OrdersTabsListProps) {
  const {
    sourceFilter, filteredOrdersCount, wooTotalCount, shopifyTotalCount, refundCount,
    canViewPipelineAnalytics, canCreateOrder, canViewRefunds, canViewSupportCalls, isAdmin,
    sourceCounts, attributionRequestsCount = 0, canManageAttribution = false,
  } = props;

  const allOrdersBadge = sourceCounts
    ? sourceCounts[sourceFilter]
    : (sourceFilter === 'manual' ? filteredOrdersCount
       : sourceFilter === 'website_auto' ? wooTotalCount
       : filteredOrdersCount + wooTotalCount);

  return (
    <TabsList className="bg-muted/60 p-1 h-auto flex overflow-x-auto scrollbar-hide gap-1 rounded-lg border border-border/50 justify-start max-w-full">
      <TabsTrigger value="list" className={TRIGGER}>
        <LayoutGrid className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">All Orders</span>
        <TabCount value={allOrdersBadge} />
      </TabsTrigger>
      <TabsTrigger value="shopify" className={TRIGGER}>
        <ShoppingBag className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Shopify</span>
        <TabCount value={shopifyTotalCount} />
      </TabsTrigger>
      <TabsTrigger value="website" className={TRIGGER}>
        <Globe className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Website Orders</span>
        <TabCount value={wooTotalCount} />
      </TabsTrigger>
      <TabsTrigger value="pipeline" className={TRIGGER}>
        <Target className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Pipeline</span>
      </TabsTrigger>
      {canManageAttribution && (
        <TabsTrigger value="attribution_requests" className={TRIGGER}>
          <Inbox className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Attribution</span>
          <TabCount value={attributionRequestsCount} />
        </TabsTrigger>
      )}
      {canViewPipelineAnalytics && (
        <TabsTrigger value="pipeline_analytics" className={TRIGGER}>
          <BarChart3 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Pipeline Analytics</span>
        </TabsTrigger>
      )}
      {canViewRefunds && (
        <TabsTrigger value="refunds" className={TRIGGER}>
          <RotateCcw className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Refunds</span>
          <TabCount value={refundCount} />
        </TabsTrigger>
      )}
      {canViewSupportCalls && (
        <TabsTrigger value="support_calls" className={TRIGGER}>
          <Phone className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Support Calls</span>
        </TabsTrigger>
      )}
      {isAdmin && (
        <TabsTrigger value="analytics" className={TRIGGER}>
          <BarChart3 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Analytics</span>
        </TabsTrigger>
      )}
      <TabsTrigger value="deleted" className={TRIGGER}>
        <Trash2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Deleted</span>
      </TabsTrigger>
    </TabsList>
  );
}