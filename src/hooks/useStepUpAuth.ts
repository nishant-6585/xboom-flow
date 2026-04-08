import { useState, useCallback } from "react";
import { needsStepUpAuth } from "@/lib/deviceTrust";
import { useAuth } from "@/hooks/useAuth";

/**
 * Hook for step-up authentication on sensitive actions.
 *
 * Usage:
 *   const { requireStepUp, stepUpProps } = useStepUpAuth();
 *
 *   const handleSensitiveAction = async () => {
 *     const proceed = await requireStepUp("payroll approval");
 *     if (!proceed) return; // Dialog is shown, will call back when verified
 *     doSensitiveAction();
 *   };
 *
 *   return <><StepUpAuth {...stepUpProps} /><button onClick={handleSensitiveAction}>Approve</button></>
 */
export function useStepUpAuth() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [actionLabel, setActionLabel] = useState("");
  const [pendingResolve, setPendingResolve] = useState<((v: boolean) => void) | null>(null);

  const requireStepUp = useCallback(
    async (label: string = "this action"): Promise<boolean> => {
      if (!user?.id) return false;

      const needed = await needsStepUpAuth(user.id);
      if (!needed) return true; // MFA was recent, proceed

      // Show dialog and await verification
      return new Promise<boolean>((resolve) => {
        setActionLabel(label);
        setPendingResolve(() => resolve);
        setOpen(true);
      });
    },
    [user?.id]
  );

  const handleVerified = useCallback(() => {
    setOpen(false);
    pendingResolve?.(true);
    setPendingResolve(null);
  }, [pendingResolve]);

  const handleClose = useCallback(() => {
    setOpen(false);
    pendingResolve?.(false);
    setPendingResolve(null);
  }, [pendingResolve]);

  return {
    requireStepUp,
    stepUpProps: {
      open,
      onClose: handleClose,
      onVerified: handleVerified,
      actionLabel,
    },
  };
}
