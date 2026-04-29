import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CompanyActivity {
  id: string;
  company_id: string;
  activity_type: string;
  source: string;
  title: string;
  description: string | null;
  reference_id: string | null;
  reference_table: string | null;
  contact_id: string | null;
  amount: number | null;
  occurred_at: string;
  metadata: Record<string, any>;
  created_by: string | null;
  created_at: string;
}

export interface CompanySavedView {
  id: string;
  user_id: string;
  name: string;
  filters: Record<string, any>;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

export function useCompanyActivities(companyId: string | null) {
  const qc = useQueryClient();
  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['company-activities', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('company_activities' as any)
        .select('*')
        .eq('company_id', companyId)
        .order('occurred_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as unknown as CompanyActivity[];
    },
    enabled: !!companyId,
  });

  const addActivity = useMutation({
    mutationFn: async (a: Partial<CompanyActivity>) => {
      const { error } = await supabase.from('company_activities' as any).insert([a as any]);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company-activities', companyId] });
      toast.success('Activity logged');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { activities, loading: isLoading, addActivity: addActivity.mutateAsync, adding: addActivity.isPending };
}

export function useCompanyTimeline(companyId: string | null, companyName: string | null) {
  // Combined timeline: explicit activities + auto-derived events from orders, prospects, pipeline
  return useQuery({
    queryKey: ['company-timeline', companyId, companyName],
    queryFn: async () => {
      if (!companyId) return [];
      const items: Array<{
        id: string;
        type: string;
        source: string;
        title: string;
        description?: string | null;
        amount?: number | null;
        occurred_at: string;
      }> = [];

      const [acts, orders, prospects, pipeline] = await Promise.all([
        supabase.from('company_activities' as any).select('*').eq('company_id', companyId).order('occurred_at', { ascending: false }).limit(200),
        supabase.from('orders').select('id, order_number, product_name, total_sales_amount, status, order_date, created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(50),
        supabase.from('prospects').select('id, customer_name, product_name, status, created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(50),
        companyName
          ? supabase.from('pipeline_orders').select('id, customer_name, product_name, expected_price, status, created_at').ilike('customer_company', companyName).order('created_at', { ascending: false }).limit(50)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      (acts.data || []).forEach((a: any) => items.push({
        id: `act_${a.id}`, type: a.activity_type, source: a.source,
        title: a.title, description: a.description, amount: a.amount,
        occurred_at: a.occurred_at,
      }));
      (orders.data || []).forEach((o: any) => items.push({
        id: `ord_${o.id}`, type: 'order', source: 'orders',
        title: `Order ${o.order_number || ''} — ${o.product_name || ''}`.trim(),
        description: `Status: ${o.status}`,
        amount: o.total_sales_amount,
        occurred_at: o.order_date || o.created_at,
      }));
      (prospects.data || []).forEach((p: any) => items.push({
        id: `pro_${p.id}`, type: 'lead', source: 'prospects',
        title: `Prospect — ${p.product_name || 'No product'}`,
        description: `Status: ${p.status}`,
        occurred_at: p.created_at,
      }));
      ((pipeline as any).data || []).forEach((p: any) => items.push({
        id: `pip_${p.id}`, type: 'lead', source: 'pipeline',
        title: `Pipeline — ${p.product_name || ''}`,
        description: `Status: ${p.status}`,
        amount: p.expected_price,
        occurred_at: p.created_at,
      }));

      items.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
      return items;
    },
    enabled: !!companyId,
  });
}

export function useGenerateAccountBrief() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (companyId: string) => {
      const { data, error } = await supabase.functions.invoke('ai-account-brief', {
        body: { company_id: companyId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { brief: string };
    },
    onSuccess: (_, companyId) => {
      qc.invalidateQueries({ queryKey: ['companies'] });
      qc.invalidateQueries({ queryKey: ['company', companyId] });
      toast.success('AI brief generated');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateCompanyTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      companyId, tier, notes, lockedBy,
    }: { companyId: string; tier: 'A' | 'B' | 'C' | null; notes?: string; lockedBy?: string }) => {
      const updates: any = {
        tier,
        tier_source: tier ? 'manual' : 'auto',
        tier_notes: notes || null,
        tier_locked_at: tier ? new Date().toISOString() : null,
        tier_locked_by: tier ? lockedBy || null : null,
      };
      const { error } = await supabase.from('companies').update(updates).eq('id', companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companies'] });
      toast.success('Tier updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateCompanyAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      companyId, ...updates
    }: { companyId: string } & Partial<{
      account_owner_id: string | null;
      potential_value: number;
      pipeline_value: number;
      next_action_at: string | null;
      next_action_type: string | null;
      next_action_notes: string | null;
    }>) => {
      const { error } = await supabase.from('companies').update(updates as any).eq('id', companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companies'] });
      toast.success('Account updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRecomputeHealth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (companyId: string) => {
      const { error } = await supabase.rpc('recompute_company_health' as any, { _company_id: companyId } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companies'] });
      toast.success('Health refreshed');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCompanySavedViews() {
  const qc = useQueryClient();
  const { data: views = [], isLoading } = useQuery({
    queryKey: ['company-saved-views'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_saved_views' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as CompanySavedView[];
    },
  });

  const saveView = useMutation({
    mutationFn: async (v: { name: string; filters: Record<string, any>; is_shared?: boolean; user_id: string }) => {
      const { error } = await supabase.from('company_saved_views' as any).insert([v as any]);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['company-saved-views'] }); toast.success('View saved'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteView = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('company_saved_views' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['company-saved-views'] }); toast.success('View removed'); },
    onError: (e: Error) => toast.error(e.message),
  });

  return { views, loading: isLoading, saveView: saveView.mutateAsync, deleteView: deleteView.mutateAsync };
}

export function useBulkUpdateCompanies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, updates }: { ids: string[]; updates: Record<string, any> }) => {
      const { error } = await supabase.from('companies').update(updates as any).in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['companies'] }); toast.success('Companies updated'); },
    onError: (e: Error) => toast.error(e.message),
  });
}