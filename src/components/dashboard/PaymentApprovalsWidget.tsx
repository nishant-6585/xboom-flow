import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, CreditCard, Clock } from "lucide-react";

/**
 * Dashboard widget for Finance/Admin: pending payment screenshot approvals with a
 * shortcut into the Admin > Payment Approvals screen where they can approve/reject.
 */
export function PaymentApprovalsWidget() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const canReview = role === "admin" || role === "finance";

  const [count, setCount] = useState(0);
  const [amount, setAmount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canReview) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("payment_records")
        .select("amount")
        .eq("status", "pending");
      if (cancelled) return;
      const rows = (data ?? []) as { amount: number | null }[];
      setCount(rows.length);
      setAmount(rows.reduce((sum, r) => sum + Number(r.amount ?? 0), 0));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [canReview]);

  if (!canReview || loading || count === 0) return null;

  return (
    <Card className="glass border-warning/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-warning" />
          Payment Approvals
          <Badge variant="secondary" className="ml-auto">{count} pending</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span>
            {count} payment {count === 1 ? "screenshot" : "screenshots"} awaiting review
            {amount > 0 && <> · ₹{amount.toLocaleString("en-IN")}</>}
          </span>
        </div>
        <Button size="sm" className="gap-2" onClick={() => navigate("/admin?tab=approvals")}>
          Review payments
          <ArrowRight className="w-4 h-4" />
        </Button>
      </CardContent>
    </Card>
  );
}