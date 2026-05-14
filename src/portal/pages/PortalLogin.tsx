import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { usePortalAuth } from "@/portal/hooks/usePortalAuth";

const ERROR_MESSAGES: Record<string, string> = {
  not_portal_user:
    "This account isn't set up for the customer portal. Ask your account manager to send you an invite.",
  account_suspended: "Your portal access has been suspended. Please contact your account manager.",
};

export default function PortalLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, user, contact, loading } = usePortalAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryError = new URLSearchParams(location.search).get("error");
  const queryMessage = queryError ? ERROR_MESSAGES[queryError] ?? null : null;

  useEffect(() => {
    if (!loading && user && contact) {
      navigate("/portal/dashboard", { replace: true });
    }
  }, [loading, user, contact, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: err } = await signIn(email, password);
    setSubmitting(false);
    if (err) {
      setError(err.message || "Sign in failed");
    }
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
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Enter your email and password to access your account.</CardDescription>
          </CardHeader>
          <CardContent>
            {queryMessage && (
              <Alert className="mb-4" variant="destructive">
                <AlertDescription>{queryMessage}</AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert className="mb-4" variant="destructive">
                <AlertDescription>{error}</AlertDescription>
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
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    to="/portal/forgot-password"
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Forgot?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Sign in
              </Button>
            </form>

            <p className="text-xs text-muted-foreground text-center mt-6">
              Portal access is by invitation only. Contact your account manager to get set up.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
