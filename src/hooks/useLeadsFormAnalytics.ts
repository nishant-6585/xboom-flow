import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays } from "date-fns";

export interface LeadRow {
  id: number;
  created_at: string;
  form_type: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: string | null;
  is_enquiry_converted: boolean | null;
  assigned_to_name: string | null;
  page_url: string | null;
}

/**
 * Website form submissions arrive in public.leads (Qforms plugin).
 * This hook returns the last 90 days of leads for use in the Forms
 * dashboard and analytics screens.
 */
export function useLeadsFormAnalytics(days = 90) {
  return useQuery({
    queryKey: ["forms-leads-analytics", days],
    queryFn: async () => {
      const since = subDays(new Date(), days).toISOString();
      const { data, error } = await supabase
        .from("leads" as any)
        .select(
          "id, created_at, form_type, name, email, phone, company, status, is_enquiry_converted, assigned_to_name, page_url"
        )
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data as unknown as LeadRow[]) ?? [];
    },
  });
}

/**
 * Convert a form.name (as stored in `forms`) into candidate form_type
 * slugs so we can map internal embeddable forms to their live inbound
 * submissions in `leads.form_type`.
 */
export function candidateFormTypes(name: string): string[] {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const overrides: Record<string, string[]> = {
    "contact-us": ["contact", "contact-us"],
    "drone-repair-request-form": ["drone-repair-intake", "drone-service-enquiry"],
    "drone-show-inquiry-form": ["drone-show-inquiry"],
    "bulk-order-enquiry-form": ["bulk-order", "enterprise-drones-brief", "inline-enterprise-drones-cta"],
    "resell-your-drone": ["resell", "buyback", "resell-your-drone"],
    "ready-for-rental": ["rental", "ready-for-rental"],
    "drone-pilot-training-enquiry": ["pilot-training", "drone-pilot-training"],
    "xboom-channel-partner-application-form": ["inline-channel-partner-application", "channel-partner"],
    "xboom-affiliate-creator-network-application-form": ["affiliate", "creator-network"],
    "xboom-careers-job-application-form": ["careers", "job-application"],
  };
  return overrides[slug] ?? [slug];
}

export function countLeadsForForm(
  formName: string,
  leads: LeadRow[],
): number {
  const cands = candidateFormTypes(formName);
  return leads.filter((l) => l.form_type && cands.includes(l.form_type)).length;
}