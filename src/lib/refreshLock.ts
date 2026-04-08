/**
 * Cross-tab token refresh lock + session sync.
 *
 * Uses localStorage-based lock (works everywhere) with BroadcastChannel
 * as an optional fast-path notification layer.
 *
 * Deadlock prevention: locks older than LOCK_TTL_MS are automatically overridden.
 */

const LOCK_KEY = "xboom_refresh_lock";
const LOCK_TTL_MS = 10_000; // 10-second max lock age
const SYNC_KEY = "xboom_session_sync"; // localStorage key for cross-tab events

let channel: BroadcastChannel | null = null;
try {
  channel = new BroadcastChannel("xboom_auth_sync");
} catch {
  // Fallback to storage events only
}

const TAB_ID = crypto.randomUUID();

interface LockData {
  lockedAt: number;
  tabId: string;
}

// ── Lock ─────────────────────────────────────────────────

export function acquireRefreshLock(): boolean {
  try {
    const existing = localStorage.getItem(LOCK_KEY);
    if (existing) {
      const lock: LockData = JSON.parse(existing);
      // Deadlock prevention: override stale locks
      if (Date.now() - lock.lockedAt < LOCK_TTL_MS) {
        return false; // Another tab holds a valid lock
      }
      // Lock is stale → override it
      console.warn("[RefreshLock] Overriding stale lock from tab", lock.tabId);
    }
    localStorage.setItem(LOCK_KEY, JSON.stringify({ lockedAt: Date.now(), tabId: TAB_ID }));
    return true;
  } catch {
    return true; // If localStorage fails, proceed (single-tab fallback)
  }
}

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

// ── Broadcast (dual channel) ─────────────────────────────

export function broadcastSessionRefresh(): void {
  const payload = JSON.stringify({ type: "SESSION_REFRESHED", tabId: TAB_ID, at: Date.now() });

  // BroadcastChannel (fast, not universal)
  try {
    channel?.postMessage(JSON.parse(payload));
  } catch { /* noop */ }

  // localStorage storage-event fallback (universal)
  try {
    localStorage.setItem(SYNC_KEY, payload);
    // Remove immediately so the event fires again on next write
    setTimeout(() => localStorage.removeItem(SYNC_KEY), 100);
  } catch { /* noop */ }
}

/**
 * Listen for session refresh events from other tabs.
 * Uses BroadcastChannel + storage event for maximum compatibility.
 */
export function onSessionRefreshFromOtherTab(callback: () => void): () => void {
  const cleanups: (() => void)[] = [];

  // BroadcastChannel listener
  if (channel) {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "SESSION_REFRESHED" && event.data?.tabId !== TAB_ID) {
        callback();
      }
    };
    channel.addEventListener("message", handler);
    cleanups.push(() => channel?.removeEventListener("message", handler));
  }

  // Storage event fallback
  const storageHandler = (event: StorageEvent) => {
    if (event.key === SYNC_KEY && event.newValue) {
      try {
        const data = JSON.parse(event.newValue);
        if (data.type === "SESSION_REFRESHED" && data.tabId !== TAB_ID) {
          callback();
        }
      } catch { /* noop */ }
    }
  };
  window.addEventListener("storage", storageHandler);
  cleanups.push(() => window.removeEventListener("storage", storageHandler));

  return () => cleanups.forEach((fn) => fn());
}
