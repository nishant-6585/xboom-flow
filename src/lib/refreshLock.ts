/**
 * Cross-tab token refresh lock using BroadcastChannel.
 * Ensures only one tab performs a token refresh at a time.
 */

const LOCK_KEY = "xboom_refresh_lock";
const LOCK_TTL_MS = 10_000; // 10 second lock TTL

let channel: BroadcastChannel | null = null;

try {
  channel = new BroadcastChannel("xboom_auth_sync");
} catch {
  // BroadcastChannel not supported (e.g., some older browsers)
}

interface LockData {
  lockedAt: number;
  tabId: string;
}

const TAB_ID = crypto.randomUUID();

/**
 * Attempt to acquire a cross-tab refresh lock.
 * Returns true if this tab acquired the lock.
 */
export function acquireRefreshLock(): boolean {
  try {
    const existing = localStorage.getItem(LOCK_KEY);
    if (existing) {
      const lock: LockData = JSON.parse(existing);
      // If lock is stale (>10s), allow overwrite
      if (Date.now() - lock.lockedAt < LOCK_TTL_MS) {
        return false; // Another tab holds the lock
      }
    }

    const lockData: LockData = { lockedAt: Date.now(), tabId: TAB_ID };
    localStorage.setItem(LOCK_KEY, JSON.stringify(lockData));
    return true;
  } catch {
    return true; // If localStorage fails, proceed anyway
  }
}

/**
 * Release the refresh lock (only if this tab holds it).
 */
export function releaseRefreshLock(): void {
  try {
    const existing = localStorage.getItem(LOCK_KEY);
    if (existing) {
      const lock: LockData = JSON.parse(existing);
      if (lock.tabId === TAB_ID) {
        localStorage.removeItem(LOCK_KEY);
      }
    }
  } catch {
    localStorage.removeItem(LOCK_KEY);
  }
}

/**
 * Broadcast a session-refreshed event to other tabs.
 */
export function broadcastSessionRefresh(): void {
  try {
    channel?.postMessage({ type: "SESSION_REFRESHED", tabId: TAB_ID, at: Date.now() });
  } catch {
    // Ignore broadcast failures
  }
}

/**
 * Listen for session refresh events from other tabs.
 */
export function onSessionRefreshFromOtherTab(callback: () => void): () => void {
  if (!channel) return () => {};

  const handler = (event: MessageEvent) => {
    if (event.data?.type === "SESSION_REFRESHED" && event.data?.tabId !== TAB_ID) {
      callback();
    }
  };

  channel.addEventListener("message", handler);
  return () => channel?.removeEventListener("message", handler);
}
