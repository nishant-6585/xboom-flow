import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface ChecklistItem {
  id: string;
  checklist_id: string;
  template_item_id: string | null;
  item_name: string;
  item_order: number;
  is_completed: boolean;
  is_applicable: boolean;
  completed_by: string | null;
  completed_by_name: string | null;
  completed_at: string | null;
  notes: string | null;
}

export interface EmployeeChecklist {
  id: string;
  employee_id: string;
  checklist_type: 'onboarding' | 'offboarding';
  status: string;
  completion_percentage: number;
  created_at: string;
  employee_name?: string;
  employee_number?: string;
  joining_date?: string | null;
  exit_date?: string | null;
  items?: ChecklistItem[];
}

export function useEmployeeChecklists(checklistType: 'onboarding' | 'offboarding') {
  const { user, profile } = useAuth();
  const [checklists, setChecklists] = useState<EmployeeChecklist[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchChecklists = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('employee_checklists')
        .select('*')
        .eq('checklist_type', checklistType)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch employee details for each checklist
      const employeeIds = [...new Set((data || []).map((c: any) => c.employee_id))];
      let employeeMap: Record<string, any> = {};
      
      if (employeeIds.length > 0) {
        const { data: employees } = await supabase
          .from('employees')
          .select('id, name, employee_number, joining_date, exit_date')
          .in('id', employeeIds);
        
        (employees || []).forEach((e: any) => {
          employeeMap[e.id] = e;
        });
      }

      const enriched: EmployeeChecklist[] = (data || []).map((c: any) => ({
        ...c,
        employee_name: employeeMap[c.employee_id]?.name || 'Unknown',
        employee_number: employeeMap[c.employee_id]?.employee_number || '—',
        joining_date: employeeMap[c.employee_id]?.joining_date,
        exit_date: employeeMap[c.employee_id]?.exit_date,
      }));

      setChecklists(enriched);
    } catch (err: any) {
      console.error('Error fetching checklists:', err);
      toast.error('Failed to load checklists');
    } finally {
      setLoading(false);
    }
  }, [checklistType]);

  const fetchChecklistItems = useCallback(async (checklistId: string): Promise<ChecklistItem[]> => {
    const { data, error } = await supabase
      .from('employee_checklist_items')
      .select('*')
      .eq('checklist_id', checklistId)
      .order('item_order', { ascending: true });

    if (error) {
      console.error('Error fetching items:', error);
      return [];
    }
    return (data || []) as ChecklistItem[];
  }, []);

  const toggleItem = useCallback(async (item: ChecklistItem, checked: boolean) => {
    if (!user || !profile) return;

    const updateData: any = {
      is_completed: checked,
      updated_at: new Date().toISOString(),
    };

    if (checked) {
      updateData.completed_by = user.id;
      updateData.completed_by_name = profile.name || user.email;
      updateData.completed_at = new Date().toISOString();
    } else {
      updateData.completed_by = null;
      updateData.completed_by_name = null;
      updateData.completed_at = null;
    }

    const { error } = await supabase
      .from('employee_checklist_items')
      .update(updateData)
      .eq('id', item.id);

    if (error) {
      toast.error('Failed to update item');
      return false;
    }

    // Record in edit_history for audit trail
    await supabase.from('edit_history').insert({
      table_name: 'employee_checklist_items',
      record_id: item.id,
      field_name: item.item_name,
      old_value: checked ? 'Not Completed' : 'Completed',
      new_value: checked ? 'Completed' : 'Not Completed',
      edited_by: user.id,
      edited_by_name: profile.name || user.email || 'Unknown',
    });

    return true;
  }, [user, profile]);

  const updateItemNotes = useCallback(async (itemId: string, notes: string) => {
    const { error } = await supabase
      .from('employee_checklist_items')
      .update({ notes, updated_at: new Date().toISOString() })
      .eq('id', itemId);

    if (error) {
      toast.error('Failed to update notes');
      return false;
    }
    return true;
  }, []);

  const toggleApplicable = useCallback(async (itemId: string, isApplicable: boolean) => {
    const updateData: any = {
      is_applicable: isApplicable,
      updated_at: new Date().toISOString(),
    };
    // If marking as not applicable, also uncheck it
    if (!isApplicable) {
      updateData.is_completed = false;
      updateData.completed_by = null;
      updateData.completed_by_name = null;
      updateData.completed_at = null;
    }

    const { error } = await supabase
      .from('employee_checklist_items')
      .update(updateData)
      .eq('id', itemId);

    if (error) {
      toast.error('Failed to update applicability');
      return false;
    }

    // Record audit
    if (user && profile) {
      await supabase.from('edit_history').insert({
        table_name: 'employee_checklist_items',
        record_id: itemId,
        field_name: 'is_applicable',
        old_value: isApplicable ? 'Not Applicable' : 'Applicable',
        new_value: isApplicable ? 'Applicable' : 'Not Applicable',
        edited_by: user.id,
        edited_by_name: profile.name || user.email || 'Unknown',
      });
    }

    return true;
  }, [user, profile]);

  return {
    checklists,
    loading,
    fetchChecklists,
    fetchChecklistItems,
    toggleItem,
    updateItemNotes,
    toggleApplicable,
  };
}
