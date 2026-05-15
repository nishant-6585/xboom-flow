import { Link } from "react-router-dom";
import { PortalLayout } from "@/portal/components/PortalLayout";
import { OrderStateBadge } from "@/portal/components/OrderStateBadge";
import { usePortalOrders } from "@/portal/hooks/usePortalOrders";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, ArrowRight } from "lucide-react";

function formatINR(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export default function PortalOrders() {
  const { data: orders, isLoading, error } = usePortalOrders();

  return (
    <PortalLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Orders</h1>
        <p className="text-sm text-muted-foreground mt-1">Track every order from quote to delivery.</p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="py-8 text-sm text-destructive">
            Couldn't load your orders. Please refresh or contact support.
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && (orders?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center text-center">
            <Package className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium">No orders yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              When your account manager creates an order, it will appear here.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {orders?.map((o) => (
          <Link key={o.id} to={`/portal/orders/${o.id}`} className="block group">
            <Card className="transition-shadow group-hover:shadow-md">
              <CardContent className="py-4 px-5 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{o.order_number}</span>
                    <OrderStateBadge state={o.current_state} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {o.customer_po_number && <span>PO: {o.customer_po_number}</span>}
                    <span>ETA: {formatDate(o.customer_facing_eta)}</span>
                    <span>Updated {formatDate(o.updated_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 sm:gap-6">
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Order value</div>
                    <div className="font-semibold">{formatINR(o.total)}</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </PortalLayout>
  );
}