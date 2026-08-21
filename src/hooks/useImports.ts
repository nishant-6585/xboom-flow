import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ImportItem {
  id?: string;
  import_id?: string;
  product_name: string;
  product_category: string;
  product_code: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  hsn_code: string;
  notes: string;
}

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
  items?: ImportItem[];
}

export type ImportStatus = 'pending' | 'shipped' | 'in_transit' | 'at_port' | 'customs_clearance' | 'cleared' | 'delivered' | 'cancelled';

export interface ImportSaveResult {
  ok: boolean;
  data?: Import | null;
  message?: string;
  fieldErrors?: ImportFieldErrors;
}


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
  const fetchImports = useCallback(async (): Promise<Import[]> => {
    try {
      const { data, error } = await supabase
        .from('imports')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Fetch items for each import
      const importsWithItems = await Promise.all(
        (data || []).map(async (imp: any) => {
          const { data: items } = await supabase
            .from('import_items')
            .select('*')
            .eq('import_id', imp.id)
            .order('created_at', { ascending: true });
          
          return { ...imp, items: items || [] } as Import;
        })
      );
      
      return importsWithItems;
    } catch (error: any) {
      console.error('Error fetching imports:', error);
      toast.error('Failed to fetch imports');
      return [];
    }
  }, []);

  const importsQuery = useQuery({
    queryKey: ['imports'],
    queryFn: fetchImports,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const imports = importsQuery.data ?? [];
  const loading = importsQuery.isLoading;
  const refetch = useCallback(() => importsQuery.refetch(), [importsQuery]);

  const createImport = async (
    importData: Omit<Import, 'id' | 'created_at' | 'updated_at'>, 
    items: ImportItem[]
  ) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('user_id', userData.user?.id || '')
        .single();

      // Generate import number
      const importNumber = `IMP-${Date.now().toString(36).toUpperCase()}`;

      // Calculate totals from items
      const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
      const totalAmount = items.reduce((sum, item) => sum + item.total_amount, 0);
      const productNames = items.map(i => i.product_name).join(', ');

      const { data, error } = await supabase
        .from('imports')
        .insert(sanitizeImportPayload({
          ...importData,
          import_number: importNumber,
          product_name: productNames || importData.product_name,
          quantity: totalQuantity || importData.quantity,
          total_amount: totalAmount || importData.total_amount,
          created_by: userData.user?.id,
          created_by_name: profile?.name || 'Unknown',
        }))
        .select()
        .single();


      if (error) throw error;

      // Insert items
      if (items.length > 0) {
        const itemsToInsert = items.map(item => ({
          import_id: data.id,
          product_name: item.product_name,
          product_category: item.product_category,
          product_code: item.product_code,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_amount: item.total_amount,
          hsn_code: item.hsn_code,
          notes: item.notes,
        }));

        const { error: itemsError } = await supabase
          .from('import_items')
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;
      }
      
      toast.success('Import created successfully');
      await refetch();
      return data as Import;
    } catch (error: any) {
      console.error('Error creating import:', error);
      toast.error(error?.message ? `Failed to create import: ${error.message}` : 'Failed to create import');
      return null;
    }

  };

  const updateImport = async (
    id: string, 
    updates: Partial<Import>,
    items?: ImportItem[]
  ) => {
    try {
      // Calculate totals from items if provided
      if (items && items.length > 0) {
        const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
        const totalAmount = items.reduce((sum, item) => sum + item.total_amount, 0);
        const productNames = items.map(i => i.product_name).join(', ');
        
        updates.product_name = productNames;
        updates.quantity = totalQuantity;
        updates.total_amount = totalAmount;
      }

      const { error } = await supabase
        .from('imports')
        .update(sanitizeImportPayload(updates))
        .eq('id', id);


      if (error) throw error;

      // Update items if provided
      if (items) {
        // Delete existing items
        await supabase
          .from('import_items')
          .delete()
          .eq('import_id', id);

        // Insert new items
        if (items.length > 0) {
          const itemsToInsert = items.map(item => ({
            import_id: id,
            product_name: item.product_name,
            product_category: item.product_category,
            product_code: item.product_code,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_amount: item.total_amount,
            hsn_code: item.hsn_code,
            notes: item.notes,
          }));

          const { error: itemsError } = await supabase
            .from('import_items')
            .insert(itemsToInsert);

          if (itemsError) throw itemsError;
        }
      }
      
      toast.success('Import updated successfully');
      await refetch();
      return true;
    } catch (error: any) {
      console.error('Error updating import:', error);
      toast.error(error?.message ? `Failed to update import: ${error.message}` : 'Failed to update import');
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
      await refetch();
      return true;
    } catch (error: any) {
      console.error('Error deleting import:', error);
      toast.error('Failed to delete import');
      return false;
    }
  };

  const uploadDocument = async (file: File, importId: string, documentType: string) => {
    try {
      const { validateFile } = await import('@/lib/fileValidation');
      const validation = validateFile(file, 'imports');
      if (!validation.valid) { toast.error(validation.error); return null; }
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

  return {
    imports,
    loading,
    fetchImports: refetch,
    createImport,
    updateImport,
    deleteImport,
    uploadDocument,
    getSignedUrl,
    refetch,
  };
}
