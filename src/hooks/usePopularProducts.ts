import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Returns a map of product_name (lowercased) -> rank (lower = more popular)
// based on total quantity sold in order_items over the last 180 days.
export function usePopularProducts(refetchInterval = DEFAULT_INTERVAL_MS) {
  const [rankMap, setRankMap] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPopular = useCallback(async () => {
    try {
      const since = new Date();
      since.setDate(since.getDate() - 180);
      const { data, error } = await supabase
        .from('order_items')
        .select('product_name, quantity, created_at')
        .gte('created_at', since.toISOString())
        .not('product_name', 'is', null)
        .limit(5000);

      if (error) throw error;
      const totals = new Map<string, number>();
      for (const row of (data ?? []) as Array<{ product_name: string | null; quantity: number | null }>) {
        if (!row.product_name) continue;
        const key = row.product_name.toLowerCase();
        totals.set(key, (totals.get(key) ?? 0) + (Number(row.quantity) || 1));
      }
      const ranked = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
      const rm = new Map<string, number>();
      ranked.forEach(([name], idx) => rm.set(name, idx));
      setRankMap(rm);
    } catch (e) {
      console.error('usePopularProducts error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) {
        setLoading(true);
        await fetchPopular();
      }
    })();
    return () => { cancelled = true; };
  }, [fetchPopular]);

  useEffect(() => {
    if (refetchInterval <= 0) return;
    intervalRef.current = setInterval(() => {
      fetchPopular();
    }, refetchInterval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchPopular, refetchInterval]);

  return { rankMap, loading, refetch: fetchPopular };
}
