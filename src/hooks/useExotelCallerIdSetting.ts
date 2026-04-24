import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface CallerIdValue {
  caller_id?: string;
}

export function useExotelCallerIdSetting() {
  const { user, profile } = useAuth();
  const [callerId, setCallerId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchValue = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'exotel_caller_id')
      .maybeSingle();
    if (error) {
      console.error('Failed to load Caller ID setting:', error.message);
    }
    const v = (data?.value as CallerIdValue | null)?.caller_id ?? '';
    setCallerId(v);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchValue();
  }, [fetchValue]);

  const save = useCallback(
    async (next: string): Promise<boolean> => {
      const trimmed = next.trim();
      // Validation: digits, optional leading +, 8–15 digits
      const digits = trimmed.replace(/\D/g, '');
      if (trimmed && (digits.length < 8 || digits.length > 15)) {
        toast.error('Caller ID must be a valid phone number (8–15 digits)');
        return false;
      }
      if (!user) {
        toast.error('You must be signed in');
        return false;
      }
      setSaving(true);
      const { error } = await supabase
        .from('app_settings')
        .upsert(
          {
            key: 'exotel_caller_id',
            value: { caller_id: trimmed },
            updated_by: user.id,
            updated_by_name: profile?.name ?? null,
          },
          { onConflict: 'key' }
        );
      setSaving(false);
      if (error) {
        toast.error(`Failed to save: ${error.message}`);
        return false;
      }
      toast.success('Caller ID updated');
      setCallerId(trimmed);
      return true;
    },
    [user, profile]
  );

  return { callerId, loading, saving, save, refresh: fetchValue };
}
