import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Holiday {
  id: string;
  name: string;
  date: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

export function useHolidays(year?: number) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const targetYear = year || new Date().getFullYear();

  const { data: holidays = [], isLoading } = useQuery({
    queryKey: ['holidays', targetYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('holidays')
        .select('*')
        .gte('date', `${targetYear}-01-01`)
        .lte('date', `${targetYear}-12-31`)
        .order('date');
      if (error) throw error;
      return data as Holiday[];
    },
  });

  const addHoliday = useMutation({
    mutationFn: async (holiday: { name: string; date: string; description?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('holidays').insert({
        name: holiday.name,
        date: holiday.date,
        description: holiday.description || null,
        created_by: user?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      toast({ title: 'Holiday Added' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const deleteHoliday = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('holidays').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      toast({ title: 'Holiday Removed' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  // Helper: check if a date string is a holiday
  const holidayMap = new Map(holidays.map(h => [h.date, h]));
  const isHoliday = (dateStr: string) => holidayMap.has(dateStr);
  const getHoliday = (dateStr: string) => holidayMap.get(dateStr);

  return { holidays, isLoading, addHoliday, deleteHoliday, isHoliday, getHoliday, holidayMap };
}
