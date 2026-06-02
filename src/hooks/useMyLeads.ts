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
  assigned_user_id: string | null;
}

const PER_SOURCE_LIMIT = 1000;

export function useMyLeads() {
  const { user, profile } = useAuth();
  // My Leads always shows only leads assigned to the current user, regardless of role.
  const seeAll = false;

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

      // Helper to apply user-scope filter unless seeAll
      const scope = (q: any, col = "sales_person_id") => (seeAll ? q : q.eq(col, userId));

      const fetches: Promise<void>[] = [];

      // Enquiries — derive a friendly source label from `lead_source`
      // so structured channels (ElevenLabs / Gmail / IndiaMART etc.) don't
      // all collapse into the generic "Enquiry" bucket.
      const ENQUIRY_SOURCE_LABELS: Record<string, string> = {
        google_ads: "Google Ads",
        elevenlabs: "ElevenLabs",
        gmail: "Email",
        email: "Email",
        interakt: "Interakt",
        myoperator: "MyOperator",
        indiamart: "IndiaMART",
        referral: "Referral",
        exhibition: "Exhibition",
        website_form: "Form",
      };
      const labelEnquirySource = (raw: string | null | undefined): string => {
        if (!raw) return "Enquiry";
        return ENQUIRY_SOURCE_LABELS[raw.toLowerCase()] ?? "Enquiry";
      };

      fetches.push((async () => {
        let q: any = supabase
          .from("enquiries")
          .select("id, customer_name, product_name, customer_company, created_at, status, customer_state, customer_type, lead_source, sales_person_id")
          .order("created_at", { ascending: false })
          .limit(PER_SOURCE_LIMIT);
        q = scope(q);
        const { data } = await q;
        data?.forEach((r: any) =>
          results.push(addFollowup({
            id: r.id,
            source: labelEnquirySource(r.lead_source),
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
            assigned_user_id: r.sales_person_id ?? null,
          }, "enquiry"))
        );
      })());

      // call_logs — actual channel comes from `lead_source`
      // (ElevenLabs / Exotel / MyOperator). Defaulting every row to
      // "MyOperator" hid ElevenLabs leads from the source filter.
      const CALL_LOG_SOURCE_LABELS: Record<string, string> = {
        elevenlabs: "ElevenLabs",
        exotel: "MyOperator", // Exotel is the carrier behind MyOperator
        myoperator: "MyOperator",
      };
      fetches.push((async () => {
        let q: any = supabase
          .from("call_logs")
          .select("id, customer_name, product_name, company, created_at, call_status, city, caller_number, email, customer_type, sales_person_id, lead_source")
          .order("created_at", { ascending: false })
          .limit(PER_SOURCE_LIMIT);
        // Scope by either sales_person_id OR assigned_to so a rep sees both
        // leads they own AND leads currently routed to them via re-assignment.
        if (!seeAll) {
          q = q.or(`sales_person_id.eq.${userId},assigned_to.eq.${userId}`);
        }
        const { data } = await q;
        data?.forEach((r: any) =>
          results.push(addFollowup({
            id: r.id,
            source:
              CALL_LOG_SOURCE_LABELS[String(r.lead_source ?? "").toLowerCase()] ??
              "MyOperator",
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
            assigned_user_id: r.sales_person_id ?? null,
          }, "call"))
        );
      })());

      // Form Leads
      fetches.push((async () => {
        let q: any = supabase
          .from("form_leads")
          .select("id, customer_name, product_name, company, created_at, status, city, email, customer_type, phone, sales_person_id")
          .order("created_at", { ascending: false })
          .limit(PER_SOURCE_LIMIT);
        q = scope(q);
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
            phone: (r as any).phone ?? null,
            status: r.status,
            created_at: r.created_at,
            has_followup: false,
            next_followup_at: null,
            followup_status: null,
            customer_type: r.customer_type || null,
            assigned_user_id: r.sales_person_id ?? null,
          }, "form"))
        );
      })());

      // Email Leads
      fetches.push((async () => {
        let q: any = supabase
          .from("email_leads")
          .select("id, customer_name, product_name, customer_company, created_at, status, city, email, phone_number, customer_type, sales_person_id")
          .order("created_at", { ascending: false })
          .limit(PER_SOURCE_LIMIT);
        q = scope(q);
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
            assigned_user_id: r.sales_person_id ?? null,
          }, "email"))
        );
      })());

      // Interakt Leads
      fetches.push((async () => {
        let q: any = supabase
          .from("interakt_leads")
          .select("id, customer_name, product_name, company, created_at, status, city, email, phone_number, customer_type, sales_person_id")
          .order("created_at", { ascending: false })
          .limit(PER_SOURCE_LIMIT);
        q = scope(q);
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
            assigned_user_id: r.sales_person_id ?? null,
          }, "interakt"))
        );
      })());

      // Google Ads (dedicated google_ads_leads table)
      fetches.push((async () => {
        let q: any = supabase
          .from("google_ads_leads" as any)
          .select("id, customer_name, product_name, customer_company, customer_state, email, phone, status, created_at, sales_person_id")
          .order("created_at", { ascending: false })
          .limit(PER_SOURCE_LIMIT);
        q = scope(q);
        const { data } = await q;
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
            customer_type: null,
            assigned_user_id: r.sales_person_id ?? null,
          }, "google_ads"))
        );
      })());

      // Q-Forms (leads table) — uses assigned_to
      fetches.push((async () => {
        let q: any = supabase
          .from("leads" as any)
          .select("id, name, email, phone, company, location, subject, form_type, status, created_at, assigned_to")
          .order("created_at", { ascending: false })
          .limit(PER_SOURCE_LIMIT);
        q = scope(q, "assigned_to");
        const { data } = await q;
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
            assigned_user_id: r.assigned_to ?? null,
          }, "lead"))
        );
      })());

      // Prospects (created_by mapping)
      fetches.push((async () => {
        let q: any = supabase
          .from("prospects" as any)
          .select("id, customer_name, phone_number, email, company, city, product_name, status, created_at, created_by")
          .order("created_at", { ascending: false })
          .limit(PER_SOURCE_LIMIT);
        q = scope(q, "created_by");
        const { data } = await q;
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
            assigned_user_id: r.created_by ?? null,
          }, "prospect"))
        );
      })());

      await Promise.all(fetches);
      results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return results;
    },
    staleTime: 5 * 60 * 1000,
  });
}
