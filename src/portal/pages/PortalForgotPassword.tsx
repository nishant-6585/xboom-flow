import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function PortalForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/portal/set-password`,
    });
    setSubmitting(false);
    if (error) {
      setErr(error.message || "Failed to send reset email.");
      return;
    }
    setSent(true);
  };

  return (
    <div
      className="portal-scope min-h-[100dvh] flex items-center justify-center px-4"
      style={{
        background:
          "linear-gradient(135deg, hsl(var(--portal-navy)) 0%, hsl(var(--portal-navy-soft)) 100%)",
      }}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-baseline gap-1">
            <span className="text-4xl font-bold text-white">x</span>
            <span className="text-4xl font-bold" style={{ color: "hsl(var(--portal-gold))" }}>
              boom
            </span>
          </div>
          <p className="text-white/70 text-sm mt-2 uppercase tracking-[2px]">Customer Portal</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Reset your password</CardTitle>
            <CardDescription>
              Enter the email you use for the portal and we'll send you a link to set a new password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <Alert className="mb-4">
                <AlertDescription>
                  If an account exists for <strong>{email}</strong>, a password reset link has been sent.
                  Check your inbox (and spam folder).
                </AlertDescription>
              </Alert>
            ) : (
              <>
                {err && (
                  <Alert className="mb-4" variant="destructive">
                    <AlertDescription>{err}</AlertDescription>
                  </Alert>
                )}
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Work email</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Send reset link
                  </Button>
                </form>
              </>
            )}

            <p className="text-xs text-muted-foreground text-center mt-6">
              Remembered it?{" "}
              <Link to="/portal/login" className="underline hover:text-foreground">
                Back to sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}