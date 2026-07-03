import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PortalLayout } from "@/portal/components/PortalLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CheckCircle2, PackageCheck } from "lucide-react";
import { toast } from "sonner";

type ConfirmableRow = {
  order_id: string;
  order_number: string | null;
  order_date: string | null;
  product_name: string | null;
  total_sales_amount: number | null;
  confirmation_status: string;
  confirmed_at: string | null;
};

function formatINR(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}
function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function usePendingConfirmations() {
  return useQuery({
    queryKey: ["portal", "confirmable-orders"],
    queryFn: async (): Promise<ConfirmableRow[]> => {
      const { data, error } = await supabase.rpc("get_my_confirmable_orders");
      if (error) throw error;
      return (data as ConfirmableRow[]) ?? [];
    },
    staleTime: 30_000,
  });
}

export default function PortalConfirm() {
  const { data, isLoading, error, refetch } = usePendingConfirmations();
  const qc = useQueryClient();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const confirm = useMutation({
    mutationFn: async (orderId: string) => {
      setConfirmingId(orderId);
      const { data, error } = await supabase.rpc("confirm_my_order", { p_order_id: orderId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Order confirmed. Thank you!");
      qc.invalidateQueries({ queryKey: ["portal", "confirmable-orders"] });
      refetch();
    },
    onError: (e: any) => toast.error(e?.message || "Could not confirm the order"),
    onSettled: () => setConfirmingId(null),
  });

  return (
    <PortalLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Confirm your orders</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Please review and confirm the orders below so we can dispatch them.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[0, 1].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="py-8 text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> Couldn't load orders. Please refresh.
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && (data?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-3" />
            <p className="font-medium">All caught up</p>
            <p className="text-sm text-muted-foreground mt-1">
              You have no orders waiting for confirmation right now.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {data?.map((row) => (
          <Card key={row.order_id} className="border-amber-300/60">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <PackageCheck className="h-4 w-4 text-amber-600" />
                {row.order_number || "Order"}
              </CardTitle>
              <Badge variant="outline" className="border-amber-500 text-amber-700">
                Confirmation pending
              </Badge>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
              <div className="flex-1 min-w-0 text-sm">
                <div className="font-medium truncate">{row.product_name || "—"}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Ordered {formatDate(row.order_date)} · Value {formatINR(row.total_sales_amount)}
                </div>
              </div>
              <Button
                onClick={() => confirm.mutate(row.order_id)}
                disabled={confirmingId === row.order_id}
              >
                {confirmingId === row.order_id ? "Confirming…" : "Confirm order"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </PortalLayout>
  );
}
