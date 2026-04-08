import { useState, useCallback, useRef } from "react";
import { needsStepUpAuth } from "@/lib/deviceTrust";
import { useAuth } from "@/hooks/useAuth";

/**
 * Hook for step-up authentication on sensitive actions.
 *
 * Includes a concurrency lock so only one step-up flow runs at a time —
 * concurrent calls receive a rejected promise instead of stacking dialogs.
 *
 * Usage:
 *   const { requireStepUp, stepUpProps } = useStepUpAuth();
 *
 *   const handleSensitiveAction = async () => {
 *     const proceed = await requireStepUp("payroll approval");
 *     if (!proceed) return;
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
  const inProgressRef = useRef(false);

  const requireStepUp = useCallback(
    async (label: string = "this action"): Promise<boolean> => {
      if (!user?.id) return false;

      // Prevent concurrent step-up flows (Phase 3 race condition fix)
      if (inProgressRef.current) {
        console.warn("[StepUpAuth] Already in progress, rejecting concurrent request");
        return false;
      }

      const needed = await needsStepUpAuth(user.id);
      if (!needed) return true; // MFA was recent, proceed

      inProgressRef.current = true;

      return new Promise<boolean>((resolve) => {
        setActionLabel(label);
        setPendingResolve(() => (result: boolean) => {
          inProgressRef.current = false;
          resolve(result);
        });
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
