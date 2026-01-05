import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export type PaymentRecordStatus = 'pending' | 'approved' | 'rejected';

export interface PaymentRecord {
  id: string;
  order_id: string;
  amount: number;
  screenshot_url: string;
  screenshot_signed_url?: string;
  notes: string | null;
  status: PaymentRecordStatus;
  submitted_by: string;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
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

      // Generate signed URLs for each screenshot (1 hour expiry)
      const recordsWithSignedUrls = await Promise.all(
        (data || []).map(async (record: any) => {
          const storagePath = extractStoragePath(record.screenshot_url);
          const { data: signedUrlData, error: signedUrlError } = await supabase.storage
            .from('payment-screenshots')
            .createSignedUrl(storagePath, 3600); // 1 hour expiry

          return {
            ...record,
            screenshot_signed_url: signedUrlError ? null : signedUrlData?.signedUrl,
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
    screenshotUrl: string,
    notes?: string
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
          screenshot_url: screenshotUrl,
          notes: notes || null,
          submitted_by: user.id,
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

  return {
    records,
    loading,
    uploadScreenshot,
    submitPayment,
    approvePayment,
    rejectPayment,
    refetch: fetchRecords,
  };
}
