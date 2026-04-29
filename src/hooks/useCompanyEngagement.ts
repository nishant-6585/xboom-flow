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
        .select('customer_company, company, company_id, status, quoted_price, default_price, quantity')
        .not('status', 'in', `(${OPEN_PROSPECT_BLOCK.join(',')})`);
      if (error) throw error;
      const set = new Set<string>();
      const valueByName = new Map<string, number>();
      const valueById = new Map<string, number>();
      (data || []).forEach((r: any) => {
        const unit = Number(r.quoted_price ?? r.default_price ?? 0);
        const qty = Number(r.quantity ?? 1);
        const v = unit * qty;
        if (r.company_id) {
          valueById.set(r.company_id, (valueById.get(r.company_id) || 0) + v);
        }
        [r.customer_company, r.company].forEach((raw: string) => {
          const n = norm(raw);
          if (!n) return;
          set.add(n);
          valueByName.set(n, (valueByName.get(n) || 0) + v);
        });
      });
      return { set, valueByName, valueById };
    },
    staleTime: 60_000,
  });

  const pipelineQ = useQuery({
    queryKey: ['engagement-pipeline-companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pipeline_orders')
        .select('customer_company, company_id, status, expected_price')
        .not('status', 'in', `(${OPEN_PIPELINE_BLOCK.join(',')})`);
      if (error) throw error;
      const set = new Set<string>();
      const valueByName = new Map<string, number>();
      const valueById = new Map<string, number>();
      (data || []).forEach((r: any) => {
        const v = Number(r.expected_price || 0);
        if (r.company_id) {
          valueById.set(r.company_id, (valueById.get(r.company_id) || 0) + v);
        }
        const n = norm(r.customer_company);
        if (!n) return;
        set.add(n);
        valueByName.set(n, (valueByName.get(n) || 0) + v);
      });
      return { set, valueByName, valueById };
    },
    staleTime: 60_000,
  });

  return {
    prospectNames: prospectsQ.data?.set ?? new Set<string>(),
    pipelineNames: pipelineQ.data?.set ?? new Set<string>(),
    prospectValueByName: prospectsQ.data?.valueByName ?? new Map<string, number>(),
    pipelineValueByName: pipelineQ.data?.valueByName ?? new Map<string, number>(),
    prospectValueByCompanyId: prospectsQ.data?.valueById ?? new Map<string, number>(),
    pipelineValueByCompanyId: pipelineQ.data?.valueById ?? new Map<string, number>(),
    loading: prospectsQ.isLoading || pipelineQ.isLoading,
  };
}

export type EngagementBucket = 'prospect' | 'pipeline' | 'both' | 'none';

export function useCompanyEngagementMap(companies: Company[]) {
  const {
    prospectNames, pipelineNames,
    prospectValueByName, pipelineValueByName,
    prospectValueByCompanyId, pipelineValueByCompanyId,
    loading,
  } = useCompanyEngagementSources();

  return useMemo(() => {
    const map = new Map<string, EngagementBucket>();
    const prospectValueById = new Map<string, number>();
    const pipelineValueById = new Map<string, number>();
    const inProspect = new Set<string>();
    const inPipeline = new Set<string>();
    const inBoth = new Set<string>();
    const none = new Set<string>();
    let valProspect = 0, valPipeline = 0, valBoth = 0;

    companies.forEach((c) => {
      const n = norm(c.name);
      // Prefer FK match (company_id), fall back to normalized name match
      const pvById = prospectValueByCompanyId.get(c.id) || 0;
      const plvById = pipelineValueByCompanyId.get(c.id) || 0;
      const pvByName = n ? (prospectValueByName.get(n) || 0) : 0;
      const plvByName = n ? (pipelineValueByName.get(n) || 0) : 0;
      const pv = Math.max(pvById, pvByName);
      const plv = Math.max(plvById, plvByName);
      const p = pvById > 0 || (n ? prospectNames.has(n) : false);
      const pl = plvById > 0 || (n ? pipelineNames.has(n) : false);
      prospectValueById.set(c.id, pv);
      pipelineValueById.set(c.id, plv);
      let bucket: EngagementBucket = 'none';
      if (p && pl) { bucket = 'both'; valBoth += pv + plv; }
      else if (p) { bucket = 'prospect'; valProspect += pv; }
      else if (pl) { bucket = 'pipeline'; valPipeline += plv; }
      map.set(c.id, bucket);
      if (bucket === 'both') inBoth.add(c.id);
      else if (bucket === 'prospect') inProspect.add(c.id);
      else if (bucket === 'pipeline') inPipeline.add(c.id);
      else none.add(c.id);
    });

    return {
      map,
      prospectValueById,
      pipelineValueById,
      counts: {
        prospect: inProspect.size,
        pipeline: inPipeline.size,
        both: inBoth.size,
        none: none.size,
        engagedTotal: inProspect.size + inPipeline.size + inBoth.size,
      },
      values: {
        prospect: valProspect,
        pipeline: valPipeline,
        both: valBoth,
      },
      ids: { prospect: inProspect, pipeline: inPipeline, both: inBoth, none },
      loading,
    };
  }, [companies, prospectNames, pipelineNames, prospectValueByName, pipelineValueByName, prospectValueByCompanyId, pipelineValueByCompanyId, loading]);
}