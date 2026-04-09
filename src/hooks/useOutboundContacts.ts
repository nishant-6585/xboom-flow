import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface OutboundContact {
  id: string;
  region: string | null;
  city: string | null;
  company_name: string | null;
  contact_name: string;
  designation: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  address: string | null;
  website: string | null;
  status: string;
  notes: string | null;
  source: string | null;
  source_type: string | null;
  source_sheet: string | null;
  is_prospect: boolean;
  needs_attention: boolean;
  attention_reason: string | null;
  attention_marked_by: string | null;
  attention_marked_at: string | null;
  uploaded_by: string | null;
  uploaded_by_id: string | null;
  duplicate_count: number;
  created_at: string;
  updated_at: string;
}

export interface UploadLog {
  id: string;
  file_name: string;
  total_rows: number;
  new_records: number;
  updated_records: number;
  failed_rows: number;
  failed_details: any;
  uploaded_by: string;
  uploaded_by_id: string;
  created_at: string;
}

export interface ReviewItem {
  id: string;
  contact_data: any;
  conflict_type: string;
  matched_contact_id: string | null;
  resolution: string;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface ParsedRow {
  region?: string;
  city?: string;
  company_name?: string;
  contact_name: string;
  designation?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  address?: string;
  website?: string;
  notes?: string;
  source?: string;
  source_type?: string;
  source_sheet?: string;
}

export interface ImportResult {
  total: number;
  created: number;
  updated: number;
  failed: number;
  reviewed: number;
  failedDetails: { row: number; reason: string }[];
  sheetStats: { sheet: string; rows: number; created: number; updated: number }[];
}

export function useOutboundContacts() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  const contacts = useQuery({
    queryKey: ['outbound-contacts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('outbound_contacts')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as OutboundContact[];
    },
    enabled: !!user,
  });

  const uploadLogs = useQuery({
    queryKey: ['outbound-upload-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('outbound_upload_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as UploadLog[];
    },
    enabled: !!user,
  });

  const reviewQueue = useQuery({
    queryKey: ['outbound-review-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('outbound_review_queue')
        .select('*')
        .eq('resolution', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ReviewItem[];
    },
    enabled: !!user,
  });

  const importContacts = useMutation({
    mutationFn: async (rows: ParsedRow[]): Promise<ImportResult> => {
      const result: ImportResult = {
        total: rows.length, created: 0, updated: 0, failed: 0, reviewed: 0,
        failedDetails: [], sheetStats: [],
      };

      // Track per-sheet stats
      const sheetMap = new Map<string, { rows: number; created: number; updated: number }>();

      const { data: existing } = await supabase.from('outbound_contacts').select('*');
      const existingContacts = (existing || []) as OutboundContact[];

      const emailMap = new Map<string, OutboundContact>();
      const phoneMap = new Map<string, OutboundContact>();
      const nameCompanyMap = new Map<string, OutboundContact>();

      for (const c of existingContacts) {
        if (c.email) emailMap.set(c.email.toLowerCase().trim(), c);
        if (c.phone) phoneMap.set(c.phone.replace(/\D/g, ''), c);
        if (c.contact_name && c.company_name) {
          nameCompanyMap.set(`${c.contact_name.toLowerCase().trim()}|${c.company_name.toLowerCase().trim()}`, c);
        }
      }

      const userName = profile?.full_name || user?.email || 'Unknown';

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const sheet = row.source_sheet || 'Sheet1';
        if (!sheetMap.has(sheet)) sheetMap.set(sheet, { rows: 0, created: 0, updated: 0 });
        sheetMap.get(sheet)!.rows++;

        if (!row.contact_name || row.contact_name.trim() === '') {
          result.failed++;
          result.failedDetails.push({ row: i + 1, reason: 'Missing contact name' });
          continue;
        }

        try {
          const normalizedEmail = row.email?.toLowerCase().trim() || '';
          const normalizedPhone = row.phone?.replace(/\D/g, '') || '';
          const nameKey = row.contact_name && row.company_name
            ? `${row.contact_name.toLowerCase().trim()}|${row.company_name.toLowerCase().trim()}`
            : '';

          let match: OutboundContact | undefined;

          if (normalizedEmail && emailMap.has(normalizedEmail)) {
            match = emailMap.get(normalizedEmail);
          } else if (normalizedPhone && phoneMap.has(normalizedPhone)) {
            const phoneMatch = phoneMap.get(normalizedPhone)!;
            if (normalizedEmail && phoneMatch.email && phoneMatch.email.toLowerCase().trim() !== normalizedEmail) {
              await supabase.from('outbound_review_queue').insert({
                contact_data: row as any,
                conflict_type: 'phone_match_email_mismatch',
                matched_contact_id: phoneMatch.id,
              });
              result.reviewed++;
              continue;
            }
            match = phoneMatch;
          } else if (nameKey && nameCompanyMap.has(nameKey)) {
            match = nameCompanyMap.get(nameKey);
          }

          if (match) {
            const updates: Record<string, any> = {};
            const fillIfEmpty = (field: keyof OutboundContact, value: string | undefined) => {
              if (value && value.trim() && (!match![field] || (match![field] as string).trim() === '')) {
                updates[field] = value.trim();
              }
            };
            const updateIfChanged = (field: keyof OutboundContact, value: string | undefined) => {
              if (value && value.trim() && match![field] !== value.trim()) {
                updates[field] = value.trim();
              }
            };

            fillIfEmpty('region', row.region);
            fillIfEmpty('city', row.city);
            fillIfEmpty('linkedin_url', row.linkedin_url);
            fillIfEmpty('address', row.address);
            fillIfEmpty('website', row.website);
            fillIfEmpty('phone', row.phone);
            fillIfEmpty('email', row.email);
            updateIfChanged('designation', row.designation);
            updateIfChanged('company_name', row.company_name);

            // Merge source_type across sources
            if (row.source_type && match.source_type && row.source_type !== match.source_type) {
              updates.source_type = 'multi';
            } else if (row.source_type && !match.source_type) {
              updates.source_type = row.source_type;
            }

            const dateStr = new Date().toLocaleDateString();
            const appendNote = `Updated via Excel upload on ${dateStr}`;
            updates.notes = match.notes ? `${match.notes}\n${appendNote}` : appendNote;
            updates.duplicate_count = (match.duplicate_count || 0) + 1;

            await supabase.from('outbound_contacts').update(updates).eq('id', match.id);
            result.updated++;
            sheetMap.get(sheet)!.updated++;

            const updatedContact = { ...match, ...updates };
            if (updatedContact.email) emailMap.set(updatedContact.email.toLowerCase().trim(), updatedContact as OutboundContact);
          } else {
            const { error } = await supabase.from('outbound_contacts').insert({
              region: row.region || null,
              city: row.city || null,
              company_name: row.company_name || null,
              contact_name: row.contact_name.trim(),
              designation: row.designation || null,
              email: normalizedEmail || null,
              phone: row.phone || null,
              linkedin_url: row.linkedin_url || null,
              address: row.address || null,
              website: row.website || null,
              notes: row.notes || null,
              source: row.source || 'excel_upload',
              source_type: row.source_type || 'hospitality',
              source_sheet: row.source_sheet || null,
              uploaded_by: userName,
              uploaded_by_id: user?.id,
            });

            if (error) {
              if (error.code === '23505') {
                result.updated++;
                sheetMap.get(sheet)!.updated++;
              } else {
                result.failed++;
                result.failedDetails.push({ row: i + 1, reason: error.message });
              }
            } else {
              result.created++;
              sheetMap.get(sheet)!.created++;
            }
          }
        } catch (err: any) {
          result.failed++;
          result.failedDetails.push({ row: i + 1, reason: err.message || 'Unknown error' });
        }
      }

      result.sheetStats = Array.from(sheetMap.entries()).map(([sheet, s]) => ({ sheet, ...s }));
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['outbound-contacts'] });
      queryClient.invalidateQueries({ queryKey: ['outbound-upload-logs'] });
      queryClient.invalidateQueries({ queryKey: ['outbound-review-queue'] });
      toast.success(`Import complete: ${result.created} new, ${result.updated} updated, ${result.failed} failed`);
    },
    onError: (err) => {
      toast.error('Import failed: ' + (err as Error).message);
    },
  });

  const logUpload = useMutation({
    mutationFn: async (log: Omit<UploadLog, 'id' | 'created_at'>) => {
      const { error } = await supabase.from('outbound_upload_logs').insert(log);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['outbound-upload-logs'] }),
  });

  const resolveReview = useMutation({
    mutationFn: async ({ id, resolution }: { id: string; resolution: string }) => {
      const { error } = await supabase.from('outbound_review_queue').update({
        resolution,
        resolved_by: profile?.full_name || user?.email,
        resolved_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outbound-review-queue'] });
      toast.success('Review item resolved');
    },
  });

  const toggleProspect = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase.from('outbound_contacts')
        .update({ is_prospect: value })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outbound-contacts'] });
      toast.success('Prospect status updated');
    },
  });

  const markAttention = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.from('outbound_contacts')
        .update({
          needs_attention: true,
          attention_reason: reason,
          attention_marked_by: profile?.full_name || user?.email,
          attention_marked_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outbound-contacts'] });
      toast.success('Marked for attention');
    },
  });

  const resolveAttention = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('outbound_contacts')
        .update({ needs_attention: false, attention_reason: null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outbound-contacts'] });
      toast.success('Attention resolved');
    },
  });

  return {
    contacts: contacts.data || [],
    isLoadingContacts: contacts.isLoading,
    uploadLogs: uploadLogs.data || [],
    reviewQueue: reviewQueue.data || [],
    importContacts,
    logUpload,
    resolveReview,
    toggleProspect,
    markAttention,
    resolveAttention,
  };
}
