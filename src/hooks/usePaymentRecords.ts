import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { PaymentMode } from '@/lib/paymentModes';
import { useQueryClient } from '@tanstack/react-query';

export type PaymentRecordStatus = 'pending' | 'approved' | 'rejected';

export interface PaymentRecord {
  id: string;
  order_id: string;
  amount: number;
  screenshot_url: string | null;
  screenshot_signed_url?: string;
  screenshot_signed_urls?: string[]; // For multiple screenshots
  notes: string | null;
  status: PaymentRecordStatus;
  submitted_by: string;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_by_name?: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  payment_mode: PaymentMode | null;
  reference_number: string | null;
  payment_date: string | null;
}

// Helper to extract storage path from a public URL or return as-is if already a path
const extractStoragePath = (url: string): string => {
  // If it's a full URL, extract the path after /storage/v1/object/public/payment-screenshots/
  const publicUrlPattern = /\/storage\/v1\/object\/public\/payment-screenshots\/(.+)$/;
  const match = url.match(publicUrlPattern);
  if (match) {
    return match[1];
  }
  // If it's already just a path, return as-is
  return url;
};

export function usePaymentRecords(orderId?: string) {
  const [records, setRecords] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Invalidate every cache that derives from order payment data so
  // received/pending/aging/finance views stay in sync after any change.
  const invalidatePaymentDerivedCaches = useCallback(() => {
    const keys = [
      ['orders'],
      ['invoices'],
      ['invoice-payments'],
      ['ar-aging'],
      ['ap-aging'],
      ['expected-payments'],
      ['payment-reminders'],
      ['pending-payment-approvals'],
      ['companies'],
      ['company-engagement'],
      ['order-profits'],
      ['tally'],
      ['finance'],
      ['cashflow'],
    ];
    keys.forEach((k) => queryClient.invalidateQueries({ queryKey: k }));
  }, [queryClient]);

  // Broadcast a change so every hook instance on the page (dialog, list,
  // header chip, etc.) refetches immediately — independent of realtime.
  const broadcastChange = useCallback((changedOrderId?: string | null) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('payment_records:changed', {
        detail: { orderId: changedOrderId ?? null },
      }),
    );
  }, []);

  const fetchRecords = useCallback(async () => {
    if (!user) {
      setRecords([]);
      setLoading(false);
      return;
    }

    try {
      // Silent-update: only show the loader on the very first fetch.
      // Subsequent refetches (post-submit, realtime, cross-tab events)
      // keep the current list rendered to avoid flicker.
      setLoading((prev) => (hasFetchedOnce ? false : true));
      let query = supabase
        .from('payment_records')
        .select('*')
        .order('created_at', { ascending: false });

      if (orderId) {
        query = query.eq('order_id', orderId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const rawRecords = (data || []) as any[];

      // Batch fetch reviewer names in a single query
      const reviewerIds = Array.from(
        new Set(rawRecords.map((r) => r.reviewed_by).filter(Boolean))
      );
      const reviewerNameMap = new Map<string, string>();
      if (reviewerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, name')
          .in('user_id', reviewerIds);
        (profiles || []).forEach((p: any) => {
          if (p.user_id && p.name) reviewerNameMap.set(p.user_id, p.name);
        });
      }

      // Generate all signed URLs in parallel (1 hour expiry)
      const recordsWithSignedUrls = await Promise.all(
        rawRecords.map(async (record: any) => {
          const screenshotPaths: string[] = (record.screenshot_url || '')
            .split(',')
            .map((p: string) => p.trim())
            .filter(Boolean);

          const signed = await Promise.all(
            screenshotPaths.map(async (path) => {
              const storagePath = extractStoragePath(path);
              const { data: signedUrlData } = await supabase.storage
                .from('payment-screenshots')
                .createSignedUrl(storagePath, 3600);
              return signedUrlData?.signedUrl || null;
            })
          );
          const signedUrls = signed.filter((u): u is string => !!u);

          return {
            ...record,
            screenshot_signed_url: signedUrls[0] || null,
            screenshot_signed_urls: signedUrls,
            reviewed_by_name: record.reviewed_by ? reviewerNameMap.get(record.reviewed_by) || null : null,
          } as PaymentRecord;
        })
      );

      setRecords((prev) => {
        // Equality-check to avoid unnecessary re-renders when nothing changed.
        if (prev.length === recordsWithSignedUrls.length) {
          const same = prev.every((p, i) => {
            const n = recordsWithSignedUrls[i];
            return (
              p.id === n.id &&
              p.status === n.status &&
              p.amount === n.amount &&
              p.reviewed_at === n.reviewed_at &&
              p.rejection_reason === n.rejection_reason &&
              p.screenshot_url === n.screenshot_url
            );
          });
          if (same) return prev;
        }
        return recordsWithSignedUrls;
      });
    } catch (error: any) {
      console.error('Error fetching payment records:', error);
    } finally {
      setLoading(false);
      setHasFetchedOnce(true);
    }
  }, [user, orderId, hasFetchedOnce]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Cross-instance broadcast: every hook instance for the same orderId
  // (e.g. PaymentUploadDialog and PaymentRecordsList) refetches immediately
  // when a submit/approve/reject/delete happens anywhere in the page, without
  // waiting for the realtime round-trip.
  useEffect(() => {
    if (!user) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ orderId?: string }>).detail;
      if (!detail) return;
      if (!orderId || !detail.orderId || detail.orderId === orderId) {
        fetchRecords();
      }
    };
    window.addEventListener('payment_records:changed', handler);
    return () => window.removeEventListener('payment_records:changed', handler);
  }, [user, orderId, fetchRecords]);

  // Realtime: any payment_records change anywhere (this order or others)
  // refreshes the local list AND invalidates downstream caches.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`payment-records-${orderId ?? 'all'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payment_records',
          ...(orderId ? { filter: `order_id=eq.${orderId}` } : {}),
        },
        () => {
          fetchRecords();
          invalidatePaymentDerivedCaches();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, orderId, fetchRecords, invalidatePaymentDerivedCaches]);

  const uploadScreenshot = async (file: File): Promise<string | null> => {
    try {
      const { validateFile } = await import('@/lib/fileValidation');
      const validation = validateFile(file, 'screenshots');
      if (!validation.valid) { toast.error(validation.error); return null; }
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${user?.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('payment-screenshots')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Return the storage path (not a public URL) - we'll generate signed URLs when fetching
      return filePath;
    } catch (error: any) {
      console.error('Error uploading screenshot:', error);
      toast.error('Failed to upload screenshot');
      return null;
    }
  };

  const submitPayment = async (
    orderIdParam: string,
    amount: number,
    screenshotUrl: string | null,
    notes?: string,
    extra?: {
      payment_mode?: PaymentMode | null;
      reference_number?: string | null;
      payment_date?: string | null;
    },
  ): Promise<boolean> => {
    if (!user) {
      toast.error('You must be logged in');
      return false;
    }

    try {
      const { error } = await supabase
        .from('payment_records')
        .insert({
          order_id: orderIdParam,
          amount,
          screenshot_url: screenshotUrl && screenshotUrl.length > 0 ? screenshotUrl : null,
          notes: notes || null,
          submitted_by: user.id,
          payment_mode: extra?.payment_mode ?? null,
          reference_number: extra?.reference_number?.trim() ? extra.reference_number.trim() : null,
          payment_date: extra?.payment_date ?? null,
        });

      if (error) throw error;

      toast.success('Payment submitted for approval');
      await fetchRecords();
      invalidatePaymentDerivedCaches();
      broadcastChange(orderIdParam ?? orderId ?? null);
      return true;
    } catch (error: any) {
      console.error('Error submitting payment:', error);
      toast.error(error.message || 'Failed to submit payment');
      return false;
    }
  };

  const approvePayment = async (recordId: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('payment_records')
        .update({
          status: 'approved',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', recordId);

      if (error) throw error;

      toast.success('Payment approved');
      await fetchRecords();
      invalidatePaymentDerivedCaches();
      broadcastChange(orderId ?? null);
      return true;
    } catch (error: any) {
      console.error('Error approving payment:', error);
      toast.error(error.message || 'Failed to approve payment');
      return false;
    }
  };

  const rejectPayment = async (recordId: string, reason: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('payment_records')
        .update({
          status: 'rejected',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: reason,
        })
        .eq('id', recordId);

      if (error) throw error;

      toast.success('Payment rejected');
      await fetchRecords();
      invalidatePaymentDerivedCaches();
      broadcastChange(orderId ?? null);
      return true;
    } catch (error: any) {
      console.error('Error rejecting payment:', error);
      toast.error(error.message || 'Failed to reject payment');
      return false;
    }
  };

  const disapprovePayment = async (recordId: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('payment_records')
        .update({
          status: 'pending',
          reviewed_by: null,
          reviewed_at: null,
          rejection_reason: null,
        })
        .eq('id', recordId);

      if (error) throw error;

      toast.success('Payment moved back to pending');
      await fetchRecords();
      invalidatePaymentDerivedCaches();
      broadcastChange(orderId ?? null);
      return true;
    } catch (error: any) {
      console.error('Error disapproving payment:', error);
      toast.error(error.message || 'Failed to disapprove payment');
      return false;
    }
  };

  const deletePaymentRecord = async (record: PaymentRecord): Promise<boolean> => {
    if (!user) return false;

    try {
      // First delete screenshots from storage
      const screenshotPaths = (record.screenshot_url || '')
        .split(',')
        .map((p: string) => p.trim())
        .filter(Boolean);
      
      for (const path of screenshotPaths) {
        const storagePath = extractStoragePath(path);
        const { error: deleteStorageError } = await supabase.storage
          .from('payment-screenshots')
          .remove([storagePath]);
        
        if (deleteStorageError) {
          console.error('Error deleting screenshot from storage:', deleteStorageError);
        }
      }

      // Then delete the record
      const { error } = await supabase
        .from('payment_records')
        .delete()
        .eq('id', record.id);

      if (error) throw error;

      toast.success('Payment record deleted');
      await fetchRecords();
      invalidatePaymentDerivedCaches();
      broadcastChange(orderId ?? null);
      return true;
    } catch (error: any) {
      console.error('Error deleting payment record:', error);
      toast.error(error.message || 'Failed to delete payment record');
      return false;
    }
  };

  const updatePaymentRecord = async (
    recordId: string,
    amount: number,
    screenshotUrl: string | null,
    notes?: string,
    extra?: {
      payment_mode?: PaymentMode | null;
      reference_number?: string | null;
      payment_date?: string | null;
    },
  ): Promise<boolean> => {
    if (!user) {
      toast.error('You must be logged in');
      return false;
    }

    try {
      const { error } = await supabase
        .from('payment_records')
        .update({
          amount,
          screenshot_url: screenshotUrl && screenshotUrl.length > 0 ? screenshotUrl : null,
          notes: notes || null,
          payment_mode: extra?.payment_mode ?? null,
          reference_number: extra?.reference_number?.trim() ? extra.reference_number.trim() : null,
          payment_date: extra?.payment_date ?? null,
          // Resubmit: reset to pending and clear prior review
          status: 'pending',
          rejection_reason: null,
          reviewed_by: null,
          reviewed_at: null,
        })
        .eq('id', recordId);

      if (error) throw error;

      toast.success('Payment resubmitted for approval');
      await fetchRecords();
      invalidatePaymentDerivedCaches();
      broadcastChange(orderId ?? null);
      return true;
    } catch (error: any) {
      console.error('Error updating payment record:', error);
      toast.error(error.message || 'Failed to update payment record');
      return false;
    }
  };

  return {
    records,
    loading,
    uploadScreenshot,
    submitPayment,
    updatePaymentRecord,
    approvePayment,
    rejectPayment,
    disapprovePayment,
    deletePaymentRecord,
    refetch: fetchRecords,
  };
}
