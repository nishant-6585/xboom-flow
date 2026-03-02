import { useEffect, useRef } from "react";

/**
 * Tracks real user-initiated interactions (clicks, key presses, form submissions, navigation)
 * and calls `onActivity` when they occur.
 * 
 * This does NOT track:
 * - Passive page loads without interaction
 * - Background token refresh
 * - Automated/silent requests
 */
export function useActivityTracker(onActivity: (() => void) | undefined) {
  const onActivityRef = useRef(onActivity);
  onActivityRef.current = onActivity;

  useEffect(() => {
    if (!onActivityRef.current) return;

    const handler = () => onActivityRef.current?.();

    // Track real user interactions only
    window.addEventListener("click", handler, { passive: true });
    window.addEventListener("keydown", handler, { passive: true });
    window.addEventListener("submit", handler, { passive: true });

    return () => {
      window.removeEventListener("click", handler);
      window.removeEventListener("keydown", handler);
      window.removeEventListener("submit", handler);
    };
  }, [onActivity]);
}
