import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { PaymentMode } from '@/lib/paymentModes';

export type PaymentRecordStatus = 'pending' | 'approved' | 'rejected';

export interface PaymentRecord {
  id: string;
  order_id: string;
  amount: number;
  screenshot_url: string;
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
  const { user } = useAuth();

  const fetchRecords = useCallback(async () => {
    if (!user) {
      setRecords([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
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

      setRecords(recordsWithSignedUrls);
    } catch (error: any) {
      console.error('Error fetching payment records:', error);
    } finally {
      setLoading(false);
    }
  }, [user, orderId]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

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
      const screenshotPaths = record.screenshot_url.split(',').map((p: string) => p.trim());
      
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
      return true;
    } catch (error: any) {
      console.error('Error deleting payment record:', error);
      toast.error(error.message || 'Failed to delete payment record');
      return false;
    }
  };

  return {
    records,
    loading,
    uploadScreenshot,
    submitPayment,
    approvePayment,
    rejectPayment,
    disapprovePayment,
    deletePaymentRecord,
    refetch: fetchRecords,
  };
}
