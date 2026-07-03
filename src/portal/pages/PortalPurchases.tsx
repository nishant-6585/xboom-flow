import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PortalLayout } from "@/portal/components/PortalLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Package,
  Truck,
  ExternalLink,
  CheckCircle2,
  PackageCheck,
  ShieldAlert,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { useMyKyc } from "@/hooks/useKyc";
import { usePortalOrders } from "@/portal/hooks/usePortalOrders";

type PurchaseRow = {
  order_id: string;
  order_number: string | null;
  order_date: string | null;
  product_name: string | null;
  quantity: number | null;
  total_sales_amount: number | null;
  status: string | null;
  confirmation_status: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  courier_name: string | null;
  actual_delivery: string | null;
};

function formatINR(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}
function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const STATUS_LABELS: Record<string, string> = {
  po_received: "Order received",
  payment_received: "Payment received",
  partial_payment_received: "Partial payment",
  procurement_to_plan: "Being prepared",
  procurement_in_process: "Being prepared",
  procurement_done: "Ready to ship",
  to_ship: "Ready to ship",
  in_transit: "In transit",
  delivery_done: "Delivered",
  cancelled: "Cancelled",
};

function StatusBadge({ status }: { status: string | null }) {
  const label = (status && STATUS_LABELS[status]) || status || "—";
  const tone =
    status === "delivery_done"
      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
      : status === "cancelled"
      ? "bg-red-100 text-red-800 border-red-300"
      : status === "in_transit"
      ? "bg-blue-100 text-blue-800 border-blue-300"
      : "bg-amber-100 text-amber-800 border-amber-300";
  return <Badge variant="outline" className={tone}>{label}</Badge>;
}

function usePurchases() {
  return useQuery({
    queryKey: ["portal", "my-purchases"],
    queryFn: async (): Promise<PurchaseRow[]> => {
      const { data, error } = await (supabase as any).rpc("get_my_purchases");
      if (error) throw error;
      return (data as PurchaseRow[]) ?? [];
    },
    staleTime: 30_000,
  });
}

function PendingConfirmCard({
  row,
  disabled,
  onConfirm,
  loading,
}: {
  row: PurchaseRow;
  disabled: boolean;
  onConfirm: (id: string) => void;
  loading: boolean;
}) {
  return (
    <div className="mt-3 p-3 rounded-md border border-amber-300 bg-amber-50/70 flex flex-col sm:flex-row gap-3 sm:items-center">
      <PackageCheck className="h-5 w-5 text-amber-600 shrink-0" />
      <div className="flex-1 text-sm">
        <div className="font-medium text-amber-900">Confirmation pending</div>
        <div className="text-amber-800/80 text-xs">
          Please review and confirm so we can dispatch.
        </div>
      </div>
      <Button
        size="sm"
        onClick={() => onConfirm(row.order_id)}
        disabled={disabled || loading}
      >
        {loading ? "Confirming…" : "Confirm order"}
      </Button>
    </div>
  );
}

function DetailView({ row, onBack, onConfirm, kycSatisfied, confirmingId }: {
  row: PurchaseRow;
  onBack: () => void;
  onConfirm: (id: string) => void;
  kycSatisfied: boolean;
  confirmingId: string | null;
}) {
  const pending = row.confirmation_status === "pending";
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to purchases
      </Button>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-lg">
              {row.order_number || "Order"}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Ordered {formatDate(row.order_date)}
            </p>
          </div>
          <StatusBadge status={row.status} />
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Product</div>
            <div className="font-medium">{row.product_name || "—"}</div>
            <div className="text-sm text-muted-foreground mt-0.5">
              Qty {row.quantity ?? 1} · {formatINR(row.total_sales_amount)}
            </div>
          </div>

          {pending && (
            <PendingConfirmCard
              row={row}
              disabled={!kycSatisfied}
              loading={confirmingId === row.order_id}
              onConfirm={onConfirm}
            />
          )}

          <div className="p-3 rounded-md border bg-muted/40">
            <div className="flex items-center gap-2 mb-2">
              <Truck className="h-4 w-4" />
              <span className="font-medium text-sm">Tracking</span>
            </div>
            {row.tracking_number || row.courier_name ? (
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Courier</dt>
                  <dd>{row.courier_name || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Tracking #</dt>
                  <dd>{row.tracking_number || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Delivered on</dt>
                  <dd>{formatDate(row.actual_delivery)}</dd>
                </div>
                {row.tracking_url && (
                  <div className="sm:col-span-3">
                    <a
                      href={row.tracking_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      Track shipment <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                Tracking details will appear here as soon as your order ships.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PortalPurchases() {
  const { data, isLoading, error } = usePurchases();
  const { account: kycAccount, loading: kycLoading } = useMyKyc();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const kycStatus = kycAccount?.kyc_status ?? "not_submitted";
  const kycSatisfied = kycStatus === "pending_verification" || kycStatus === "approved";

  const selected = useMemo(
    () => (data ?? []).find((r) => r.order_id === selectedId) ?? null,
    [data, selectedId],
  );

  const pendingCount = (data ?? []).filter((r) => r.confirmation_status === "pending").length;

  const confirm = useMutation({
    mutationFn: async (orderId: string) => {
      setConfirmingId(orderId);
      const { error } = await supabase.rpc("confirm_my_order", { p_order_id: orderId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Order confirmed. Thank you!");
      qc.invalidateQueries({ queryKey: ["portal", "my-purchases"] });
      qc.invalidateQueries({ queryKey: ["portal", "confirmable-orders"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not confirm the order"),
    onSettled: () => setConfirmingId(null),
  });

  return (
    <PortalLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">My Orders</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every order you've placed with xboom, with tracking and delivery status.
        </p>
      </div>

      {selected ? (
        <DetailView
          row={selected}
          onBack={() => setSelectedId(null)}
          onConfirm={(id) => confirm.mutate(id)}
          kycSatisfied={kycSatisfied}
          confirmingId={confirmingId}
        />
      ) : (
        <>
          {pendingCount > 0 && !kycLoading && !kycSatisfied && (
            <Card className="border-amber-300 bg-amber-50/60 mb-4">
              <CardContent className="py-4 flex items-start gap-3">
                <ShieldAlert className="h-5 w-5 text-amber-600 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-amber-900">Complete KYC first</p>
                  <p className="text-sm text-amber-800 mt-1">
                    You need to submit your KYC before confirming pending orders.
                  </p>
                </div>
                <Button asChild className="bg-amber-600 hover:bg-amber-700 text-white">
                  <Link to="/portal/kyc">Go to KYC</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {isLoading && (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          )}

          {error && (
            <Card>
              <CardContent className="py-8 text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4" /> Couldn't load your purchases. Please refresh.
              </CardContent>
            </Card>
          )}

          {!isLoading && !error && (data?.length ?? 0) === 0 && (
            <Card>
              <CardContent className="py-12 flex flex-col items-center text-center">
                <Package className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="font-medium">No purchases yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Orders you place with xboom will appear here.
                </p>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            {data?.map((row) => {
              const pending = row.confirmation_status === "pending";
              return (
                <Card
                  key={row.order_id}
                  className={pending ? "border-amber-300/70" : ""}
                >
                  <CardContent className="py-4 px-5">
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.order_id)}
                      className="w-full text-left flex flex-col sm:flex-row sm:items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">
                            {row.order_number || "Order"}
                          </span>
                          <StatusBadge status={row.status} />
                          {pending && (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-300">
                              Confirmation pending
                            </Badge>
                          )}
                          {row.confirmation_status === "confirmed" && (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Confirmed
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm mt-1 truncate">
                          {row.product_name || "—"}{" "}
                          <span className="text-muted-foreground">
                            · Qty {row.quantity ?? 1}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-4 gap-y-1">
                          <span>Ordered {formatDate(row.order_date)}</span>
                          {row.courier_name && <span>Courier: {row.courier_name}</span>}
                          {row.tracking_number && <span>Track: {row.tracking_number}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-muted-foreground">Order value</div>
                        <div className="font-semibold">{formatINR(row.total_sales_amount)}</div>
                      </div>
                    </button>

                    {pending && (
                      <PendingConfirmCard
                        row={row}
                        disabled={!kycSatisfied}
                        loading={confirmingId === row.order_id}
                        onConfirm={(id) => confirm.mutate(id)}
                      />
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <BusinessOrdersSection />
        </>
      )}
    </PortalLayout>
  );
}

function BusinessOrdersSection() {
  const { data: b2b, isLoading } = usePortalOrders();
  if (isLoading) return null;
  if (!b2b || b2b.length === 0) return null;
  return (
    <div className="mt-10">
      <div className="mb-3">
        <h2 className="text-lg font-semibold">Business Orders (quotes & pipeline)</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          B2B pipeline orders raised via quotes and RFQs.
        </p>
      </div>
      <div className="space-y-3">
        {b2b.map((o) => (
          <Link key={o.id} to={`/portal/orders/${o.id}`} className="block">
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="py-4 px-5 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{o.order_number}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    State: {o.current_state}
                    {o.customer_facing_eta ? ` · ETA ${formatDate(o.customer_facing_eta)}` : ""}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-muted-foreground">Total</div>
                  <div className="font-semibold">{formatINR(o.total)}</div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}