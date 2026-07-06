import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

const EXPIRED_LINK_MSG =
  "This reset link has expired or was already used. Request a new one from the \u201CForgot password\u201D page.";

function friendlyTokenError(raw: string): string {
  const msg = (raw || "").toLowerCase();
  if (
    /expired|already used|invalid.*token|token.*invalid|otp_expired|otp.*invalid|token_not_found|used|consumed/.test(
      msg,
    )
  ) {
    return EXPIRED_LINK_MSG;
  }
  if (/same.*password|should be different/.test(msg)) {
    return "Your new password must be different from your current password.";
  }
  if (/weak|pwned|leaked|compromised/.test(msg)) {
    return "This password is too weak or has appeared in known data breaches. Please choose a stronger one.";
  }
  if (/at least|minimum|length/.test(msg)) {
    return "Password does not meet the minimum strength requirements.";
  }
  if (/network|failed to fetch/.test(msg)) {
    return "Network error. Check your connection and try again.";
  }
  return raw || "Failed to set password.";
}

/** Used after the user clicks the invite link from email. Supabase puts a recovery
 * session in the URL hash, so they're already temporarily authenticated. */
export default function PortalSetPassword() {
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const [tokenType, setTokenType] = useState<string | null>(null);
  const [linkValid, setLinkValid] = useState<boolean | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const t = url.searchParams.get("token_hash");
    const ty = url.searchParams.get("type");
    if (t && ty) {
      setTokenHash(t);
      setTokenType(ty);
      setLinkValid(true);
    } else {
      setLinkValid(false);
    }
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (pw.length < 8) return setErr("Password must be at least 8 characters.");
    if (pw !== pw2) return setErr("Passwords don't match.");
    if (!tokenHash || !tokenType) return setErr("Invalid invite link.");
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("portal-set-password", {
      body: { token_hash: tokenHash, type: tokenType, new_password: pw },
    });
    setSubmitting(false);
    let apiErr = (data as { error?: string } | null)?.error;
    if (!apiErr && error) {
      // Try to read the JSON body from a non-2xx response (FunctionsHttpError).
      try {
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          const body = await ctx.json();
          apiErr = body?.error;
        }
      } catch { /* ignore */ }
    }
    if (error || apiErr) return setErr(apiErr || error?.message || "Failed to set password.");
    void 0;
    const session = (data as { session?: { access_token: string; refresh_token: string } | null })?.session;
    if (session) {
      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
    }
    window.history.replaceState({}, "", "/portal/set-password");
    navigate("/portal/dashboard", { replace: true });
  };

  return (
    <div
      className="portal-scope min-h-[100dvh] flex items-center justify-center px-4"
      style={{
        background:
          "linear-gradient(135deg, hsl(var(--portal-navy)) 0%, hsl(var(--portal-navy-soft)) 100%)",
      }}
    >
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Set your password</CardTitle>
          <CardDescription>Welcome to the xboom portal. Choose a password to finish setup.</CardDescription>
        </CardHeader>
        <CardContent>
          {linkValid === false && (
            <Alert className="mb-4" variant="destructive">
              <AlertDescription>
                Your invite link has expired. Ask your account manager to resend the invite.
              </AlertDescription>
            </Alert>
          )}
          {err && (
            <Alert className="mb-4" variant="destructive">
              <AlertDescription>{err}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pw">New password</Label>
              <Input id="pw" type="password" required value={pw} onChange={(e) => setPw(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw2">Confirm password</Label>
              <Input id="pw2" type="password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={submitting || linkValid === false}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save & continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
