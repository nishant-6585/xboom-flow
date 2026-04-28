import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface MyLead {
  id: string;
  source: string;
  customer_name: string;
  product_name: string | null;
  company: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  created_at: string;
  has_followup: boolean;
  next_followup_at: string | null;
  followup_status: string | null;
  customer_type: string | null;
}

export function useMyLeads() {
  const { user, profile } = useAuth();

  return useQuery({
    queryKey: ["my-leads", user?.id, profile?.name],
    enabled: !!user?.id,
    queryFn: async (): Promise<MyLead[]> => {
      const userId = user!.id;
      const results: MyLead[] = [];

      // Fetch followups for this user to map later
      const { data: followups } = await supabase
        .from("followups")
        .select("source_id, source_type, followup_at, status")
        .eq("user_id", userId)
        .order("followup_at", { ascending: true });

      const followupMap = new Map<string, { followup_at: string; status: string }>();
      followups?.forEach((f: any) => {
        const key = `${f.source_type}:${f.source_id}`;
        const existing = followupMap.get(key);
        // Keep the nearest pending followup, or latest
        if (!existing || (f.status === "pending" && existing.status !== "pending")) {
          followupMap.set(key, { followup_at: f.followup_at, status: f.status });
        }
      });

      const addFollowup = (lead: MyLead, sourceType: string) => {
        const key = `${sourceType}:${lead.id}`;
        const fu = followupMap.get(key);
        if (fu) {
          lead.has_followup = true;
          lead.next_followup_at = fu.followup_at;
          lead.followup_status = fu.status;
        }
        return lead;
      };

      const fetches: Promise<void>[] = [];

      // Enquiries
      fetches.push(
        (async () => {
          let q = supabase
            .from("enquiries")
            .select("id, customer_name, product_name, customer_company, created_at, status, customer_state, customer_type")
            .order("created_at", { ascending: false })
            .limit(500);
          q = q.eq("sales_person_id", userId);
          const { data } = await q;
          data?.forEach((r: any) =>
            results.push(addFollowup({
              id: r.id,
              source: "Enquiry",
              customer_name: r.customer_name || "Unknown",
              product_name: r.product_name,
              company: r.customer_company,
              city: r.customer_state,
              email: null,
              phone: null,
              status: r.status,
              created_at: r.created_at,
              has_followup: false,
              next_followup_at: null,
              followup_status: null,
              customer_type: r.customer_type || null,
            }, "enquiry"))
          );
        })()
      );

      // MyOperator (call_logs)
      fetches.push(
        (async () => {
          let q = supabase
            .from("call_logs")
            .select("id, customer_name, product_name, company, created_at, call_status, city, caller_number, email, customer_type")
            .order("created_at", { ascending: false })
            .limit(500);
          q = q.eq("sales_person_id", userId);
          const { data } = await q;
          data?.forEach((r: any) =>
            results.push(addFollowup({
              id: r.id,
              source: "MyOperator",
              customer_name: r.customer_name || r.caller_number || "Unknown",
              product_name: r.product_name,
              company: r.company,
              city: r.city,
              email: r.email,
              phone: r.caller_number,
              status: r.call_status,
              created_at: r.created_at,
              has_followup: false,
              next_followup_at: null,
              followup_status: null,
              customer_type: r.customer_type || null,
            }, "call"))
          );
        })()
      );

      // Form Leads
      fetches.push(
        (async () => {
          let q = supabase
            .from("form_leads")
            .select("id, customer_name, product_name, company, created_at, status, city, email, customer_type")
            .order("created_at", { ascending: false })
            .limit(500);
          q = q.eq("sales_person_id", userId);
          const { data } = await q;
          data?.forEach((r: any) =>
            results.push(addFollowup({
              id: r.id,
              source: "Form",
              customer_name: r.customer_name || "Unknown",
              product_name: r.product_name,
              company: r.company,
              city: r.city,
              email: r.email,
              phone: null,
              status: r.status,
              created_at: r.created_at,
              has_followup: false,
              next_followup_at: null,
              followup_status: null,
              customer_type: r.customer_type || null,
            }, "form"))
          );
        })()
      );

      // Email Leads
      fetches.push(
        (async () => {
          let q = supabase
            .from("email_leads")
            .select("id, customer_name, product_name, customer_company, created_at, status, city, email, phone_number, customer_type")
            .order("created_at", { ascending: false })
            .limit(500);
          q = q.eq("sales_person_id", userId);
          const { data } = await q;
          data?.forEach((r: any) =>
            results.push(addFollowup({
              id: r.id,
              source: "Email",
              customer_name: r.customer_name || "Unknown",
              product_name: r.product_name,
              company: r.customer_company,
              city: r.city,
              email: r.email,
              phone: r.phone_number,
              status: r.status,
              created_at: r.created_at,
              has_followup: false,
              next_followup_at: null,
              followup_status: null,
              customer_type: r.customer_type || null,
            }, "email"))
          );
        })()
      );

      // Interakt Leads
      fetches.push(
        (async () => {
          let q = supabase
            .from("interakt_leads")
            .select("id, customer_name, product_name, company, created_at, status, city, email, phone_number, customer_type")
            .order("created_at", { ascending: false })
            .limit(500);
          q = q.eq("sales_person_id", userId);
          const { data } = await q;
          data?.forEach((r: any) =>
            results.push(addFollowup({
              id: r.id,
              source: "Interakt",
              customer_name: r.customer_name || "Unknown",
              product_name: r.product_name,
              company: r.company,
              city: r.city,
              email: r.email,
              phone: r.phone_number,
              status: r.status,
              created_at: r.created_at,
              has_followup: false,
              next_followup_at: null,
              followup_status: null,
              customer_type: r.customer_type || null,
            }, "interakt"))
          );
        })()
      );

      // Google Ads (enquiries with lead_source = 'google_ads') — re-tag existing
      fetches.push(
        (async () => {
          let q = supabase
            .from("enquiries")
            .select("id, customer_name, product_name, customer_company, created_at, status, customer_state, customer_type, email, phone")
            .eq("lead_source", "google_ads")
            .order("created_at", { ascending: false })
            .limit(500);
          q = q.eq("sales_person_id", userId);
          const { data } = await q;
          data?.forEach((r: any) => {
            const existingIdx = results.findIndex(l => l.id === r.id);
            if (existingIdx >= 0) {
              results[existingIdx].source = "Google Ads";
            } else {
              results.push(addFollowup({
                id: r.id,
                source: "Google Ads",
                customer_name: r.customer_name || "Unknown",
                product_name: r.product_name,
                company: r.customer_company,
                city: r.customer_state,
                email: r.email ?? null,
                phone: r.phone ?? null,
                status: r.status,
                created_at: r.created_at,
                has_followup: false,
                next_followup_at: null,
                followup_status: null,
                customer_type: r.customer_type || null,
              }, "enquiry"));
            }
          });
        })()
      );

      // Google Ads (dedicated google_ads_leads table)
      fetches.push(
        (async () => {
          const { data } = await supabase
            .from("google_ads_leads" as any)
            .select("id, customer_name, product_name, customer_company, customer_state, email, phone, status, created_at, customer_type, sales_person_id")
            .eq("sales_person_id", userId)
            .order("created_at", { ascending: false })
            .limit(500);
          data?.forEach((r: any) =>
            results.push(addFollowup({
              id: r.id,
              source: "Google Ads",
              customer_name: r.customer_name || "Unknown",
              product_name: r.product_name,
              company: r.customer_company,
              city: r.customer_state,
              email: r.email,
              phone: r.phone,
              status: r.status,
              created_at: r.created_at,
              has_followup: false,
              next_followup_at: null,
              followup_status: null,
              customer_type: r.customer_type || null,
            }, "google_ads"))
          );
        })()
      );

      // Q-Forms (leads table) — assigned_to mapping
      fetches.push(
        (async () => {
          const { data } = await supabase
            .from("leads" as any)
            .select("id, name, email, phone, company, location, subject, form_type, status, created_at, assigned_to")
            .eq("assigned_to", userId)
            .order("created_at", { ascending: false })
            .limit(500);
          data?.forEach((r: any) =>
            results.push(addFollowup({
              id: String(r.id),
              source: "Q-Form",
              customer_name: r.name || "Unknown",
              product_name: r.subject || r.form_type || null,
              company: r.company,
              city: r.location,
              email: r.email,
              phone: r.phone,
              status: r.status,
              created_at: r.created_at,
              has_followup: false,
              next_followup_at: null,
              followup_status: null,
              customer_type: null,
            }, "lead"))
          );
        })()
      );

      // Prospects (created_by mapping)
      fetches.push(
        (async () => {
          const { data } = await supabase
            .from("prospects" as any)
            .select("id, customer_name, phone_number, email, company, city, product_name, status, created_at, created_by")
            .eq("created_by", userId)
            .order("created_at", { ascending: false })
            .limit(500);
          data?.forEach((r: any) =>
            results.push(addFollowup({
              id: r.id,
              source: "Prospect",
              customer_name: r.customer_name || "Unknown",
              product_name: r.product_name,
              company: r.company,
              city: r.city,
              email: r.email,
              phone: r.phone_number,
              status: r.status,
              created_at: r.created_at,
              has_followup: false,
              next_followup_at: null,
              followup_status: null,
              customer_type: null,
            }, "prospect"))
          );
        })()
      );

      await Promise.all(fetches);
      results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return results;
    },
    staleTime: 5 * 60 * 1000,
  });
}
