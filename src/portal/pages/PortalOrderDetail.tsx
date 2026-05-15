import { Link, useParams } from "react-router-dom";
import { PortalLayout } from "@/portal/components/PortalLayout";
import { OrderStateBadge } from "@/portal/components/OrderStateBadge";
import { OrderTimeline } from "@/portal/components/OrderTimeline";
import { usePortalOrder } from "@/portal/hooks/usePortalOrders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ExternalLink, Truck, Package } from "lucide-react";

function formatINR(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export default function PortalOrderDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const { data, isLoading, error } = usePortalOrder(orderId);

  return (
    <PortalLayout>
      <div className="mb-6">
        <Link to="/portal/orders" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to orders
        </Link>
      </div>

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="py-8 text-sm text-destructive">Couldn't load this order.</CardContent>
        </Card>
      )}

      {!isLoading && data && !data.order && (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">Order not found</p>
            <p className="text-sm text-muted-foreground mt-1">It may have been removed or isn't visible to you.</p>
          </CardContent>
        </Card>
      )}

      {data?.order && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-semibold">{data.order.order_number}</h1>
                <OrderStateBadge state={data.order.current_state} />
              </div>
              <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {data.order.customer_po_number && <span>PO: {data.order.customer_po_number}</span>}
                <span>Created {formatDate(data.order.created_at)}</span>
                <span>ETA {formatDate(data.order.customer_facing_eta)}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Order total</div>
              <div className="text-xl font-semibold">{formatINR(data.order.total)}</div>
            </div>
          </div>

          {/* Tracking */}
          {(data.order.courier_name || data.order.awb_number || data.order.tracking_url) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Truck className="h-4 w-4" /> Shipment tracking
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Courier</div>
                    <div className="font-medium">{data.order.courier_name ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">AWB / Tracking #</div>
                    <div className="font-medium font-mono">{data.order.awb_number ?? "—"}</div>
                  </div>
                  <div className="flex items-end">
                    {data.order.tracking_url ? (
                      <Button asChild size="sm" variant="outline">
                        <a href={data.order.tracking_url} target="_blank" rel="noopener noreferrer">
                          Track package <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                        </a>
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">No tracking link yet</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Timeline */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Order progress</CardTitle>
            </CardHeader>
            <CardContent>
              <OrderTimeline currentState={data.order.current_state} transitions={data.transitions} />
            </CardContent>
          </Card>

          {/* Line items */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Items</CardTitle>
            </CardHeader>
            <CardContent>
              {data.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No items have been added to this order yet.</p>
              ) : (
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-muted-foreground border-b">
                      <tr>
                        <th className="text-left font-medium px-2 py-2">Product</th>
                        <th className="text-right font-medium px-2 py-2">Qty</th>
                        <th className="text-right font-medium px-2 py-2">Unit price</th>
                        <th className="text-right font-medium px-2 py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((item) => (
                        <tr key={item.id} className="border-b last:border-0">
                          <td className="px-2 py-3">
                            <div className="font-medium">{item.product_name_snapshot}</div>
                            {item.description && (
                              <div className="text-xs text-muted-foreground mt-0.5">{item.description}</div>
                            )}
                            {item.serial_numbers && item.serial_numbers.length > 0 && (
                              <div className="text-xs text-muted-foreground mt-1 font-mono">
                                S/N: {item.serial_numbers.join(", ")}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-3 text-right">{item.quantity}</td>
                          <td className="px-2 py-3 text-right">{formatINR(item.unit_price)}</td>
                          <td className="px-2 py-3 text-right font-medium">{formatINR(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Totals */}
              <div className="mt-4 flex justify-end">
                <dl className="text-sm w-full sm:w-72 space-y-1">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Subtotal</dt>
                    <dd>{formatINR(data.order.subtotal)}</dd>
                  </div>
                  {data.order.discount_amount && data.order.discount_amount > 0 ? (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Discount</dt>
                      <dd>− {formatINR(data.order.discount_amount)}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">GST</dt>
                    <dd>{formatINR(data.order.gst_amount)}</dd>
                  </div>
                  <div className="flex justify-between border-t pt-2 mt-2 font-semibold">
                    <dt>Total</dt>
                    <dd>{formatINR(data.order.total)}</dd>
                  </div>
                </dl>
              </div>
            </CardContent>
          </Card>

          {/* Commercial terms */}
          {(data.order.payment_terms || data.order.delivery_commitment) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Terms</CardTitle>
              </CardHeader>
              <CardContent className="text-sm grid grid-cols-1 sm:grid-cols-2 gap-4">
                {data.order.payment_terms && (
                  <div>
                    <div className="text-xs text-muted-foreground">Payment terms</div>
                    <div>{data.order.payment_terms}</div>
                  </div>
                )}
                {data.order.delivery_commitment && (
                  <div>
                    <div className="text-xs text-muted-foreground">Delivery commitment</div>
                    <div>{data.order.delivery_commitment}</div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </PortalLayout>
  );
}