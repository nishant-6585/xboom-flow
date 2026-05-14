import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

/** Used after the user clicks the invite link from email. Supabase puts a recovery
 * session in the URL hash, so they're already temporarily authenticated. */
export default function PortalSetPassword() {
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
    });
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (pw.length < 8) return setErr("Password must be at least 8 characters.");
    if (pw !== pw2) return setErr("Passwords don't match.");
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setSubmitting(false);
    if (error) return setErr(error.message);
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
          {hasSession === false && (
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
            <Button type="submit" className="w-full" disabled={submitting || hasSession === false}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save & continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
