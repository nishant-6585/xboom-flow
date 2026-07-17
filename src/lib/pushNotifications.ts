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
    return "Notification permission was not granted. You can enable it from the browser's site settings.";
  }

  try {
    const reg = await getRegistration();
    await navigator.serviceWorker.ready;

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
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes.buffer as ArrayBuffer,
      });
    }

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return "Could not read the push subscription from the browser.";
    }

    // Upsert on endpoint: re-enabling in the same browser refreshes the row.
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent.slice(0, 250),
      },
      { onConflict: "endpoint" },
    );
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
