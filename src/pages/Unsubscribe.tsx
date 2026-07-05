import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle, MailX } from "lucide-react";

type State =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "already" }
  | { kind: "ready" }
  | { kind: "confirming" }
  | { kind: "done" }
  | { kind: "error"; message: string };

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-email-unsubscribe`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    if (!token) { setState({ kind: "invalid" }); return; }
    (async () => {
      try {
        const res = await fetch(`${FN_URL}?token=${encodeURIComponent(token)}`, {
          method: "GET",
          headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 404) setState({ kind: "invalid" });
          else setState({ kind: "error", message: data?.error ?? `HTTP ${res.status}` });
          return;
        }
        if (data?.valid === false && data?.reason === "already_unsubscribed") {
          setState({ kind: "already" });
        } else if (data?.valid === true) {
          setState({ kind: "ready" });
        } else {
          setState({ kind: "invalid" });
        }
      } catch (e) {
        if (!cancelled) setState({ kind: "error", message: (e as Error).message });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  async function confirm() {
    setState({ kind: "confirming" });
    try {
      const res = await fetch(FN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: ANON,
          Authorization: `Bearer ${ANON}`,
        },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ kind: "error", message: data?.error ?? `HTTP ${res.status}` });
        return;
      }
      if (data?.success) setState({ kind: "done" });
      else if (data?.reason === "already_unsubscribed") setState({ kind: "already" });
      else setState({ kind: "error", message: "Unexpected response" });
    } catch (e) {
      setState({ kind: "error", message: (e as Error).message });
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <MailX className="h-10 w-10 text-muted-foreground" aria-hidden />
          </div>
          <CardTitle>Email preferences</CardTitle>
          <CardDescription>Xboom email unsubscribe</CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          {state.kind === "loading" && (
            <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking your link…
            </p>
          )}
          {state.kind === "invalid" && (
            <p className="text-sm text-muted-foreground">This unsubscribe link is invalid or expired.</p>
          )}
          {state.kind === "already" && (
            <div className="space-y-2">
              <CheckCircle2 className="h-8 w-8 mx-auto text-green-600" />
              <p className="text-sm">You're already unsubscribed from Xboom marketing emails.</p>
              <p className="text-xs text-muted-foreground">
                Account-critical emails (KYC, order updates, ticket replies, password resets) will still be sent.
              </p>
            </div>
          )}
          {state.kind === "ready" && (
            <div className="space-y-3">
              <p className="text-sm">
                Confirm to stop receiving Xboom marketing and notification emails at this address.
              </p>
              <p className="text-xs text-muted-foreground">
                Account-critical emails (KYC, order updates, ticket replies, password resets) will still be sent.
              </p>
              <Button onClick={confirm} className="w-full">Unsubscribe me</Button>
            </div>
          )}
          {state.kind === "confirming" && (
            <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Updating your preferences…
            </p>
          )}
          {state.kind === "done" && (
            <div className="space-y-2">
              <CheckCircle2 className="h-8 w-8 mx-auto text-green-600" />
              <p className="text-sm">
                You've been unsubscribed from Xboom marketing and notification emails.
              </p>
              <p className="text-xs text-muted-foreground">
                Account-critical emails (KYC, order updates, invoices, ticket replies,
                password resets) will still be delivered — these are legally required
                account notices, not marketing.
              </p>
            </div>
          )}
          {state.kind === "error" && (
            <div className="space-y-2">
              <XCircle className="h-8 w-8 mx-auto text-destructive" />
              <p className="text-sm text-destructive">{state.message}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}