import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Company {
  id: string;
  name: string;
  industry: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  status: 'lead' | 'customer';
  total_order_value: number;
  total_orders_count: number;
  is_recurring: boolean;
  notes: string | null;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  // Premium CRM fields
  tier?: 'A' | 'B' | 'C' | null;
  tier_source?: 'auto' | 'manual' | null;
  tier_locked_by?: string | null;
  tier_locked_at?: string | null;
  tier_notes?: string | null;
  potential_value?: number | null;
  pipeline_value?: number | null;
  health_score?: number | null;
  health_band?: 'healthy' | 'watch' | 'at_risk' | 'critical' | null;
  last_activity_at?: string | null;
  last_order_at?: string | null;
  account_owner_id?: string | null;
  next_action_at?: string | null;
  next_action_type?: string | null;
  next_action_notes?: string | null;
  ai_brief?: string | null;
  ai_brief_generated_at?: string | null;
}

export interface CompanyContact {
  id: string;
  company_id: string;
  name: string;
  designation: string | null;
  department: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useCompanies() {
  const queryClient = useQueryClient();

  const { data: companies = [], isLoading: loading } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as unknown as Company[];
    },
  });

  const addCompany = useMutation({
    mutationFn: async (company: Partial<Company>) => {
      const { data, error } = await supabase
        .from('companies')
        .insert([company as any])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      toast.success('Company added');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateCompany = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<Company>) => {
      const { error } = await supabase
        .from('companies')
        .update(updates as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      toast.success('Company updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { companies, loading, addCompany: addCompany.mutateAsync, updateCompany: updateCompany.mutateAsync, adding: addCompany.isPending };
}

export function useCompanyContacts(companyId: string | null) {
  const queryClient = useQueryClient();

  const { data: contacts = [], isLoading: loading } = useQuery({
    queryKey: ['company-contacts', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('company_contacts')
        .select('*')
        .eq('company_id', companyId)
        .order('is_primary', { ascending: false });
      if (error) throw error;
      return data as unknown as CompanyContact[];
    },
    enabled: !!companyId,
  });

  const addContact = useMutation({
    mutationFn: async (contact: Partial<CompanyContact>) => {
      const { data, error } = await supabase
        .from('company_contacts')
        .insert([contact as any])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-contacts', companyId] });
      toast.success('Contact added');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateContact = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<CompanyContact>) => {
      const { error } = await supabase
        .from('company_contacts')
        .update(updates as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-contacts', companyId] });
      toast.success('Contact updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteContact = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('company_contacts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-contacts', companyId] });
      toast.success('Contact removed');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { contacts, loading, addContact: addContact.mutateAsync, updateContact: updateContact.mutateAsync, deleteContact: deleteContact.mutateAsync };
}

export function useCompanyOrders(companyId: string | null) {
  const { data: orders = [], isLoading: loading } = useQuery({
    queryKey: ['company-orders', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, customer_name, customer_company, customer_email, customer_gst, product_name, product_code, product_category, quantity, selling_price, total_sales_amount, amount_paid, payment_status, payment_terms, payment_due_date, shipping_address, sales_person_name, lead_source, status, order_date, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });
  return { orders, loading };
}

export function useCompanyProspects(companyId: string | null) {
  const { data: prospects = [], isLoading: loading } = useQuery({
    queryKey: ['company-prospects', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('prospects')
        .select('id, customer_name, phone_number, email, product_name, product_category, product_code, quantity, quoted_price, default_price, discount_amount, discount_percentage, status, city, urgency, requested_timeline, purpose_of_purchase, lead_source, lead_quality, prospect_type, customer_type, is_a_category, notes, created_by_name, created_at, updated_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });
  return { prospects, loading };
}

export function useCompanyPipeline(companyName: string | null) {
  const { data: pipeline = [], isLoading: loading } = useQuery({
    queryKey: ['company-pipeline', companyName],
    queryFn: async () => {
      if (!companyName) return [];
      const { data, error } = await supabase
        .from('pipeline_orders')
        .select('id, customer_name, customer_phone, customer_email, customer_state, product_name, product_category, product_code, quantity, expected_price, expected_closure_date, probability, status, lead_temperature, lead_source, priority, sales_person_name, customer_type, is_mega_deal, internal_notes, created_at, updated_at')
        .ilike('customer_company', companyName)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyName,
  });
  return { pipeline, loading };
}
