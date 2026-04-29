import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { subMonths, startOfWeek, format } from 'date-fns';

export interface FunnelPoint {
  weekKey: string;          // yyyy-MM-dd (Mon)
  label: string;            // e.g. "12 May"
  companies: number;
  prospects: number;
  pipeline: number;
  conversionPct: number;    // pipeline / companies * 100 (0 when companies=0)
}

const MONTHS_BACK = 6;

function weekKey(d: Date) {
  return format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
}

async function fetchAllCreatedAt(table: string, sinceISO: string): Promise<string[]> {
  const all: string[] = [];
  const PAGE = 1000;
  let from = 0;
  // Bounded loop so we never hit infinite pagination
  for (let page = 0; page < 50; page++) {
    const { data, error } = await supabase
      .from(table as any)
      .select('created_at')
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    data.forEach((r: any) => r?.created_at && all.push(r.created_at));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export function useSalesFunnelTrend() {
  return useQuery({
    queryKey: ['sales-funnel-trend', MONTHS_BACK],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<{ series: FunnelPoint[]; rangeFrom: Date; rangeTo: Date }> => {
      const now = new Date();
      const rangeFrom = startOfWeek(subMonths(now, MONTHS_BACK), { weekStartsOn: 1 });
      const rangeTo = startOfWeek(now, { weekStartsOn: 1 });
      const sinceISO = rangeFrom.toISOString();

      const [companiesAt, prospectsAt, pipelineAt] = await Promise.all([
        fetchAllCreatedAt('companies', sinceISO),
        fetchAllCreatedAt('prospects', sinceISO),
        fetchAllCreatedAt('pipeline_orders', sinceISO),
      ]);

      // Build all week buckets between rangeFrom and rangeTo
      const buckets = new Map<string, FunnelPoint>();
      const cursor = new Date(rangeFrom);
      while (cursor <= rangeTo) {
        const k = weekKey(cursor);
        buckets.set(k, {
          weekKey: k,
          label: format(new Date(k), 'd MMM'),
          companies: 0,
          prospects: 0,
          pipeline: 0,
          conversionPct: 0,
        });
        cursor.setDate(cursor.getDate() + 7);
      }

      const bump = (iso: string, field: 'companies' | 'prospects' | 'pipeline') => {
        const k = weekKey(new Date(iso));
        const slot = buckets.get(k);
        if (slot) slot[field] += 1;
      };
      companiesAt.forEach((d) => bump(d, 'companies'));
      prospectsAt.forEach((d) => bump(d, 'prospects'));
      pipelineAt.forEach((d) => bump(d, 'pipeline'));

      const series = Array.from(buckets.values())
        .sort((a, b) => a.weekKey.localeCompare(b.weekKey))
        .map((p) => ({
          ...p,
          conversionPct: p.companies > 0 ? Math.round((p.pipeline / p.companies) * 100) : 0,
        }));

      return { series, rangeFrom, rangeTo };
    },
  });
}