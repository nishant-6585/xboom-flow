import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { normalizeCompanyName, isValidCompanyName, pickDisplayName } from '@/lib/companyNormalize';
import { useQueryClient } from '@tanstack/react-query';

export interface PushLeadInput {
  company?: string | null;
  customer_name?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  source_label?: string;
}

export interface PushResult {
  ok: boolean;
  companyId?: string;
  created?: boolean;
  contactCreated?: boolean;
  message?: string;
}

export function usePushToCompany() {
  const { user, userName } = useAuth();
  const qc = useQueryClient();

  const pushLeadToCompany = async (lead: PushLeadInput): Promise<PushResult> => {
    if (!user) return { ok: false, message: 'Not signed in' };
    if (!isValidCompanyName(lead.company)) {
      return { ok: false, message: 'Lead has no usable company name' };
    }

    const norm = normalizeCompanyName(lead.company);
    const display = pickDisplayName(lead.company!);

    // Look for existing company via fuzzy match (load names + ids)
    const { data: existing, error: fetchErr } = await supabase
      .from('companies')
      .select('id, name, phone, email, city, state');
    if (fetchErr) return { ok: false, message: fetchErr.message };

    const match = (existing || []).find((c: any) => normalizeCompanyName(c.name) === norm);

    let companyId: string;
    let created = false;

    if (match) {
      companyId = match.id;
      // Patch missing fields with the new lead data (latest wins)
      const patch: Record<string, any> = {};
      if (!match.phone && lead.phone) patch.phone = lead.phone;
      if (!match.email && lead.email) patch.email = lead.email;
      if (!match.city && lead.city) patch.city = lead.city;
      if (!match.state && lead.state) patch.state = lead.state;
      if (Object.keys(patch).length) {
        await supabase.from('companies').update(patch).eq('id', companyId);
      }
    } else {
      const { data: ins, error: insErr } = await supabase
        .from('companies')
        .insert([{
          name: display,
          phone: lead.phone || null,
          email: lead.email || null,
          city: lead.city || null,
          state: lead.state || null,
          status: 'lead',
          created_by: user.id,
          created_by_name: userName || '',
        } as any])
        .select('id')
        .single();
      if (insErr || !ins) return { ok: false, message: insErr?.message || 'Insert failed' };
      companyId = ins.id;
      created = true;
    }

    // Add / upsert contact (latest wins for primary)
    let contactCreated = false;
    const personName = (lead.customer_name || '').trim();
    if (personName || lead.phone || lead.email) {
      const { data: existingContacts } = await supabase
        .from('company_contacts')
        .select('id, name, phone, email, is_primary')
        .eq('company_id', companyId);

      const dup = (existingContacts || []).find((c: any) =>
        (personName && c.name && c.name.toLowerCase().trim() === personName.toLowerCase().trim()) ||
        (lead.phone && c.phone && c.phone.replace(/\D/g, '') === lead.phone.replace(/\D/g, '')) ||
        (lead.email && c.email && c.email.toLowerCase() === lead.email.toLowerCase())
      );

      if (dup) {
        // Update missing fields and mark as primary (latest wins)
        const patch: Record<string, any> = { is_primary: true };
        if (!dup.phone && lead.phone) patch.phone = lead.phone;
        if (!dup.email && lead.email) patch.email = lead.email;
        if (!dup.name && personName) patch.name = personName;
        // demote other primaries
        await supabase.from('company_contacts').update({ is_primary: false }).eq('company_id', companyId);
        await supabase.from('company_contacts').update(patch).eq('id', dup.id);
      } else {
        // demote existing primaries, then insert as primary
        await supabase.from('company_contacts').update({ is_primary: false }).eq('company_id', companyId);
        const { error: cErr } = await supabase.from('company_contacts').insert([{
          company_id: companyId,
          name: personName || lead.phone || lead.email || 'Unknown',
          phone: lead.phone || null,
          email: lead.email || null,
          is_primary: true,
          notes: lead.source_label ? `From ${lead.source_label}` : null,
        } as any]);
        if (!cErr) contactCreated = true;
      }
    }

    qc.invalidateQueries({ queryKey: ['companies'] });
    qc.invalidateQueries({ queryKey: ['company-contacts', companyId] });
    return { ok: true, companyId, created, contactCreated };
  };

  /**
   * Bulk backfill: scans all lead-source tables, creates companies + contacts
   * for every lead whose company name is valid. Uses fuzzy matching so
   * "XBoom Pvt Ltd" and "Xboom" merge.
   * Returns counts.
   */
  const syncAllLeadsToCompanies = async (): Promise<{ companiesCreated: number; companiesUpdated: number; contactsCreated: number; scanned: number }> => {
    if (!user) throw new Error('Not signed in');

    type Row = { company?: string | null; name?: string | null; phone?: string | null; email?: string | null; city?: string | null; state?: string | null; created_at?: string; source: string };

    const all: Row[] = [];
    const push = (rows: any[] | null, map: (r: any) => Row) => rows?.forEach(r => all.push(map(r)));

    const [enq, calls, inter, mail, gads, forms] = await Promise.all([
      supabase.from('enquiries').select('customer_name, customer_company, customer_state, created_at').not('customer_company', 'is', null).order('created_at', { ascending: false }).limit(5000),
      supabase.from('call_logs').select('customer_name, company, customer_company, caller_number, email, city, created_at').or('company.not.is.null,customer_company.not.is.null').order('created_at', { ascending: false }).limit(5000),
      supabase.from('interakt_leads').select('customer_name, company, customer_company, phone_number, email, city, created_at').or('company.not.is.null,customer_company.not.is.null').order('created_at', { ascending: false }).limit(5000),
      supabase.from('email_leads').select('customer_name, customer_company, phone_number, email, city, created_at').not('customer_company', 'is', null).order('created_at', { ascending: false }).limit(5000),
      supabase.from('google_ads_leads').select('customer_name, customer_company, phone, email, city, customer_state, created_at').not('customer_company', 'is', null).order('created_at', { ascending: false }).limit(5000),
      supabase.from('form_leads').select('customer_name, company, phone, email, city, created_at').not('company', 'is', null).order('created_at', { ascending: false }).limit(5000),
    ]);

    push(enq.data, (r) => ({ source: 'Enquiry', name: r.customer_name, company: r.customer_company, state: r.customer_state, created_at: r.created_at }));
    push(calls.data, (r) => ({ source: 'MyOperator', name: r.customer_name, company: r.customer_company || r.company, phone: r.caller_number, email: r.email, city: r.city, created_at: r.created_at }));
    push(inter.data, (r) => ({ source: 'Interakt', name: r.customer_name, company: r.customer_company || r.company, phone: r.phone_number, email: r.email, city: r.city, created_at: r.created_at }));
    push(mail.data, (r) => ({ source: 'Email', name: r.customer_name, company: r.customer_company, phone: r.phone_number, email: r.email, city: r.city, created_at: r.created_at }));
    push(gads.data, (r) => ({ source: 'Google Ads', name: r.customer_name, company: r.customer_company, phone: r.phone, email: r.email, city: r.city, state: r.customer_state, created_at: r.created_at }));
    push(forms.data, (r) => ({ source: 'Form / QForm', name: r.customer_name, company: r.company, phone: r.phone, email: r.email, city: r.city, created_at: r.created_at }));

    // Group by normalised company key. Latest lead wins (rows already sorted desc).
    const groups = new Map<string, { display: string; rows: Row[] }>();
    for (const r of all) {
      if (!isValidCompanyName(r.company)) continue;
      const key = normalizeCompanyName(r.company);
      const g = groups.get(key);
      if (g) g.rows.push(r);
      else groups.set(key, { display: pickDisplayName(r.company!), rows: [r] });
    }

    // Pull existing companies once
    const { data: existing } = await supabase.from('companies').select('id, name, phone, email, city, state');
    const existingByKey = new Map<string, any>();
    (existing || []).forEach((c: any) => existingByKey.set(normalizeCompanyName(c.name), c));

    let companiesCreated = 0;
    let companiesUpdated = 0;
    let contactsCreated = 0;

    for (const [key, { display, rows }] of groups) {
      // Latest first
      const latest = rows[0];

      let companyId: string;
      const existingMatch = existingByKey.get(key);
      if (existingMatch) {
        companyId = existingMatch.id;
        const patch: Record<string, any> = {};
        if (!existingMatch.phone && latest.phone) patch.phone = latest.phone;
        if (!existingMatch.email && latest.email) patch.email = latest.email;
        if (!existingMatch.city && latest.city) patch.city = latest.city;
        if (!existingMatch.state && latest.state) patch.state = latest.state;
        if (Object.keys(patch).length) {
          await supabase.from('companies').update(patch).eq('id', companyId);
          companiesUpdated += 1;
        }
      } else {
        const { data: ins } = await supabase.from('companies').insert([{
          name: display,
          phone: latest.phone || null,
          email: latest.email || null,
          city: latest.city || null,
          state: latest.state || null,
          status: 'lead',
          created_by: user.id,
          created_by_name: userName || '',
        } as any]).select('id').single();
        if (!ins) continue;
        companyId = ins.id;
        companiesCreated += 1;
      }

      // Build deduped contact list (by phone-digits OR email OR name)
      const seen = new Set<string>();
      const contactsToAdd: { name: string; phone: string | null; email: string | null; is_primary: boolean; notes: string | null }[] = [];
      for (let i = 0; i < rows.length; i += 1) {
        const r = rows[i];
        const idKey = (r.phone?.replace(/\D/g, '') || r.email?.toLowerCase() || r.name?.toLowerCase() || '').trim();
        if (!idKey) continue;
        if (seen.has(idKey)) continue;
        seen.add(idKey);
        contactsToAdd.push({
          name: (r.name || r.phone || r.email || 'Unknown').trim(),
          phone: r.phone || null,
          email: r.email || null,
          is_primary: i === 0, // latest is primary
          notes: `From ${r.source}`,
        });
        if (contactsToAdd.length >= 5) break; // cap
      }

      if (contactsToAdd.length) {
        // skip contacts that already exist
        const { data: existingContacts } = await supabase
          .from('company_contacts').select('name, phone, email').eq('company_id', companyId);
        const exNorm = (existingContacts || []).map((c: any) => ({
          name: (c.name || '').toLowerCase().trim(),
          phone: (c.phone || '').replace(/\D/g, ''),
          email: (c.email || '').toLowerCase(),
        }));
        const fresh = contactsToAdd.filter(c => !exNorm.some(e =>
          (c.phone && e.phone && c.phone.replace(/\D/g, '') === e.phone) ||
          (c.email && e.email && c.email.toLowerCase() === e.email) ||
          (c.name && e.name && c.name.toLowerCase() === e.name)
        ));
        if (fresh.length) {
          // demote existing primaries if we're adding a new primary
          if (fresh.some(c => c.is_primary)) {
            await supabase.from('company_contacts').update({ is_primary: false }).eq('company_id', companyId);
          }
          const { error: cErr } = await supabase.from('company_contacts').insert(
            fresh.map(c => ({ ...c, company_id: companyId })) as any
          );
          if (!cErr) contactsCreated += fresh.length;
        }
      }
    }

    qc.invalidateQueries({ queryKey: ['companies'] });
    return { companiesCreated, companiesUpdated, contactsCreated, scanned: all.length };
  };

  return { pushLeadToCompany, syncAllLeadsToCompanies };
}

export async function pushLeadToCompanyToast(fn: () => Promise<PushResult>) {
  const r = await fn();
  if (!r.ok) toast.error(r.message || 'Could not push to Companies');
  else if (r.created) toast.success('New company added to Companies tab');
  else toast.success('Linked to existing company');
  return r;
}
