import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ShieldCheck, Copy, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import logoIcon from "@/assets/logo-icon.jpeg";

interface MFAEnrollmentProps {
  onComplete: () => void;
  onSkip?: () => void;
}

export const MFAEnrollment = ({ onComplete, onSkip }: MFAEnrollmentProps) => {
  const [step, setStep] = useState<"intro" | "qr" | "verify">("intro");
  const [qrCode, setQrCode] = useState<string>("");
  const [secret, setSecret] = useState<string>("");
  const [factorId, setFactorId] = useState<string>("");
  const [verifyCode, setVerifyCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const startEnrollment = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Xboom OS Authenticator",
      });

      if (error) {
        toast({
          title: "Enrollment failed",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      if (data) {
        setQrCode(data.totp.qr_code);
        setSecret(data.totp.secret);
        setFactorId(data.id);
        setStep("qr");
      }
    } catch (e) {
      toast({
        title: "Error",
        description: "Failed to start MFA enrollment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const verifyAndActivate = async () => {
    if (verifyCode.length !== 6) {
      toast({
        title: "Invalid code",
        description: "Please enter the 6-digit code from your authenticator app.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
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
        factorId,
        challengeId: challengeData.id,
        code: verifyCode,
      });

      if (verifyError) {
        toast({
          title: "Verification failed",
          description: "Invalid code. Please check your authenticator app and try again.",
          variant: "destructive",
        });
        setVerifyCode("");
        return;
      }

      toast({
        title: "MFA Enabled!",
        description: "Two-factor authentication is now active on your account.",
      });
      onComplete();
    } catch (e) {
      toast({
        title: "Error",
        description: "Verification failed. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (step === "intro") {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md glass animate-fade-in">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 rounded-full bg-primary/10">
                <ShieldCheck className="w-8 h-8 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl">Enable Two-Factor Authentication</CardTitle>
            <CardDescription>
              MFA is required for all accounts to protect the system. Set up your authenticator to continue.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-lg bg-secondary/50 border border-border text-sm space-y-2">
              <p className="font-medium">You'll need an authenticator app:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Google Authenticator</li>
                <li>Microsoft Authenticator</li>
                <li>Authy</li>
                <li>1Password</li>
              </ul>
            </div>
            <Button onClick={startEnrollment} className="w-full" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Set Up MFA
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "qr") {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md glass animate-fade-in">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <img src={logoIcon} alt="Xboom Logo" className="w-12 h-12 rounded-xl" />
            </div>
            <CardTitle className="text-xl">Scan QR Code</CardTitle>
            <CardDescription>
              Open your authenticator app and scan this QR code
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* QR Code */}
            <div className="flex justify-center p-4 bg-white rounded-lg">
              <img src={qrCode} alt="MFA QR Code" className="w-48 h-48" />
            </div>

            {/* Manual entry secret */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground text-center">
                Can't scan? Enter this code manually:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-secondary/50 p-2 rounded font-mono break-all text-center">
                  {secret}
                </code>
                <Button variant="outline" size="icon" onClick={copySecret} className="shrink-0">
                  {copied ? <CheckCircle className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <Button onClick={() => setStep("verify")} className="w-full">
              I've Scanned the Code
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // step === "verify"
  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md glass animate-fade-in">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-primary/10">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-xl">Verify Setup</CardTitle>
          <CardDescription>
            Enter the 6-digit code from your authenticator app to complete setup
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mfa-code">Verification Code</Label>
            <Input
              id="mfa-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="text-center text-2xl tracking-[0.5em] font-mono"
              autoFocus
            />
          </div>

          <Button
            onClick={verifyAndActivate}
            className="w-full"
            disabled={loading || verifyCode.length !== 6}
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Activate MFA
          </Button>

          <Button
            variant="ghost"
            onClick={() => setStep("qr")}
            className="w-full text-muted-foreground"
          >
            Back to QR Code
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
