import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { registerTrustedDevice, clearLocalDeviceTrust } from "@/lib/deviceTrust";
import logoIcon from "@/assets/logo-icon.jpeg";

interface MFAVerificationProps {
  onVerified: () => void;
  onCancel: () => void;
}


export const MFAVerification = ({ onVerified, onCancel }: MFAVerificationProps) => {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const { toast } = useToast();

  const handleVerify = async () => {
    if (code.length !== 6) {
      toast({
        title: "Invalid code",
        description: "Please enter the 6-digit code from your authenticator app.",
        variant: "destructive",
      });
      return;
    }

    
    setLoading(true);

    try {
      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();

      if (factorsError || !factorsData) {
        toast({
          title: "Error",
          description: "Unable to retrieve MFA factors.",
          variant: "destructive",
        });
        return;
      }

      const totpFactor = factorsData.totp.find((f) => f.status === "verified");
      if (!totpFactor) {
        toast({
          title: "No MFA factor found",
          description: "Please set up MFA first.",
          variant: "destructive",
        });
        return;
      }

      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: totpFactor.id,
      });

      if (challengeError) {
        toast({
          title: "Challenge failed",
          description: challengeError.message,
          variant: "destructive",
        });
        return;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: totpFactor.id,
        challengeId: challengeData.id,
        code,
      });

      if (verifyError) {
        toast({
          title: "Verification failed",
          description: "Invalid code. Please try again.",
          variant: "destructive",
        });
        setCode("");
        return;
      }

      

      // Record MFA verification timestamp for step-up auth
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        const { recordMfaVerifiedAt } = await import("@/lib/deviceTrust");
        await recordMfaVerifiedAt(userData.user.id);

        // Register trusted device server-side if checkbox is checked
        if (rememberDevice) {
          await registerTrustedDevice(userData.user.id, 30);
        }
      }

      if (!rememberDevice) {
        // User doesn't want to remember — clear any existing trust
        clearLocalDeviceTrust();
      }

      toast({
        title: "Welcome back!",
        description: rememberDevice
          ? "MFA verified. This device is trusted for 30 days."
          : "MFA verification successful.",
      });
      onVerified();
    } catch (e) {
      toast({
        title: "Error",
        description: "MFA verification failed. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && code.length === 6) {
      void handleVerify();
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md glass animate-fade-in">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src={logoIcon} alt="Xboom Logo" className="w-12 h-12 rounded-xl" />
          </div>
          <div className="flex justify-center mb-2">
            <div className="p-2 rounded-full bg-primary/10">
              <ShieldCheck className="w-6 h-6 text-primary" />
            </div>
          </div>
          <CardTitle className="text-xl">Two-Factor Authentication</CardTitle>
          <CardDescription>
            Enter the 6-digit code from your authenticator app
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mfa-verify-code">Verification Code</Label>
            <Input
              id="mfa-verify-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={handleKeyDown}
              className="text-center text-2xl tracking-[0.5em] font-mono"
              autoFocus
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="remember-device"
              checked={rememberDevice}
              onCheckedChange={(checked) => setRememberDevice(checked === true)}
            />
            <Label htmlFor="remember-device" className="text-sm text-muted-foreground cursor-pointer">
              Remember this device for 30 days
            </Label>
          </div>

          <Button
            onClick={() => void handleVerify()}
            className="w-full"
            disabled={loading || code.length !== 6}
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Verify
          </Button>

          <Button
            variant="ghost"
            onClick={onCancel}
            className="w-full text-muted-foreground"
          >
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
