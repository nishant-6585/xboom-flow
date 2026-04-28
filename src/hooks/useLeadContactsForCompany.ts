import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LeadContactOption {
  key: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  city?: string | null;
  source: string;
}

const dedupe = (rows: LeadContactOption[]) => {
  const map = new Map<string, LeadContactOption>();
  for (const r of rows) {
    if (!r.name) continue;
    const k = `${(r.name || '').toLowerCase().trim()}|${(r.phone || '').trim()}|${(r.email || '').toLowerCase().trim()}`;
    if (!map.has(k)) map.set(k, r);
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
};

export function useLeadContactsForCompany() {
  return useQuery({
    queryKey: ['lead-contacts-for-company'],
    staleTime: 60_000,
    queryFn: async () => {
      const out: LeadContactOption[] = [];

      const [enq, intk, email, gads, forms, calls] = await Promise.all([
        supabase.from('enquiries').select('id, customer_name, phone_number, email, customer_company, city').limit(2000),
        supabase.from('interakt_leads').select('id, name, phone_number, email, company_name, city').limit(2000),
        supabase.from('email_leads').select('id, sender_name, sender_email, company_name').limit(2000),
        supabase.from('google_ads_leads').select('id, customer_name, phone, email, company_name').limit(2000),
        supabase.from('form_leads').select('id, customer_name, phone, email, company').limit(2000),
        supabase.from('call_logs').select('id, caller_name, caller_number').limit(2000),
      ]);

      (enq.data || []).forEach((r: any) => out.push({
        key: `enq-${r.id}`, name: r.customer_name, phone: r.phone_number, email: r.email,
        company: r.customer_company, city: r.city, source: 'Enquiry',
      }));
      (intk.data || []).forEach((r: any) => out.push({
        key: `intk-${r.id}`, name: r.name, phone: r.phone_number, email: r.email,
        company: r.company_name, city: r.city, source: 'Interakt',
      }));
      (email.data || []).forEach((r: any) => out.push({
        key: `email-${r.id}`, name: r.sender_name, email: r.sender_email,
        company: r.company_name, source: 'Email',
      }));
      (gads.data || []).forEach((r: any) => out.push({
        key: `gads-${r.id}`, name: r.customer_name, phone: r.phone, email: r.email,
        company: r.company_name, source: 'Google Ads',
      }));
      (forms.data || []).forEach((r: any) => out.push({
        key: `frm-${r.id}`, name: r.customer_name, phone: r.phone, email: r.email,
        company: r.company, source: 'Form',
      }));
      (calls.data || []).forEach((r: any) => out.push({
        key: `call-${r.id}`, name: r.caller_name, phone: r.caller_number,
        source: 'Call',
      }));

      return dedupe(out.filter(r => !!r.name));
    },
  });
}

export const INDUSTRY_OPTIONS = [
  'Agriculture',
  'Automotive',
  'Aviation & Aerospace',
  'Construction',
  'Consulting',
  'Defence & Security',
  'Drone Services',
  'E-commerce',
  'Education & Training',
  'Energy & Utilities',
  'Engineering',
  'Events & Media',
  'Film & Entertainment',
  'Finance & Banking',
  'Government / PSU',
  'Healthcare',
  'Hospitality',
  'Industrial / Manufacturing',
  'Infrastructure',
  'Insurance',
  'IT & Software',
  'Logistics & Supply Chain',
  'Mining',
  'NGO / Non-Profit',
  'Oil & Gas',
  'Pharmaceutical',
  'Photography & Videography',
  'Public Safety / Police',
  'Real Estate',
  'Research & Academia',
  'Retail',
  'Robotics',
  'Solar & Renewable Energy',
  'Surveying & Mapping',
  'Telecommunications',
  'Textiles',
  'Tourism',
  'Transportation',
  'Warehousing',
  'Other',
];