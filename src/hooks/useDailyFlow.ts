import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface DailyFlowTemplate {
  id: string;
  employee_id: string;
  employee_name: string;
  template_name: string;
  sl_no: number;
  description: string;
  sub_items: string[];
  time_from: string;
  time_to: string;
  duration_mins: number;
  target_value: number;
  is_break: boolean;
  created_by: string;
  created_by_name: string;
  created_at: string;
}

export interface DailyFlowEntry {
  id: string;
  template_id: string | null;
  employee_id: string;
  employee_name: string;
  flow_date: string;
  sl_no: number;
  description: string;
  sub_items: string[];
  time_from: string;
  time_to: string;
  duration_mins: number;
  target_value: number;
  actual_value: number;
  notes: string;
  task_description: string;
  links: string[];
  is_break: boolean;
  created_by: string;
  created_by_name: string;
  updated_by: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export function useDailyFlow() {
  const { user, profile } = useAuth();
  const [templates, setTemplates] = useState<DailyFlowTemplate[]>([]);
  const [entries, setEntries] = useState<DailyFlowEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTemplates = useCallback(async (employeeId: string) => {
    const { data, error } = await supabase
      .from('daily_flow_templates')
      .select('*')
      .eq('employee_id', employeeId)
      .order('sl_no');
    if (error) { console.error(error); return; }
    setTemplates((data || []) as DailyFlowTemplate[]);
  }, []);

  const fetchEntries = useCallback(async (employeeId: string, date: string) => {
    const { data, error } = await supabase
      .from('daily_flow_entries')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('flow_date', date)
      .order('sl_no');
    if (error) { console.error(error); return; }
    setEntries((data || []) as DailyFlowEntry[]);
  }, []);

  const saveTemplate = useCallback(async (items: Omit<DailyFlowTemplate, 'id' | 'created_at'>[]) => {
    if (!items.length) return false;
    const employeeId = items[0].employee_id;
    await supabase.from('daily_flow_templates').delete().eq('employee_id', employeeId);
    const { error } = await supabase.from('daily_flow_templates').insert(items as any);
    if (error) { toast.error('Failed to save template'); console.error(error); return false; }
    toast.success('Flow template saved');
    await fetchTemplates(employeeId);
    return true;
  }, [fetchTemplates]);

  const generateEntriesFromTemplate = useCallback(async (employeeId: string, employeeName: string, date: string) => {
    if (!user || !profile) return false;
    const { data: existing } = await supabase
      .from('daily_flow_entries')
      .select('id')
      .eq('employee_id', employeeId)
      .eq('flow_date', date)
      .limit(1);
    if (existing && existing.length > 0) {
      toast.info('Flow entries already exist for this date');
      await fetchEntries(employeeId, date);
      return true;
    }

    const { data: tmpl } = await supabase
      .from('daily_flow_templates')
      .select('*')
      .eq('employee_id', employeeId)
      .order('sl_no');
    if (!tmpl || tmpl.length === 0) {
      toast.error('No template found. Create a flow template first.');
      return false;
    }

    const newEntries = tmpl.map((t: any) => ({
      template_id: t.id,
      employee_id: employeeId,
      employee_name: employeeName,
      flow_date: date,
      sl_no: t.sl_no,
      description: t.description,
      sub_items: t.sub_items || [],
      time_from: t.time_from,
      time_to: t.time_to,
      duration_mins: t.duration_mins,
      target_value: t.target_value || 0,
      actual_value: 0,
      notes: '',
      is_break: t.is_break || false,
      created_by: user.id,
      created_by_name: profile.name || 'Unknown',
    }));

    const { error } = await supabase.from('daily_flow_entries').insert(newEntries as any);
    if (error) { toast.error('Failed to generate entries'); console.error(error); return false; }
    toast.success('Daily flow entries generated');
    await fetchEntries(employeeId, date);
    return true;
  }, [user, profile, fetchEntries]);

  const updateEntry = useCallback(async (entryId: string, updates: { actual_value?: number; notes?: string; task_description?: string; links?: string[]; description?: string; time_from?: string; time_to?: string; duration_mins?: number }) => {
    if (!user || !profile) return false;
    const { error } = await supabase
      .from('daily_flow_entries')
      .update({
        ...updates,
        updated_by: user.id,
        updated_by_name: profile.name || 'Unknown',
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', entryId);
    if (error) { console.error(error); return false; }
    return true;
  }, [user, profile]);

  const fetchEntriesForRange = useCallback(async (employeeId: string, from: string, to: string) => {
    const { data, error } = await supabase
      .from('daily_flow_entries')
      .select('*')
      .eq('employee_id', employeeId)
      .gte('flow_date', from)
      .lte('flow_date', to)
      .order('flow_date')
      .order('sl_no');
    if (error) { console.error(error); return []; }
    return (data || []) as DailyFlowEntry[];
  }, []);

  return {
    templates, entries, loading,
    fetchTemplates, fetchEntries, saveTemplate,
    generateEntriesFromTemplate, updateEntry, fetchEntriesForRange,
  };
}
