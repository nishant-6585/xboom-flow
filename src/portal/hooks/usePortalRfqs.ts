import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePortalAuth } from "@/portal/hooks/usePortalAuth";

export interface PortalRfq {
  id: string;
  rfq_number: string;
  domains: string[];
  use_case: string;
  desired_date: string | null;
  budget_range: string | null;
  daas_interest: string | null;
  status: "open" | "in_quote" | "converted" | "closed";
  attachments: { name: string; path: string; size?: number }[];
  created_at: string;
  converted_to_order_id: string | null;
}

export const RFQ_DOMAINS = [
  "Survey & mapping",
  "Agriculture",
  "Inspection",
  "Public safety",
  "Defence",
  "Logistics",
  "Training",
  "Other",
];

export const RFQ_BUDGET_RANGES = [
  "Under ₹5L",
  "₹5L – ₹15L",
  "₹15L – ₹50L",
  "₹50L – ₹1Cr",
  "₹1Cr+",
  "Not sure",
];

export const RFQ_DAAS_OPTIONS = [
  { value: "buy_only", label: "Buy only" },
  { value: "open", label: "Open to either" },
  { value: "daas_preferred", label: "DaaS preferred" },
];

export function usePortalRfqs() {
  return useQuery({
    queryKey: ["portal", "rfqs"],
    queryFn: async (): Promise<PortalRfq[]> => {
      const { data, error } = await supabase
        .from("portal_rfqs")
        .select("id, rfq_number, domains, use_case, desired_date, budget_range, daas_interest, status, attachments, created_at, converted_to_order_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown) as PortalRfq[];
    },
  });
}

export interface NewRfqInput {
  domains: string[];
  use_case: string;
  desired_date: string | null;
  budget_range: string | null;
  daas_interest: string | null;
  attachments: { name: string; path: string; size?: number }[];
}

export function useCreateRfq() {
  const qc = useQueryClient();
  const { account, contact } = usePortalAuth();
  return useMutation({
    mutationFn: async (input: NewRfqInput) => {
      if (!account?.id) throw new Error("Account not loaded");
      const { data, error } = await supabase
        .from("portal_rfqs")
        .insert({
          account_id: account.id,
          submitted_by_contact_id: contact?.id ?? null,
          domains: input.domains,
          use_case: input.use_case,
          desired_date: input.desired_date,
          budget_range: input.budget_range,
          daas_interest: input.daas_interest,
          attachments: input.attachments,
        } as never)
        .select("id, rfq_number")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portal", "rfqs"] }),
  });
}