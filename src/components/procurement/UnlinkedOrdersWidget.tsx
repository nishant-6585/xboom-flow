import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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

export function UnlinkedOrdersWidget({ maxItems = 4, showViewAll = true }: UnlinkedOrdersWidgetProps) {
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
      // Highest value first — with a large backlog, value is the right triage order
      const valueDiff = (b.total_sales_amount ?? 0) - (a.total_sales_amount ?? 0);
      if (valueDiff !== 0) return valueDiff;
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
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Unlinked Orders</CardTitle>
              <span className="text-sm font-semibold tabular-nums text-primary">
                {unlinkedOrders.length}
              </span>
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
          <table className="w-full">
            <tbody>
              {displayedOrders.map((order) => (
                <tr key={order.id} className="border-t border-border/60 first:border-t-0">
                  <td className="py-2 pr-3 align-middle whitespace-nowrap font-mono text-[11.5px]">
                    {order.order_number || order.id.slice(0, 8)}
                  </td>
                  <td className="py-2 pr-3 align-middle max-w-[1px] w-full">
                    <span className="block truncate text-[12.5px] text-muted-foreground">
                      {order.product_name} · {order.customer_company}
                    </span>
                  </td>
                  <td className="py-2 pr-3 align-middle text-right whitespace-nowrap font-semibold tabular-nums text-[12.5px]">
                    ₹{(order.total_sales_amount ?? 0).toLocaleString()}
                  </td>
                  <td className="py-2 pr-3 align-middle whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
                  </td>
                  {canManage && (
                    <td className="py-2 align-middle text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleLinkClick(order)}
                        className="h-7 px-2 text-xs"
                      >
                        <Link2 className="h-3 w-3 mr-1" />
                        Link
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">
            Showing the {displayedOrders.length} highest-value
            {remainingCount > 0 && (
              <>
                {' · '}
                <Link to="/procurement?tab=tracker" className="text-primary hover:underline">
                  {remainingCount} more in the tracker
                </Link>
              </>
            )}
          </p>
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
