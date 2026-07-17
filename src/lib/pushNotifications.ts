// Browser push subscription management.
//
// Pairs with public/sw.js (display + click) and the send-push edge function
// (delivery). A user who enables push here gets OS-level notifications for
// their in-app notifications even when the app tab is closed.

import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    !!VAPID_PUBLIC_KEY
  );
}

export function getPushPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/sw.js");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js");
}

/** Whether this browser currently holds an active push subscription. */
export async function isSubscribed(): Promise<boolean> {
  if (!isPushSupported() || Notification.permission !== "granted") return false;
  try {
    const reg = await getRegistration();
    return !!(await reg.pushManager.getSubscription());
  } catch {
    return false;
  }
}

/**
 * Ask for permission (if needed), subscribe this browser and persist the
 * subscription for the logged-in user. Returns an error string on failure,
 * null on success.
 */
export async function enablePush(userId: string): Promise<string | null> {
  if (!isPushSupported()) {
    return "Browser notifications are not supported in this browser.";
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return "Notification permission was denied. Click the lock icon in your browser's address bar → Notifications → Allow, then try again.";
  }

  try {
    const reg = await getRegistration();
    // Preflight: confirm the service worker actually reaches "active".
    const ready = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);
    if (!ready) {
      return "The notification service could not start — try closing and reopening this tab, then enable again.";
    }

    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      let keyBytes: Uint8Array;
      try {
        keyBytes = urlBase64ToUint8Array(VAPID_PUBLIC_KEY!);
      } catch {
        return "Push is misconfigured: the VAPID public key is invalid — contact the administrator.";
      }
      // Uncompressed P-256 public key: 65 bytes, leading 0x04.
      if (keyBytes.length !== 65 || keyBytes[0] !== 0x04) {
        return "Push is misconfigured: the VAPID public key is invalid — contact the administrator.";
      }
      try {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes.buffer as ArrayBuffer,
        });
      } catch (e) {
        return `Could not subscribe to push in this browser: ${(e as Error).message}. If you're in private/incognito mode or an unsupported browser, switch to a normal window and reload before retrying.`;
      }
    }

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return "Could not read the push subscription from the browser.";
    }

    // Save via SECURITY DEFINER RPC: a browser's endpoint is unique, and on
    // shared computers the previous row may belong to ANOTHER user — a plain
    // client-side upsert then violates RLS (cannot touch someone else's
    // row). The RPC reassigns the endpoint to whoever enables push last.
    const { error } = await (supabase.rpc as any)("save_push_subscription", {
      p_endpoint: json.endpoint,
      p_p256dh: json.keys.p256dh,
      p_auth: json.keys.auth,
      p_user_agent: navigator.userAgent.slice(0, 250),
    });
    if (error) return `Could not save the subscription: ${error.message}`;

    return null;
  } catch (e) {
    return `Could not enable browser notifications: ${(e as Error).message}`;
  }
}

/** Unsubscribe this browser and remove the stored subscription row. */
export async function disablePush(): Promise<string | null> {
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const subscription = await reg?.pushManager.getSubscription();
    if (subscription) {
      await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
      await subscription.unsubscribe();
    }
    return null;
  } catch (e) {
    return `Could not disable browser notifications: ${(e as Error).message}`;
  }
}

export type TestPushResult = { sent: number; expired: number; failed: number };

/**
 * Trigger a self-test push. The edge function authenticates the caller via
 * the JWT that supabase.functions.invoke attaches and only pushes to their
 * own subscription rows. Returns the delivery counts or an error string.
 */
export async function sendTestPush(): Promise<TestPushResult | string> {
  try {
    const { data, error } = await supabase.functions.invoke("send-push", {
      body: { test: true },
    });
    if (error) return error.message || "Could not send test notification.";
    const d = data as Partial<TestPushResult> | null;
    return {
      sent: d?.sent ?? 0,
      expired: d?.expired ?? 0,
      failed: d?.failed ?? 0,
    };
  } catch (e) {
    return `Could not send test notification: ${(e as Error).message}`;
  }
}
