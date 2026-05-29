import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface CorrectionRequest {
  id: string;
  attendance_log_id: string;
  employee_id: string;
  requested_by: string;
  requested_by_name: string;
  current_check_in_time: string | null;
  current_check_out_time: string | null;
  requested_check_in_time: string | null;
  requested_check_out_time: string | null;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
}

export function useAttendanceCorrectionRequests() {
  const { user, profile, role } = useAuth();
  const [requests, setRequests] = useState<CorrectionRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const isHROrAdmin = role === 'admin' || role === 'hr';

  const fetchRequests = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('attendance_correction_requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching correction requests:', error);
    }
    if (!error) setRequests((data as CorrectionRequest[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // Real-time subscription so HR sees new requests instantly
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('correction-requests-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance_correction_requests',
        },
        () => {
          fetchRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchRequests]);

  const submitRequest = async (params: {
    attendance_log_id: string;
    employee_id: string;
    current_check_in_time: string | null;
    current_check_out_time: string | null;
    requested_check_in_time: string | null;
    requested_check_out_time: string | null;
    reason: string;
  }) => {
    if (!user || !profile) throw new Error('Not authenticated');
    const { error } = await supabase
      .from('attendance_correction_requests')
      .insert({
        ...params,
        requested_by: user.id,
        requested_by_name: profile.name || user.email || 'Unknown',
      });
    if (error) throw error;
    await fetchRequests();
  };

  const reviewRequest = async (
    requestId: string,
    decision: 'approved' | 'rejected',
    reviewNotes: string
  ) => {
    if (!user || !profile) throw new Error('Not authenticated');

    // Get the request first
    const request = requests.find(r => r.id === requestId);
    if (!request) throw new Error('Request not found');

    // Update the request status
    const { error: updateError } = await supabase
      .from('attendance_correction_requests')
      .update({
        status: decision,
        reviewed_by: user.id,
        reviewed_by_name: profile.name || user.email || 'Unknown',
        reviewed_at: new Date().toISOString(),
        review_notes: reviewNotes,
      })
      .eq('id', requestId);
    if (updateError) throw updateError;

    // If approved, apply the correction to attendance_logs
    if (decision === 'approved') {
      const updateData: Record<string, any> = {
        is_provisional_checkout: false,
        corrected_by: user.id,
        corrected_at: new Date().toISOString(),
      };

      if (request.requested_check_in_time) {
        updateData.check_in_time = request.requested_check_in_time;
      }
      if (request.requested_check_out_time) {
        updateData.check_out_time = request.requested_check_out_time;
      }

      // working_hours is automatically recalculated by the calculate_working_hours trigger

      const { error: logError } = await supabase
        .from('attendance_logs')
        .update(updateData)
        .eq('id', request.attendance_log_id);
      if (logError) throw logError;

      // Audit log
      const checkinChanged = request.requested_check_in_time && request.requested_check_in_time !== request.current_check_in_time;
      const checkoutChanged = request.requested_check_out_time && request.requested_check_out_time !== request.current_check_out_time;
      const eventType = checkinChanged && checkoutChanged
        ? 'CORRECTION_APPROVED'
        : checkinChanged
        ? 'CHECKIN_CORRECTION_APPROVED'
        : 'CORRECTION_APPROVED';

      await supabase.from('attendance_audit_log').insert({
        attendance_log_id: request.attendance_log_id,
        employee_id: request.employee_id,
        event_type: eventType,
        performed_by: user.id,
        old_checkout_time: request.current_check_out_time,
        new_checkout_time: request.requested_check_out_time,
        notes: `Correction request approved. ${reviewNotes || ''}`.trim(),
        metadata: {
          request_id: requestId,
          requested_by: request.requested_by_name,
          old_check_in_time: request.current_check_in_time,
          new_check_in_time: request.requested_check_in_time,
        },
      });
    }

    await fetchRequests();
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');

  const bulkReviewRequests = async (
    requestIds: string[],
    decision: 'approved' | 'rejected',
    reviewNotes: string
  ) => {
    let success = 0;
    const failures: { id: string; error: string }[] = [];
    for (const id of requestIds) {
      try {
        await reviewRequest(id, decision, reviewNotes);
        success++;
      } catch (e: any) {
        failures.push({ id, error: e?.message || 'Unknown error' });
      }
    }
    return { success, failures };
  };

  return {
    requests,
    pendingRequests,
    loading,
    submitRequest,
    reviewRequest,
    bulkReviewRequests,
    refetch: fetchRequests,
    isHROrAdmin,
  };
}
