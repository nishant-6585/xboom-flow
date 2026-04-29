import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMemo } from 'react';
import type { Company } from '@/hooks/useCompanies';

const OPEN_PROSPECT_BLOCK = ['converted', 'lost', 'closed', 'cancelled'];
const OPEN_PIPELINE_BLOCK = ['won', 'lost', 'cancelled', 'converted'];

const norm = (s?: string | null) =>
  (s || '')
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|llp|inc|corp|company|co|industries|technologies|tech|solutions|services)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export interface CompanyEngagement {
  prospectNames: Set<string>; // normalized
  pipelineNames: Set<string>; // normalized
  loading: boolean;
}

export function useCompanyEngagementSources() {
  const prospectsQ = useQuery({
    queryKey: ['engagement-prospect-companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('prospects')
        .select('customer_company, company, status')
        .not('status', 'in', `(${OPEN_PROSPECT_BLOCK.join(',')})`);
      if (error) throw error;
      const set = new Set<string>();
      (data || []).forEach((r: any) => {
        const n1 = norm(r.customer_company);
        const n2 = norm(r.company);
        if (n1) set.add(n1);
        if (n2) set.add(n2);
      });
      return set;
    },
    staleTime: 60_000,
  });

  const pipelineQ = useQuery({
    queryKey: ['engagement-pipeline-companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pipeline_orders')
        .select('customer_company, status')
        .not('status', 'in', `(${OPEN_PIPELINE_BLOCK.join(',')})`);
      if (error) throw error;
      const set = new Set<string>();
      (data || []).forEach((r: any) => {
        const n = norm(r.customer_company);
        if (n) set.add(n);
      });
      return set;
    },
    staleTime: 60_000,
  });

  return {
    prospectNames: prospectsQ.data ?? new Set<string>(),
    pipelineNames: pipelineQ.data ?? new Set<string>(),
    loading: prospectsQ.isLoading || pipelineQ.isLoading,
  };
}

export type EngagementBucket = 'prospect' | 'pipeline' | 'both' | 'none';

export function useCompanyEngagementMap(companies: Company[]) {
  const { prospectNames, pipelineNames, loading } = useCompanyEngagementSources();

  return useMemo(() => {
    const map = new Map<string, EngagementBucket>();
    const inProspect = new Set<string>();
    const inPipeline = new Set<string>();
    const inBoth = new Set<string>();
    const none = new Set<string>();

    companies.forEach((c) => {
      const n = norm(c.name);
      const p = n ? prospectNames.has(n) : false;
      const pl = n ? pipelineNames.has(n) : false;
      let bucket: EngagementBucket = 'none';
      if (p && pl) bucket = 'both';
      else if (p) bucket = 'prospect';
      else if (pl) bucket = 'pipeline';
      map.set(c.id, bucket);
      if (bucket === 'both') inBoth.add(c.id);
      else if (bucket === 'prospect') inProspect.add(c.id);
      else if (bucket === 'pipeline') inPipeline.add(c.id);
      else none.add(c.id);
    });

    return {
      map,
      counts: {
        prospect: inProspect.size,
        pipeline: inPipeline.size,
        both: inBoth.size,
        none: none.size,
        engagedTotal: inProspect.size + inPipeline.size + inBoth.size,
      },
      ids: { prospect: inProspect, pipeline: inPipeline, both: inBoth, none },
      loading,
    };
  }, [companies, prospectNames, pipelineNames, loading]);
}