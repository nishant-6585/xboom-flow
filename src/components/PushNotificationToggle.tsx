import { useEffect, useState } from "react";
import { BellRing, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  disablePush,
  enablePush,
  getPushPermission,
  isPushSupported,
  isSubscribed,
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

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-[11px] text-muted-foreground">
        {subscribed
          ? "This browser shows notifications even when the app is closed."
          : "Get notified even when the app tab is closed."}
      </p>
      <Button
        variant="outline"
        size="sm"
        className="text-xs shrink-0"
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
  );
}
