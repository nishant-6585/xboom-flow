import { useState, useCallback, useRef } from "react";
import { needsStepUpAuth } from "@/lib/deviceTrust";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

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
  // Step-up fatigue cooldown: block repeated triggers within 30 seconds
  const lastStepUpAtRef = useRef(0);
  const STEP_UP_COOLDOWN_MS = 30_000;

  const requireStepUp = useCallback(
    async (label: string = "this action"): Promise<boolean> => {
      if (!user?.id) return false;

      // Prevent concurrent step-up flows
      if (inProgressRef.current) {
        if (import.meta.env.DEV) console.warn("[StepUpAuth] Already in progress, rejecting concurrent request");
        return false;
      }

      // Cooldown: if step-up was completed recently, skip dialog
      if (Date.now() - lastStepUpAtRef.current < STEP_UP_COOLDOWN_MS) {
        if (import.meta.env.DEV) console.log("[StepUpAuth] Within cooldown window, allowing");
        return true;
      }

      // Re-check AAL from server — never trust cached state
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData?.currentLevel === "aal2") {
        const needed = await needsStepUpAuth(user.id);
        if (!needed) return true;
      }

      inProgressRef.current = true;

      return new Promise<boolean>((resolve) => {
        setActionLabel(label);
        setPendingResolve(() => (result: boolean) => {
          inProgressRef.current = false;
          if (result) lastStepUpAtRef.current = Date.now();
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
