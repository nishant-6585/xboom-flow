import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, IndianRupee } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCanMarkWebsitePayment } from "@/hooks/useCanMarkWebsitePayment";

interface Props {
  wooOrderId: string;
  currentStatus: string | null;
  onSuccess?: () => void;
}

/**
 * Mark a pending/on-hold WooCommerce order as paid. Visible only to admins
 * and users in `payment_marker_grants`. RPC enforces server-side.
 */
export function MarkWebsitePaymentButton({ wooOrderId, currentStatus, onSuccess }: Props) {
  const { data: canMark } = useCanMarkWebsitePayment();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const normalized = (currentStatus || "").toLowerCase();
  const eligible = normalized === "pending" || normalized === "on-hold";

  if (!canMark || !eligible) return null;

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const handleConfirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("mark_website_order_paid", {
        _woo_order_id: wooOrderId,
      });
      if (error) throw error;
      toast.success(`Order #${wooOrderId} marked as paid`, {
        description: "Procurement created and order moved to the main pipeline.",
      });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["woo-orders"] });
      qc.invalidateQueries({ queryKey: ["woocommerce-orders"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["inventory-procurements"] });
      onSuccess?.();
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : "Failed to mark as paid";
      let msg = raw;
      if (raw.includes("permission_denied")) {
        msg = "You don't have permission to mark website payments.";
      } else if (raw.includes("order_not_eligible")) {
        msg = "This order is not in a state that can be marked as paid.";
      }
      toast.error("Could not mark as paid", { description: msg });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={stop} onPointerDown={stop}>
      <Button
        size="sm"
        variant="outline"
        className="h-8 w-full gap-1.5 text-xs border-green-500/40 text-green-700 dark:text-green-400 hover:bg-green-500/10"
        onClick={(e) => {
          stop(e);
          setOpen(true);
        }}
      >
        <IndianRupee className="h-3.5 w-3.5" />
        Mark Payment Received
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent onClick={stop}>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark this order as paid?</AlertDialogTitle>
            <AlertDialogDescription>
              Order #{wooOrderId} will move to <strong>processing</strong>, a procurement
              record will be created, and it will appear in the main orders pipeline.
              This action cannot be undone from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={handleConfirm}>
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                  Marking…
                </>
              ) : (
                "Confirm Payment"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}