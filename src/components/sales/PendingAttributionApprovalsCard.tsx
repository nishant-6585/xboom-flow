import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldQuestion, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { useCanAttributeWebsiteOrder } from '@/hooks/useCanAttributeWebsiteOrder';
import { usePendingAttributionRequests } from '@/hooks/useAttributionRequests';

/**
 * Dashboard widget: every pending order-attribution request raised by a
 * salesperson, surfaced to sales managers / admins (and anyone holding an
 * attribution grant). Review + approve/reject still happens in the Orders
 * "Attribution requests" queue — this card is the visibility layer.
 */
export function PendingAttributionApprovalsCard() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const canAttributeGrant = useCanAttributeWebsiteOrder();
  const canManage = role === 'admin' || role === 'sales_manager' || canAttributeGrant;

  const { data } = usePendingAttributionRequests();
  const rows = canManage ? data?.rows ?? [] : [];
  const orders = data?.orders;

  if (!canManage || rows.length === 0) return null;

  const openQueue = () => navigate('/orders?tab=attribution_requests');

  return (
    <Card className="border-amber-300 dark:border-amber-800">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <ShieldQuestion className="h-4 w-4 text-amber-600" />
          Attribution requests pending approval
          <Badge variant="secondary">{rows.length}</Badge>
        </CardTitle>
        <Button size="sm" variant="outline" className="gap-1" onClick={openQueue}>
          Review queue
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="divide-y divide-border">
          {rows.slice(0, 6).map((r) => {
            const o = orders?.get(r.order_id);
            const label = o?.order_number || o?.external_id || r.order_id.slice(0, 8);
            return (
              <button
                key={r.id}
                onClick={openQueue}
                className="w-full flex items-center justify-between gap-3 py-2 text-left hover:bg-muted/50 rounded px-1 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    #{label}
                    {o?.customer_name ? <span className="text-muted-foreground font-normal"> · {o.customer_name}</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {r.requested_by_name || 'Salesperson'} → {r.requested_for_name || 'self'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {o?.total_sales_amount ? (
                    <p className="text-sm tabular-nums">₹{Number(o.total_sales_amount).toLocaleString('en-IN')}</p>
                  ) : null}
                  <p className="text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
        {rows.length > 6 && (
          <button onClick={openQueue} className="mt-2 text-xs text-muted-foreground hover:text-foreground">
            +{rows.length - 6} more pending
          </button>
        )}
      </CardContent>
    </Card>
  );
}
