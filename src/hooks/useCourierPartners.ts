import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { setCourierPartners } from '@/lib/courierTracking';
import { toast } from 'sonner';

export interface CourierPartner {
  id: string;
  name: string;
  tracking_url: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useCourierPartners() {
  const [partners, setPartners] = useState<CourierPartner[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPartners = useCallback(async () => {
    const { data, error } = await supabase
      .from('courier_partners')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('Failed to load courier partners', error);
      setLoading(false);
      return;
    }

    const list = (data ?? []) as CourierPartner[];
    setPartners(list);
    // hydrate the shared in-memory cache used by the tracking helpers
    setCourierPartners(
      list
        .filter((p) => p.is_active)
        .map((p) => ({ name: p.name, trackingPage: p.tracking_url || '' })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  const createPartner = useCallback(
    async (input: { name: string; tracking_url?: string; is_active?: boolean }) => {
      const name = input.name.trim();
      if (!name) {
        toast.error('Courier name is required');
        return false;
      }
      const { error } = await supabase.from('courier_partners').insert({
        name,
        tracking_url: input.tracking_url?.trim() || '',
        is_active: input.is_active ?? true,
      });
      if (error) {
        toast.error(error.message);
        return false;
      }
      toast.success(`Added courier: ${name}`);
      await fetchPartners();
      return true;
    },
    [fetchPartners],
  );

  const updatePartner = useCallback(
    async (id: string, patch: Partial<Pick<CourierPartner, 'name' | 'tracking_url' | 'is_active'>>) => {
      const { error } = await supabase
        .from('courier_partners')
        .update({
          ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
          ...(patch.tracking_url !== undefined ? { tracking_url: patch.tracking_url.trim() } : {}),
          ...(patch.is_active !== undefined ? { is_active: patch.is_active } : {}),
        })
        .eq('id', id);
      if (error) {
        toast.error(error.message);
        return false;
      }
      toast.success('Courier updated');
      await fetchPartners();
      return true;
    },
    [fetchPartners],
  );

  const deletePartner = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('courier_partners').delete().eq('id', id);
      if (error) {
        toast.error(error.message);
        return false;
      }
      toast.success('Courier removed');
      await fetchPartners();
      return true;
    },
    [fetchPartners],
  );

  return { partners, loading, refetch: fetchPartners, createPartner, updatePartner, deletePartner };
}