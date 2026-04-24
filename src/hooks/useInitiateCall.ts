import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

export type CallEntityType = 'lead' | 'enquiry' | 'candidate' | 'customer' | 'prospect' | 'pipeline' | 'company' | 'other';

export interface InitiateCallArgs {
  /** Customer / candidate phone number */
  phoneNumber: string | null | undefined;
  /** Which module the call originates from */
  entityType?: CallEntityType;
  /** ID of the source record (lead/candidate/etc.) */
  entityId?: string | null;
  /** Optional: override salesperson (defaults to logged-in user) */
  salespersonId?: string | null;
}

export interface InitiateCallResult {
  success: boolean;
  callSid?: string;
  callLogId?: string;
  error?: string;
}

/** Centralized outbound call hook — routes through Exotel → ElevenLabs Flow */
export function useInitiateCall() {
  const { user } = useAuth();
  const [isCalling, setIsCalling] = useState(false);
  const inflightRef = useRef(false);

  const initiate = useCallback(
    async ({ phoneNumber, entityType, entityId, salespersonId }: InitiateCallArgs): Promise<InitiateCallResult> => {
      if (!user) {
        toast.error('You must be signed in to make calls');
        return { success: false, error: 'unauthenticated' };
      }

      const digits = String(phoneNumber || '').replace(/\D/g, '');
      if (!phoneNumber || digits.length < 8 || digits.length > 15) {
        toast.error('Invalid phone number');
        return { success: false, error: 'invalid_phone' };
      }

      // Guard against rapid duplicate clicks
      if (inflightRef.current) {
        return { success: false, error: 'already_in_flight' };
      }
      inflightRef.current = true;
      setIsCalling(true);

      try {
        const { data, error } = await supabase.functions.invoke('exotel-call-initiate', {
          body: {
            phone_number: phoneNumber,
            entity_type: entityType ?? null,
            entity_id: entityId ?? null,
            // Backward-compat for existing CRM Sales path
            lead_id: entityType === 'lead' ? entityId : null,
            salesperson_id: salespersonId ?? user.id,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        toast.success('Call initiated 📞');
        return { success: true, callSid: data?.call_sid, callLogId: data?.call_log_id };
      } catch (err: any) {
        const message = err?.message || 'Failed to initiate call';
        toast.error(message);
        return { success: false, error: message };
      } finally {
        inflightRef.current = false;
        setIsCalling(false);
      }
    },
    [user]
  );

  return { initiate, isCalling };
}