import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  sanitizeImportPayload,
  mapImportServerError,
  type ImportFieldErrors,
} from "@/lib/importValidation";
import { recordProcurementAudit, PROCUREMENT_AUDIT_ACTIONS } from "@/lib/procurementAudit";

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

  // FX — captured at booking so reported value does not move with the market.
  base_currency: string;
  /** Units of base_currency per 1 unit of `currency`. 1 when they match. */
  fx_rate: number;
  fx_rate_date: string | null;
  /** Generated in Postgres: total_amount * fx_rate. Read-only. */
  base_amount: number | null;

  // Landed cost. All local charges, already in base_currency.
  freight_cost: number;
  insurance_cost: number;
  customs_duty: number;
  clearing_agent_fee: number;
  port_charges: number;
  other_landed_costs: number;
  /** IGST paid at the port. Recorded for the return; an input credit, not a cost. */
  igst_amount: number;
  assessable_value: number | null;
  /** Generated in Postgres: base_amount + local charges, excluding IGST. Read-only. */
  total_landed_cost: number | null;

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

/** True for an http(s) link that is not one of our storage objects. */
export function isExternalUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^https?:\/\//i.test(value.trim()) && !/\/import-documents\//.test(value);
}

/** Generated columns — Postgres computes these; sending them back is an error. */
export const IMPORT_GENERATED_COLUMNS = ['base_amount', 'total_landed_cost'] as const;

export function stripGeneratedColumns<T extends Record<string, any>>(payload: T): T {
  const clean = { ...payload };
  for (const column of IMPORT_GENERATED_COLUMNS) delete clean[column];
  return clean;
}

export const IMPORT_DOCUMENTS_BUCKET = 'import-documents';

/** Signed links live 10 minutes — long enough to open, short enough to not leak. */
export const SIGNED_URL_TTL_SECONDS = 600;

/**
 * Import documents were originally persisted as full 1-year signed URLs, which
 * put a long-lived bearer token in a table every authenticated user can read.
 * New uploads persist the bare storage path instead. This accepts either form so
 * historical rows keep resolving.
 */
export function toImportStoragePath(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  const match = trimmed.match(/\/import-documents\/(.+?)(?:\?|$)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * The shape a caller may write. Excludes DB-managed columns and the generated
 * FX/landed-cost totals, so a form cannot accidentally try to set them.
 */
export type ImportWritable = Omit<
  Import,
  'id' | 'created_at' | 'updated_at' | 'base_amount' | 'total_landed_cost' | 'items'
>;

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

/**
 * Mint a short-lived link for an import document. Accepts a storage path (new
 * rows), a legacy full signed URL, or an externally hosted link the user pasted.
 * Standalone so components can resolve a document without subscribing to the
 * whole imports query.
 */
export async function getImportDocumentUrl(pathOrUrl: string): Promise<string | null> {
  const path = toImportStoragePath(pathOrUrl);
  // A link pointing somewhere other than our bucket — nothing to sign.
  if (!path) return isExternalUrl(pathOrUrl) ? pathOrUrl : null;

  try {
    const { data, error } = await supabase.storage
      .from(IMPORT_DOCUMENTS_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    if (error) throw error;
    return data.signedUrl;
  } catch (error: any) {
    console.error('Error getting signed URL:', error);
    return null;
  }
}

export function useImports() {
  const fetchImports = useCallback(async (): Promise<Import[]> => {
    try {
      const { data, error } = await supabase
        .from('imports')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const rows = data || [];
      if (rows.length === 0) return [];

      // One batched query for every import's line items. This used to fan out
      // into a separate request per import (N+1).
      const { data: allItems, error: itemsError } = await supabase
        .from('import_items')
        .select('*')
        .in('import_id', rows.map(imp => imp.id))
        .order('created_at', { ascending: true });

      if (itemsError) throw itemsError;

      const itemsByImport = new Map<string, ImportItem[]>();
      for (const item of (allItems ?? []) as ImportItem[]) {
        if (!item.import_id) continue;
        const bucket = itemsByImport.get(item.import_id) ?? [];
        bucket.push(item);
        itemsByImport.set(item.import_id, bucket);
      }

      return rows.map(imp => ({
        ...imp,
        items: itemsByImport.get(imp.id) ?? [],
      })) as unknown as Import[];
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
    importData: ImportWritable, 
    items: ImportItem[]
  ): Promise<ImportSaveResult> => {

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
        // Strip the Postgres-generated columns first, then let
        // sanitizeImportPayload turn '' into null for date/uuid/numeric columns.
        .insert(sanitizeImportPayload({
          ...stripGeneratedColumns(importData),
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
      
      recordProcurementAudit(
        { id: userData.user?.id, name: profile?.name },
        PROCUREMENT_AUDIT_ACTIONS.IMPORT_CREATED,
        {
          import_id: data.id,
          import_number: importNumber,
          supplier_id: importData.supplier_id ?? null,
          supplier_name: importData.supplier_name ?? null,
          total_amount: totalAmount || importData.total_amount || null,
          currency: importData.currency,
          item_count: items.length,
        }
      );

      toast.success('Import created successfully');
      await refetch();
      return { ok: true, data: data as Import };
    } catch (error: any) {
      console.error('Error creating import:', error);
      const { message, fieldErrors } = mapImportServerError(error);
      toast.error(`Failed to create import: ${message}`);
      return { ok: false, message, fieldErrors };
    }


  };

  const updateImport = async (
    id: string, 
    updates: Partial<Import>,
    items?: ImportItem[]
  ): Promise<ImportSaveResult> => {

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
        .update(sanitizeImportPayload(stripGeneratedColumns(updates)))
        .eq('id', id);


      if (error) throw error;

      const { data: actor } = await supabase.auth.getUser();
      recordProcurementAudit(
        { id: actor.user?.id },
        PROCUREMENT_AUDIT_ACTIONS.IMPORT_UPDATED,
        {
          import_id: id,
          // Field names only — values can carry supplier pricing, and the log is
          // readable well beyond procurement.
          fields: Object.keys(updates),
          total_amount: updates.total_amount ?? null,
          currency: updates.currency ?? null,
          status: updates.status ?? null,
          payment_status: updates.payment_status ?? null,
        }
      );

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
      return { ok: true };
    } catch (error: any) {
      console.error('Error updating import:', error);
      const { message, fieldErrors } = mapImportServerError(error);
      toast.error(`Failed to update import: ${message}`);
      return { ok: false, message, fieldErrors };
    }

  };

  const deleteImport = async (id: string) => {
    try {
      // Deleting an import cascades its line items — capture what is going.
      const { data: existing } = await supabase
        .from('imports')
        .select('import_number, supplier_name, total_amount, currency, status')
        .eq('id', id)
        .maybeSingle();

      const { error } = await supabase
        .from('imports')
        .delete()
        .eq('id', id);

      if (error) throw error;

      const { data: actor } = await supabase.auth.getUser();
      recordProcurementAudit(
        { id: actor.user?.id },
        PROCUREMENT_AUDIT_ACTIONS.IMPORT_DELETED,
        { import_id: id, ...(existing ?? {}) }
      );
      
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

      // Return the storage PATH, not a URL. `import-documents` is a private
      // bucket, so getPublicUrl() would have produced a permanently 400-ing
      // link. Callers mint a short-lived URL via getSignedUrl().
      return fileName;
    } catch (error: any) {
      console.error('Error uploading document:', error);
      toast.error('Failed to upload document');
      return null;
    }
  };

  const getSignedUrl = getImportDocumentUrl;

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
