import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface OrderInvoice {
  id: string;
  order_id: string;
  storage_path: string;
  invoice_number: string | null;
  file_name: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useOrderInvoices(orderId: string | null | undefined) {
  const [invoices, setInvoices] = useState<OrderInvoice[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!orderId) {
      setInvoices([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('order_invoices')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Failed to fetch order invoices:', error);
    } else {
      setInvoices((data as OrderInvoice[]) || []);
    }
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const addInvoice = async (file: File, userId: string): Promise<OrderInvoice | null> => {
    if (!orderId) return null;
    try {
      const { validateFile } = await import('@/lib/fileValidation');
      const validation = validateFile(file, 'invoices');
      if (!validation.valid) {
        toast.error(validation.error);
        return null;
      }
      const ext = file.name.split('.').pop();
      const fileName = `${orderId}-${Date.now()}.${ext}`;
      const filePath = `${userId}/${fileName}`;
      const { error: upErr } = await supabase.storage
        .from('invoices')
        .upload(filePath, file);
      if (upErr) throw upErr;

      const { data: inserted, error: insErr } = await supabase
        .from('order_invoices')
        .insert({
          order_id: orderId,
          storage_path: filePath,
          file_name: file.name,
          uploaded_by: userId,
        })
        .select()
        .single();
      if (insErr) throw insErr;

      // Trigger AI extraction (best-effort; non-blocking)
      supabase.functions
        .invoke('extract-invoice-number', {
          body: { invoice_id: inserted.id, storage_path: filePath },
        })
        .then(({ data, error }) => {
          if (error) {
            console.warn('Invoice number extraction failed:', error);
            return;
          }
          if (data?.invoice_number) {
            setInvoices((prev) =>
              prev.map((inv) =>
                inv.id === inserted.id ? { ...inv, invoice_number: data.invoice_number } : inv
              )
            );
          }
        });

      setInvoices((prev) => [inserted as OrderInvoice, ...prev]);
      toast.success('Invoice uploaded');
      return inserted as OrderInvoice;
    } catch (err: any) {
      console.error('Upload invoice error:', err);
      toast.error(err.message || 'Failed to upload invoice');
      return null;
    }
  };

  const removeInvoice = async (invoice: OrderInvoice): Promise<boolean> => {
    try {
      await supabase.storage.from('invoices').remove([invoice.storage_path]);
      const { error } = await supabase.from('order_invoices').delete().eq('id', invoice.id);
      if (error) throw error;
      setInvoices((prev) => prev.filter((i) => i.id !== invoice.id));
      toast.success('Invoice removed');
      return true;
    } catch (err: any) {
      console.error('Remove invoice error:', err);
      toast.error(err.message || 'Failed to remove invoice');
      return false;
    }
  };

  return { invoices, loading, refetch: fetch, addInvoice, removeInvoice };
}