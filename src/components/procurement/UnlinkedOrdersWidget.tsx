import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useOrders, Order } from '@/hooks/useOrders';
import { useOrderProcurementLinks } from '@/hooks/useOrderProcurementLinks';
import { LinkProcurementDialog } from './LinkProcurementDialog';
import { Link2, AlertCircle, Package, ArrowRight, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { Link } from 'react-router-dom';

interface UnlinkedOrdersWidgetProps {
  maxItems?: number;
  showViewAll?: boolean;
}

export function UnlinkedOrdersWidget({ maxItems = 5, showViewAll = true }: UnlinkedOrdersWidgetProps) {
  const { role } = useAuth();
  const { orders, loading: ordersLoading } = useOrders();
  const { links, loading: linksLoading, refetch: refetchLinks } = useOrderProcurementLinks();
  
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);

  const canManage = role === 'admin' || role === 'supply_chain' || role === 'finance';

  // Find orders that have no procurement links and are in procurement-relevant statuses
  const unlinkedOrders = useMemo(() => {
    const linkedOrderIds = new Set(links.map(l => l.order_id));
    
    // Filter orders that need procurement matching
    const procurementStatuses = [
      'procurement_to_plan',
      'procurement_in_process', 
      'procurement_done',
      'delivery_done'
    ];
    
    return orders.filter(order => {
      // Order should be in a status that suggests procurement is relevant
      const needsProcurement = procurementStatuses.includes(order.status);
      // Order should not already be linked
      const isUnlinked = !linkedOrderIds.has(order.id);
      // Order should have some value
      const hasValue = (order.total_sales_amount ?? 0) > 0 || (order.procurement_rate ?? 0) > 0;
      
      return needsProcurement && isUnlinked && hasValue;
    }).sort((a, b) => {
      // Sort by priority (lower is higher priority) then by date
      const priorityDiff = (a.priority ?? 5) - (b.priority ?? 5);
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [orders, links]);

  const displayedOrders = unlinkedOrders.slice(0, maxItems);
  const remainingCount = unlinkedOrders.length - maxItems;

  const handleLinkClick = (order: Order) => {
    setSelectedOrder(order);
    setLinkDialogOpen(true);
  };

  const handleLinkSuccess = () => {
    setLinkDialogOpen(false);
    setSelectedOrder(null);
    refetchLinks();
  };

  const loading = ordersLoading || linksLoading;

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Unlinked Orders
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (unlinkedOrders.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4 text-green-600" />
            Unlinked Orders
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Package className="h-4 w-4" />
            All orders are linked to procurements
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <CardTitle className="text-base">Unlinked Orders</CardTitle>
              <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                {unlinkedOrders.length}
              </Badge>
            </div>
            {showViewAll && unlinkedOrders.length > 0 && (
              <Link to="/procurement?tab=tracker">
                <Button variant="ghost" size="sm" className="text-xs gap-1">
                  View Tracker
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            )}
          </div>
          <CardDescription>
            Orders needing procurement matching
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <ScrollArea className="h-[280px]">
            <div className="space-y-2">
              {displayedOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-background hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {order.order_number || order.id.slice(0, 8)}
                      </span>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {order.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {order.product_name} • {order.customer_company}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>₹{(order.total_sales_amount ?? 0).toLocaleString()}</span>
                      <span>•</span>
                      <span>{formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}</span>
                    </div>
                  </div>
                  {canManage && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleLinkClick(order)}
                      className="shrink-0 ml-2"
                    >
                      <Link2 className="h-3 w-3 mr-1" />
                      Link
                    </Button>
                  )}
                </div>
              ))}
              {remainingCount > 0 && (
                <div className="text-center py-2">
                  <Link to="/procurement?tab=tracker">
                    <Button variant="link" size="sm" className="text-xs">
                      +{remainingCount} more orders
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {selectedOrder && (
        <LinkProcurementDialog
          open={linkDialogOpen}
          onOpenChange={setLinkDialogOpen}
          orderId={selectedOrder.id}
          orderNumber={selectedOrder.order_number || undefined}
          productName={selectedOrder.product_name}
          onLinked={() => {
            setLinkDialogOpen(false);
            setSelectedOrder(null);
            refetchLinks();
          }}
        />
      )}
    </>
  );
}
