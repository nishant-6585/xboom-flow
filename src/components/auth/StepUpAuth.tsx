import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { recordMfaVerifiedAt } from "@/lib/deviceTrust";
import { useAuth } from "@/hooks/useAuth";

interface StepUpAuthProps {
  open: boolean;
  onClose: () => void;
  onVerified: () => void;
  actionLabel?: string;
}

/**
 * Step-up MFA re-verification dialog for sensitive actions.
 * Requires TOTP code when last MFA was > 24h ago.
 */
export const StepUpAuth = ({ open, onClose, onVerified, actionLabel = "this action" }: StepUpAuthProps) => {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const handleVerify = useCallback(async () => {
    if (code.length !== 6) return;
    setLoading(true);

    try {
      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError || !factorsData) {
        toast({ title: "Error", description: "Unable to retrieve MFA factors.", variant: "destructive" });
        return;
      }

      const totpFactor = factorsData.totp.find((f) => f.status === "verified");
      if (!totpFactor) {
        toast({ title: "No MFA factor", description: "Please set up MFA first.", variant: "destructive" });
        return;
      }

      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: totpFactor.id,
      });

      if (challengeError) {
        toast({ title: "Challenge failed", description: challengeError.message, variant: "destructive" });
        return;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: totpFactor.id,
        challengeId: challengeData.id,
        code,
      });

      if (verifyError) {
        toast({ title: "Verification failed", description: "Invalid code. Please try again.", variant: "destructive" });
        setCode("");
        return;
      }

      // Record the MFA timestamp
      if (user?.id) {
        await recordMfaVerifiedAt(user.id);
      }

      toast({ title: "Verified", description: "Identity confirmed." });
      setCode("");
      onVerified();
    } catch {
      toast({ title: "Error", description: "Verification failed.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [code, user, toast, onVerified]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-destructive" />
            <DialogTitle>Re-verify Identity</DialogTitle>
          </div>
          <DialogDescription>
            For security, please enter your MFA code to proceed with {actionLabel}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="stepup-code">6-digit code</Label>
            <Input
              id="stepup-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && code.length === 6 && handleVerify()}
              className="text-center text-2xl tracking-[0.5em] font-mono"
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={handleVerify} disabled={loading || code.length !== 6} className="flex-1">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Verify
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
