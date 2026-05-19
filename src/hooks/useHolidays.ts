import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type HolidayType = 'national' | 'regional' | 'company' | 'religious' | 'restricted';

export const HOLIDAY_TYPES: { value: HolidayType; label: string }[] = [
  { value: 'national', label: 'National' },
  { value: 'regional', label: 'Regional' },
  { value: 'company', label: 'Company' },
  { value: 'religious', label: 'Religious' },
  { value: 'restricted', label: 'Restricted' },
];

export interface Holiday {
  id: string;
  holiday_date: string;
  name: string;
  description: string | null;
  holiday_type: HolidayType;
  is_restricted: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ---------- IST helpers ----------
// "Today" / "Tomorrow" in Asia/Kolkata, returned as yyyy-MM-dd
function istDateString(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86_400_000);
  // en-CA gives yyyy-mm-dd in any timezone
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
export const istToday = () => istDateString(0);
export const istTomorrow = () => istDateString(1);

// ---------- Queries ----------
export function useHolidays(filtersOrYear?: number | { year?: number; activeOnly?: boolean }) {
  const filters = typeof filtersOrYear === 'number' ? { year: filtersOrYear } : (filtersOrYear ?? {});
  const year = filters.year ?? new Date().getFullYear();
  const activeOnly = filters.activeOnly ?? false;

  const { data: holidays = [], isLoading } = useQuery({
    queryKey: ['holidays', year, activeOnly],
    queryFn: async () => {
      let q = supabase
        .from('holidays')
        .select('*')
        .gte('holiday_date', `${year}-01-01`)
        .lte('holiday_date', `${year}-12-31`)
        .order('holiday_date', { ascending: true });
      if (activeOnly) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Holiday[];
    },
  });

  const queryClient = useQueryClient();

  const addHoliday = useMutation({
    mutationFn: async (h: { name: string; date?: string; holiday_date?: string; description?: string; holiday_type?: HolidayType; is_restricted?: boolean; is_active?: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('holidays').insert({
        name: h.name,
        holiday_date: (h.holiday_date ?? h.date) as string,
        description: h.description || null,
        holiday_type: h.holiday_type ?? 'company',
        is_restricted: h.is_restricted ?? false,
        is_active: h.is_active ?? true,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      toast.success('Holiday added');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteHoliday = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('holidays').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      toast.success('Holiday removed');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Backward-compat helpers used by attendance components
  const holidayMap = new Map(holidays.map((h) => [h.holiday_date, h]));
  const isHoliday = (dateStr: string) => holidayMap.has(dateStr);
  const getHoliday = (dateStr: string) => holidayMap.get(dateStr);

  return { holidays, isLoading, addHoliday, deleteHoliday, isHoliday, getHoliday, holidayMap };
}

export function useUpcomingHolidays(limit = 5) {
  const today = istToday();
  return useQuery({
    queryKey: ['holidays', 'upcoming', today, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('holidays')
        .select('*')
        .gte('holiday_date', today)
        .eq('is_active', true)
        .order('holiday_date', { ascending: true })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as Holiday[];
    },
  });
}

export function useTomorrowHoliday() {
  const tomorrow = istTomorrow();
  return useQuery({
    queryKey: ['holidays', 'tomorrow', tomorrow],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('holidays')
        .select('*')
        .eq('holiday_date', tomorrow)
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Holiday[];
    },
  });
}

export function useUpdateHoliday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Holiday> & { id: string }) => {
      const { error } = await supabase.from('holidays').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      toast.success('Holiday updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCreateHoliday() {
  const { addHoliday } = useHolidays();
  return addHoliday;
}

export function useDeleteHoliday() {
  const { deleteHoliday } = useHolidays();
  return deleteHoliday;
}
