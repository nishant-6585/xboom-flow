import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PortalDocument {
  id: string;
  order_id: string | null;
  product_id: string | null;
  doc_type: string;
  title: string;
  file_url: string | null;
  external_url: string | null;
  file_size_bytes: number | null;
  version: number;
  is_master: boolean;
  uploaded_at: string;
}

export const DOC_TYPE_LABELS: Record<string, string> = {
  quote_pdf: "Quote",
  customer_po: "Customer PO",
  sales_invoice: "Sales invoice",
  gst_invoice: "GST invoice",
  packing_list: "Packing list",
  awb_courier: "Courier AWB",
  calibration_cert: "Calibration cert",
  serial_number_card: "Serial number card",
  user_manual: "User manual",
  training_video: "Training video",
  amc_warranty: "AMC / warranty",
  spare_parts_list: "Spare parts list",
  dgca_compliance: "DGCA compliance",
  pilot_license: "Pilot license",
  other: "Other",
};

export const DOC_GROUPS: { key: string; label: string; types: string[] }[] = [
  { key: "financial", label: "Financial", types: ["quote_pdf", "customer_po", "sales_invoice", "gst_invoice"] },
  { key: "shipment", label: "Shipment", types: ["packing_list", "awb_courier"] },
  { key: "compliance", label: "Compliance & certificates", types: ["calibration_cert", "serial_number_card", "dgca_compliance", "pilot_license", "amc_warranty"] },
  { key: "manuals", label: "Manuals & training", types: ["user_manual", "training_video", "spare_parts_list"] },
  { key: "other", label: "Other", types: ["other"] },
];

export function usePortalDocuments() {
  return useQuery({
    queryKey: ["portal", "documents"],
    queryFn: async (): Promise<PortalDocument[]> => {
      const { data, error } = await supabase
        .from("portal_documents")
        .select("id, order_id, product_id, doc_type, title, file_url, external_url, file_size_bytes, version, is_master, uploaded_at")
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PortalDocument[];
    },
  });
}