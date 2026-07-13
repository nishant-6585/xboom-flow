import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePortalAuth } from "@/portal/hooks/usePortalAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

/** New non-consuming invite landing page. Reads ?invite=<token>, lets the
 * user choose a password, and calls the portal-activate edge function which
 * validates the token, sets the password, marks the token used, and signs
 * the user in. The token is NOT consumed by visiting this page (email
 * scanners / link previews can hit it safely). */
export default function PortalActivate() {
  const navigate = useNavigate();
  const { refresh } = usePortalAuth();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [invite, setInvite] = useState<string | null>(null);
  const [linkValid, setLinkValid] = useState<boolean | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const t = url.searchParams.get("invite");
    if (t) {
      setInvite(t);
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
    if (!invite) return setErr("Invalid invite link.");
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("portal-activate", {
      body: { invite, new_password: pw },
    });
    setSubmitting(false);
    let apiErr = (data as { error?: string } | null)?.error;
    if (!apiErr && error) {
      try {
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          const body = await ctx.json();
          apiErr = body?.error;
        }
      } catch { /* ignore */ }
    }
    if (error || apiErr) return setErr(apiErr || error?.message || "Failed to set password.");
    const session = (data as { session?: { access_token: string; refresh_token: string } | null })?.session;
    if (session) {
      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      // Wait for the portal_contacts row to be linked & readable before
      // navigating — PortalProtectedRoute will bounce us back to /portal/login
      // if it renders while `contact` is still null. onAuthStateChange fires
      // asynchronously, so setSession returning is NOT proof the hydrate has
      // completed. Poll up to ~5s.
      const deadline = Date.now() + 5000;
      // Kick off an explicit hydrate; then confirm the contact row is visible.
      // eslint-disable-next-line no-await-in-loop
      while (Date.now() < deadline) {
        const { data: c } = await supabase
          .from("portal_contacts")
          .select("id")
          .eq("auth_user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
          .eq("is_active", true)
          .maybeSingle();
        if (c) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      await refresh();
    }
    window.history.replaceState({}, "", "/portal/activate");
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
                Your invite link is missing required information. Ask your account manager to resend the invite.
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