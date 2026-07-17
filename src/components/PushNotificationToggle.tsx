import { useEffect, useState } from "react";
import { BellRing, BellOff, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  disablePush,
  enablePush,
  getPushPermission,
  isPushSupported,
  isSubscribed,
  sendTestPush,
} from "@/lib/pushNotifications";

/**
 * One-click opt-in/out for OS-level browser notifications. Rendered inside
 * the notification panel; hidden entirely on unsupported browsers.
 */
export function PushNotificationToggle() {
  const { user } = useAuth();
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    | { kind: "ok"; message: string }
    | { kind: "err"; message: string }
    | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    isSubscribed().then((v) => {
      if (!cancelled) {
        setSubscribed(v);
        setReady(true);
      }
    });
    return () => { cancelled = true; };
  }, []);

  if (!isPushSupported() || !user || !ready) return null;

  if (getPushPermission() === "denied") {
    return (
      <p className="text-[11px] text-muted-foreground">
        Browser notifications are blocked for this site — allow them in your
        browser's site settings to get alerts when the app is closed.
      </p>
    );
  }

  const handleToggle = async () => {
    setBusy(true);
    setTestResult(null);
    const error = subscribed ? await disablePush() : await enablePush(user.id);
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    setSubscribed(!subscribed);
    toast.success(
      subscribed
        ? "Browser notifications turned off for this browser."
        : "Browser notifications enabled — you'll get alerts even when the app tab is closed.",
    );
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await sendTestPush();
    setTesting(false);
    if (typeof result === "string") {
      setTestResult({ kind: "err", message: `${result} Try disabling and re-enabling push.` });
      return;
    }
    if (result.sent > 0) {
      setTestResult({
        kind: "ok",
        message: `Delivered to ${result.sent} browser${result.sent === 1 ? "" : "s"}.`,
      });
    } else {
      const detail = result.expired > 0
        ? `${result.expired} subscription${result.expired === 1 ? "" : "s"} expired and were cleaned up.`
        : result.failed > 0
          ? `${result.failed} attempt${result.failed === 1 ? "" : "s"} failed.`
          : "No active subscription found for this browser.";
      setTestResult({
        kind: "err",
        message: `${detail} Try disabling and re-enabling push.`,
      });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground">
          {subscribed
            ? "This browser shows notifications even when the app is closed."
            : "Get notified even when the app tab is closed."}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {subscribed && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={handleTest}
              disabled={testing || busy}
            >
              {testing ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Send className="w-3 h-3 mr-1" />
              )}
              Send test
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={handleToggle}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : subscribed ? (
              <BellOff className="w-3 h-3 mr-1" />
            ) : (
              <BellRing className="w-3 h-3 mr-1" />
            )}
            {subscribed ? "Disable" : "Enable browser notifications"}
          </Button>
        </div>
      </div>
      {testResult && (
        <p
          className={`text-[11px] ${
            testResult.kind === "ok" ? "text-green-600" : "text-red-600"
          }`}
        >
          {testResult.message}
        </p>
      )}
    </div>
  );
}
