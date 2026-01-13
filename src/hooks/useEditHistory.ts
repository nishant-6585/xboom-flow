import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface EditHistoryRecord {
  id: string;
  table_name: string;
  record_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  edited_by: string;
  edited_by_name: string;
  edited_at: string;
}

export function useEditHistory() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const fetchHistory = useCallback(async (tableName: string, recordId: string): Promise<EditHistoryRecord[]> => {
    const { data, error } = await supabase
      .from('edit_history')
      .select('*')
      .eq('table_name', tableName)
      .eq('record_id', recordId)
      .order('edited_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching edit history:', error);
      return [];
    }

    return data as EditHistoryRecord[];
  }, []);

  const recordChanges = useCallback(async (
    tableName: string,
    recordId: string,
    changes: Record<string, { old: any; new: any }>,
    editorName: string
  ): Promise<boolean> => {
    if (!user) return false;

    const records = Object.entries(changes)
      .filter(([_, values]) => values.old !== values.new)
      .map(([fieldName, values]) => ({
        table_name: tableName,
        record_id: recordId,
        field_name: fieldName,
        old_value: values.old?.toString() || null,
        new_value: values.new?.toString() || null,
        edited_by: user.id,
        edited_by_name: editorName,
      }));

    if (records.length === 0) return true;

    const { error } = await supabase
      .from('edit_history')
      .insert(records);

    if (error) {
      console.error('Error recording edit history:', error);
      return false;
    }

    return true;
  }, [user]);

  return {
    fetchHistory,
    recordChanges,
    loading,
  };
}
