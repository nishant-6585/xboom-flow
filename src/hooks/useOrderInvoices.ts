import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface OrderInvoice {
  id: string;
  order_id: string | null;
  woocommerce_order_id?: string | null;
  storage_path: string;
  invoice_number: string | null;
  file_name: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  source?: 'xboom' | 'zoho';
  document_type?: 'proforma' | 'tax_invoice';
  subtotal?: number | null;
  tax_amount?: number | null;
  total?: number | null;
  amount_paid?: number | null;
  place_of_supply?: string | null;
  gst_treatment?: 'igst' | 'cgst_sgst' | null;
  tax_breakup?: unknown;
  zoho_invoice_id?: string | null;
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

export interface ProformaPersistMeta {
  invoice_number: string;
  subtotal: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  place_of_supply: string;
  gst_treatment: 'igst' | 'cgst_sgst';
  tax_breakup: unknown;
}

export interface UploadProformaTarget {
  /** Either orderId OR woocommerceOrderId must be provided. */
  orderId?: string | null;
  woocommerceOrderId?: string | null;
  /** If set, replaces (deletes + reinserts) this prior proforma — used for Regenerate. */
  replaceInvoiceId?: string | null;
  /** Free-form snapshot stored in audit log (POS, GST rate, lines, etc.). */
  auditSnapshot?: Record<string, unknown>;
  /** Human-readable name for the audit log. */
  generatedByName?: string | null;
}

export async function uploadProformaInvoice(
  target: UploadProformaTarget,
  userId: string,
  blob: Blob,
  meta: ProformaPersistMeta,
): Promise<OrderInvoice | null> {
  const { orderId, woocommerceOrderId, replaceInvoiceId, auditSnapshot, generatedByName } = target;
  if ((!orderId && !woocommerceOrderId) || (orderId && woocommerceOrderId)) {
    toast.error('Internal error: proforma target must be exactly one of order or woo order');
    return null;
  }
  try {
    const fileName = `${meta.invoice_number}.pdf`;
    const refId = orderId || woocommerceOrderId!;
    const filePath = `${userId}/${refId}-${Date.now()}-${meta.invoice_number}.pdf`;
    const file = new File([blob], fileName, { type: 'application/pdf' });

    const { error: upErr } = await supabase.storage.from('invoices').upload(filePath, file, {
      contentType: 'application/pdf',
      upsert: false,
    });
    if (upErr) throw upErr;

    // If regenerating, remove the prior file + row first (best-effort)
    if (replaceInvoiceId) {
      const { data: prior } = await supabase
        .from('order_invoices')
        .select('storage_path')
        .eq('id', replaceInvoiceId)
        .maybeSingle();
      if (prior?.storage_path) {
        await supabase.storage.from('invoices').remove([prior.storage_path]);
      }
      await supabase.from('order_invoices').delete().eq('id', replaceInvoiceId);
    }

    const { data: inserted, error: insErr } = await supabase
      .from('order_invoices')
      .insert({
        order_id: orderId ?? null,
        woocommerce_order_id: woocommerceOrderId ?? null,
        storage_path: filePath,
        file_name: fileName,
        uploaded_by: userId,
        invoice_number: meta.invoice_number,
        source: 'xboom',
        document_type: 'proforma',
        subtotal: meta.subtotal,
        tax_amount: meta.tax_amount,
        total: meta.total,
        amount_paid: meta.amount_paid,
        place_of_supply: meta.place_of_supply,
        gst_treatment: meta.gst_treatment,
        tax_breakup: meta.tax_breakup as any,
      } as any)
      .select()
      .single();
    if (insErr) throw insErr;

    // Audit log (best-effort)
    try {
      await (supabase.from('proforma_audit_log') as any).insert({
        invoice_id: (inserted as any).id,
        order_id: orderId ?? null,
        woocommerce_order_id: woocommerceOrderId ?? null,
        action: replaceInvoiceId ? 'regenerated' : 'generated',
        proforma_number: meta.invoice_number,
        generated_by: userId,
        generated_by_name: generatedByName ?? null,
        snapshot: {
          ...(auditSnapshot || {}),
          subtotal: meta.subtotal,
          tax_amount: meta.tax_amount,
          total: meta.total,
          amount_paid: meta.amount_paid,
          place_of_supply: meta.place_of_supply,
          gst_treatment: meta.gst_treatment,
          tax_breakup: meta.tax_breakup,
        },
      });
    } catch (auditErr) {
      console.warn('Proforma audit log insert failed (non-blocking):', auditErr);
    }

    return inserted as OrderInvoice;
  } catch (err: any) {
    console.error('Proforma upload failed', err);
    toast.error(err.message || 'Failed to save proforma');
    return null;
  }
}

/**
 * Hook variant for WooCommerce orders. Mirrors useOrderInvoices but scoped to a
 * woocommerce_orders.id (the internal UUID, NOT the woo_order_id integer).
 */
export function useWooOrderInvoices(woocommerceOrderId: string | null | undefined) {
  const [invoices, setInvoices] = useState<OrderInvoice[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!woocommerceOrderId) {
      setInvoices([]);
      return;
    }
    setLoading(true);
    const { data, error } = await (supabase.from('order_invoices') as any)
      .select('*')
      .eq('woocommerce_order_id', woocommerceOrderId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Failed to fetch woo order invoices:', error);
    } else {
      setInvoices((data as OrderInvoice[]) || []);
    }
    setLoading(false);
  }, [woocommerceOrderId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

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

  return { invoices, loading, refetch: fetch, removeInvoice };
}