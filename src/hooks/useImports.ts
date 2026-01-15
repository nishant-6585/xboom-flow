import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Import {
  id: string;
  import_number: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  product_name: string;
  product_category: string | null;
  quantity: number;
  unit_price: number | null;
  total_amount: number | null;
  currency: string;
  origin_country: string | null;
  port_of_origin: string | null;
  port_of_destination: string | null;
  shipping_method: string | null;
  shipping_line: string | null;
  container_number: string | null;
  bl_number: string | null;
  order_date: string | null;
  expected_arrival: string | null;
  actual_arrival: string | null;
  clearance_date: string | null;
  status: string;
  po_document_url: string | null;
  payment_proof_url: string | null;
  courier_document_url: string | null;
  bill_of_entry_url: string | null;
  packing_list_url: string | null;
  commercial_invoice_url: string | null;
  other_documents_urls: string[] | null;
  payment_status: string;
  payment_amount: number | null;
  payment_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  created_by_name: string | null;
}

export type ImportStatus = 'pending' | 'shipped' | 'in_transit' | 'at_port' | 'customs_clearance' | 'cleared' | 'delivered' | 'cancelled';
export type PaymentStatus = 'pending' | 'partial' | 'paid';

export const IMPORT_STATUSES: { value: ImportStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'at_port', label: 'At Port' },
  { value: 'customs_clearance', label: 'Customs Clearance' },
  { value: 'cleared', label: 'Cleared' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const PAYMENT_STATUSES: { value: PaymentStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'partial', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
];

export const SHIPPING_METHODS = [
  { value: 'sea', label: 'Sea Freight' },
  { value: 'air', label: 'Air Freight' },
  { value: 'land', label: 'Land Transport' },
];

export function useImports() {
  const [imports, setImports] = useState<Import[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchImports = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('imports')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setImports((data || []) as Import[]);
    } catch (error: any) {
      console.error('Error fetching imports:', error);
      toast.error('Failed to fetch imports');
    } finally {
      setLoading(false);
    }
  }, []);

  const createImport = async (importData: Omit<Import, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('user_id', userData.user?.id || '')
        .single();

      // Generate import number
      const importNumber = `IMP-${Date.now().toString(36).toUpperCase()}`;

      const { data, error } = await supabase
        .from('imports')
        .insert({
          ...importData,
          import_number: importNumber,
          created_by: userData.user?.id,
          created_by_name: profile?.name || 'Unknown',
        })
        .select()
        .single();

      if (error) throw error;
      
      toast.success('Import created successfully');
      await fetchImports();
      return data as Import;
    } catch (error: any) {
      console.error('Error creating import:', error);
      toast.error('Failed to create import');
      return null;
    }
  };

  const updateImport = async (id: string, updates: Partial<Import>) => {
    try {
      const { error } = await supabase
        .from('imports')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      
      toast.success('Import updated successfully');
      await fetchImports();
      return true;
    } catch (error: any) {
      console.error('Error updating import:', error);
      toast.error('Failed to update import');
      return false;
    }
  };

  const deleteImport = async (id: string) => {
    try {
      const { error } = await supabase
        .from('imports')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast.success('Import deleted successfully');
      await fetchImports();
      return true;
    } catch (error: any) {
      console.error('Error deleting import:', error);
      toast.error('Failed to delete import');
      return false;
    }
  };

  const uploadDocument = async (file: File, importId: string, documentType: string) => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${importId}/${documentType}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('import-documents')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('import-documents')
        .getPublicUrl(fileName);

      return urlData.publicUrl;
    } catch (error: any) {
      console.error('Error uploading document:', error);
      toast.error('Failed to upload document');
      return null;
    }
  };

  const getSignedUrl = async (path: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('import-documents')
        .createSignedUrl(path, 3600);

      if (error) throw error;
      return data.signedUrl;
    } catch (error: any) {
      console.error('Error getting signed URL:', error);
      return null;
    }
  };

  useEffect(() => {
    fetchImports();
  }, [fetchImports]);

  return {
    imports,
    loading,
    fetchImports,
    createImport,
    updateImport,
    deleteImport,
    uploadDocument,
    getSignedUrl,
    refetch: fetchImports,
  };
}
