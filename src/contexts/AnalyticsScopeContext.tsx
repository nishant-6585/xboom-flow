import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

const STORAGE_KEY = "analytics:includeWebsite";

interface AnalyticsScopeValue {
  includeWebsite: boolean;
  setIncludeWebsite: (v: boolean) => void;
  toggleIncludeWebsite: () => void;
}

const AnalyticsScopeContext = createContext<AnalyticsScopeValue | null>(null);

export function AnalyticsScopeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [includeWebsite, setIncludeWebsiteState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const setIncludeWebsite = useCallback(
    (v: boolean) => {
      setIncludeWebsiteState(v);
      try {
        window.localStorage.setItem(STORAGE_KEY, String(v));
      } catch {
        /* ignore */
      }
      // Invalidate analytics-scoped queries so they refetch with the new flag
      queryClient.invalidateQueries({ queryKey: ["sales-leaderboard"] });
      queryClient.invalidateQueries({ queryKey: ["lead-source-perf"] });
      queryClient.invalidateQueries({ queryKey: ["key-metrics-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["key-metrics-trend"] });
      queryClient.invalidateQueries({ queryKey: ["orders-dashboard-profits"] });
    },
    [queryClient],
  );

  const toggleIncludeWebsite = useCallback(
    () => setIncludeWebsite(!includeWebsite),
    [includeWebsite, setIncludeWebsite],
  );

  // Cross-tab sync
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue !== null) {
        setIncludeWebsiteState(e.newValue === "true");
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const value = useMemo(
    () => ({ includeWebsite, setIncludeWebsite, toggleIncludeWebsite }),
    [includeWebsite, setIncludeWebsite, toggleIncludeWebsite],
  );

  return <AnalyticsScopeContext.Provider value={value}>{children}</AnalyticsScopeContext.Provider>;
}

export function useAnalyticsScope(): AnalyticsScopeValue {
  const ctx = useContext(AnalyticsScopeContext);
  if (!ctx) {
    // Safe fallback so components don't crash if provider is missing
    return {
      includeWebsite: false,
      setIncludeWebsite: () => {},
      toggleIncludeWebsite: () => {},
    };
  }
  return ctx;
}

/**
 * Helper for filtering an array of orders client-side based on the toggle.
 * Treats null/undefined `source` as 'manual'.
 */
export function filterByAnalyticsScope<T extends { source?: string | null }>(
  rows: T[],
  includeWebsite: boolean,
): T[] {
  if (includeWebsite) return rows;
  return rows.filter((r) => (r.source ?? "manual") !== "website");
}