import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CompanyPrimaryContact {
  company_id: string;
  name: string | null;
  designation: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
}

/**
 * Fetches one contact per company — the primary one if marked,
 * else the earliest-created contact as fallback.
 */
export function useCompanyPrimaryContacts() {
  const { data = new Map<string, CompanyPrimaryContact>(), isLoading } = useQuery({
    queryKey: ['company-primary-contacts', 'v1'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_contacts')
        .select('company_id,name,designation,phone,email,is_primary,created_at')
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(5000);
      if (error) throw error;
      const map = new Map<string, CompanyPrimaryContact>();
      (data || []).forEach((c: any) => {
        if (!map.has(c.company_id)) {
          map.set(c.company_id, c as CompanyPrimaryContact);
        }
      });
      return map;
    },
    staleTime: 60 * 1000,
  });
  return { primaryContactByCompany: data, loading: isLoading };
}