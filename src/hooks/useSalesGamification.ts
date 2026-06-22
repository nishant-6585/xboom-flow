import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { useAnalyticsScope } from '@/contexts/AnalyticsScopeContext';

export interface SalesDailyActivity {
  id: string;
  user_id: string;
  activity_date: string;
  leads_handled: number;
  channel: string | null;
  pipeline_created: number;
  orders_won: number;
  payment_expected_today: number;
  sweet_pipeline: number;
  monthly_pipeline: number;
  bonus_earned: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalesPoints {
  id: string;
  user_id: string;
  points: number;
  category: string;
  description: string | null;
  reference_id: string | null;
  earned_at: string;
  created_at: string;
}

export interface SalesSuggestion {
  id: string;
  user_id: string;
  user_name: string;
  title: string;
  description: string;
  status: string;
  admin_response: string | null;
  responded_by: string | null;
  responded_by_name: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OutboundActivity {
  id: string;
  user_id: string;
  user_name: string;
  activity_date: string;
  calls_made: number;
  emails_sent: number;
  meetings_scheduled: number;
  demos_given: number;
  follow_ups: number;
  new_contacts: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeaderboardEntry {
  user_id: string;
  user_name: string;
  total_points: number;
  leads_handled: number;
  orders_won: number;
  pipeline_created: number;
  total_pipeline_value: number;
  total_order_value: number;
  rank: number;
}

export function useSalesDailyActivities() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: activities, isLoading } = useQuery({
    queryKey: ['sales-daily-activities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_daily_activities')
        .select('*')
        .order('activity_date', { ascending: false });
      
      if (error) throw error;
      return data as SalesDailyActivity[];
    },
    enabled: !!user,
  });

  const upsertActivity = useMutation({
    mutationFn: async (activity: Partial<SalesDailyActivity> & { activity_date: string }) => {
      const { data: existing } = await supabase
        .from('sales_daily_activities')
        .select('id')
        .eq('user_id', user?.id || '')
        .eq('activity_date', activity.activity_date)
        .single();

      if (existing) {
        const { error } = await supabase
          .from('sales_daily_activities')
          .update({ ...activity, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('sales_daily_activities')
          .insert({ ...activity, user_id: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-daily-activities'] });
      toast.success('Activity saved successfully!');
    },
    onError: (error: Error) => {
      toast.error(`Error saving activity: ${error.message}`);
    },
  });

  return { activities, isLoading, upsertActivity };
}

export function useSalesPoints() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: points, isLoading } = useQuery({
    queryKey: ['sales-points'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_points')
        .select('*')
        .order('earned_at', { ascending: false });
      
      if (error) throw error;
      return data as SalesPoints[];
    },
    enabled: !!user,
  });

  const addPoints = useMutation({
    mutationFn: async (pointData: { user_id: string; points: number; category: string; description?: string; reference_id?: string }) => {
      const { error } = await supabase
        .from('sales_points')
        .insert(pointData);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-points'] });
      queryClient.invalidateQueries({ queryKey: ['sales-leaderboard'] });
    },
  });

  const totalPoints = points?.reduce((sum, p) => sum + p.points, 0) || 0;

  return { points, totalPoints, isLoading, addPoints };
}

export function useSalesSuggestions() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: suggestions, isLoading } = useQuery({
    queryKey: ['sales-suggestions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_suggestions')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as SalesSuggestion[];
    },
    enabled: !!user,
  });

  const createSuggestion = useMutation({
    mutationFn: async (suggestion: { title: string; description: string }) => {
      const { error } = await supabase
        .from('sales_suggestions')
        .insert({
          ...suggestion,
          user_id: user?.id,
          user_name: profile?.name || 'Unknown',
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-suggestions'] });
      toast.success('Suggestion submitted successfully!');
    },
    onError: (error: Error) => {
      toast.error(`Error submitting suggestion: ${error.message}`);
    },
  });

  const respondToSuggestion = useMutation({
    mutationFn: async ({ id, response, status }: { id: string; response: string; status: string }) => {
      const { error } = await supabase
        .from('sales_suggestions')
        .update({
          admin_response: response,
          status,
          responded_by: user?.id,
          responded_by_name: profile?.name,
          responded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-suggestions'] });
      toast.success('Response submitted successfully!');
    },
    onError: (error: Error) => {
      toast.error(`Error responding: ${error.message}`);
    },
  });

  return { suggestions, isLoading, createSuggestion, respondToSuggestion };
}

export function useOutboundActivities() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: activities, isLoading } = useQuery({
    queryKey: ['outbound-activities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('outbound_activities')
        .select('*')
        .order('activity_date', { ascending: false });
      
      if (error) throw error;
      return data as OutboundActivity[];
    },
    enabled: !!user,
  });

  const upsertActivity = useMutation({
    mutationFn: async (activity: Partial<OutboundActivity> & { activity_date: string }) => {
      const { data: existing } = await supabase
        .from('outbound_activities')
        .select('id')
        .eq('user_id', user?.id || '')
        .eq('activity_date', activity.activity_date)
        .single();

      if (existing) {
        const { error } = await supabase
          .from('outbound_activities')
          .update({ ...activity, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('outbound_activities')
          .insert({ 
            ...activity, 
            user_id: user?.id,
            user_name: profile?.name || 'Unknown',
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outbound-activities'] });
      toast.success('Outbound activity saved!');
    },
    onError: (error: Error) => {
      toast.error(`Error saving activity: ${error.message}`);
    },
  });

  return { activities, isLoading, upsertActivity };
}

export function useSalesLeaderboard(
  startDate?: string,
  endDate?: string,
  forceIncludeWebsite?: boolean,
) {
  const { user } = useAuth();
  const { includeWebsite: scopeIncludeWebsite } = useAnalyticsScope();
  const includeWebsite =
    typeof forceIncludeWebsite === 'boolean' ? forceIncludeWebsite : scopeIncludeWebsite;

  const { data: leaderboard, isLoading } = useQuery({
    queryKey: ['sales-leaderboard', startDate, endDate, includeWebsite],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_sales_leaderboard', {
          start_date: startDate || null,
          end_date: endDate || null,
          p_include_website: includeWebsite,
        });
      
      if (error) throw error;
      const rows = (data as LeaderboardEntry[]) ?? [];

      // Fetch all sales-role users so reps with zero activity still appear
      const { data: roleRows } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['sales', 'sales_manager'] as any);
      const salesUserIds = Array.from(
        new Set((roleRows as any[] | null)?.map((r) => r.user_id).filter(Boolean) ?? []),
      );

      const byId = new Map<string, LeaderboardEntry>();
      rows.forEach((r) => {
        if (r.user_id) byId.set(r.user_id, r);
      });

      const missingIds = salesUserIds.filter((uid) => !byId.has(uid));
      if (missingIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, name')
          .in('user_id', missingIds);
        const nameById = new Map<string, string>();
        (profilesData ?? []).forEach((p: any) => nameById.set(p.user_id, p.name));
        missingIds.forEach((uid) => {
          byId.set(uid, {
            user_id: uid,
            user_name: nameById.get(uid) ?? 'Unknown',
            total_points: 0,
            leads_handled: 0,
            orders_won: 0,
            pipeline_created: 0,
            total_pipeline_value: 0,
            total_order_value: 0,
            rank: 0,
          });
        });
      }

      // Exclude Vishal (case-insensitive) and re-rank by total_points
      const filtered = Array.from(byId.values()).filter(
        (r) => !(r.user_name || '').toLowerCase().includes('vishal'),
      );
      filtered.sort((a, b) => (b.total_points ?? 0) - (a.total_points ?? 0));
      filtered.forEach((r, i) => {
        r.rank = i + 1;
      });
      return filtered;
    },
    enabled: !!user,
  });

  return { leaderboard, isLoading };
}
