// Evidence picker for salesperson-attribution (request + direct-assign dialogs).
//
// Strong proof first: auto-searches the synced call_logs for calls matching the
// order's customer phone (last-10-digit match) so the claim is self-verifying —
// the approver sees the number matches and whether the call pre-dates the order.
// Fallback: upload a document (WhatsApp export, email PDF, quote screenshot…)
// to the private attribution-evidence bucket.

import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Loader2, Phone, Paperclip, X, FileText, AlertCircle, UserSearch } from 'lucide-react';
import {
  AttributionEvidence,
  CallLogEvidence,
  FileEvidence,
  LeadEvidence,
  EVIDENCE_BUCKET,
  last10Digits,
  isBeforeOrder,
  formatCallDuration,
} from './attributionEvidence';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'text/plain',
];
const ACCEPT_ATTR = 'image/*,application/pdf,.pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';

interface CallLogRow {
  id: string;
  caller_number: string;
  call_duration: number | null;
  call_type: string | null;
  call_status: string;
  recording_url: string | null;
  created_at: string;
  lead_source: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  sales_person_id: string | null;
  sales_person_name: string | null;
}

interface LeadMatchRow {
  lead_table: 'leads' | 'email_leads';
  id: string;
  matched_on: 'email' | 'phone';
  created_at: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
  source: string | null;
}

export function AttributionEvidencePicker({
  orderId,
  value,
  onChange,
  salesPersonId,
}: {
  orderId: string;
  value: AttributionEvidence[];
  onChange: (v: AttributionEvidence[]) => void;
  /** The rep the order would be credited to — leads assigned to them get the
   *  green "assigned to this rep" badge. Request flows pass the requester;
   *  the admin Assign dialog passes the selected salesperson. */
  salesPersonId?: string | null;
}) {
  const { user } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Order phone + date — drives the call-log match and the before/after badge.
  const { data: order } = useQuery({
    queryKey: ['attribution-evidence-order', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, customer_phone, customer_email, customer_name, created_at, order_date')
        .eq('id', orderId)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        customer_phone: string | null;
        customer_email: string | null;
        customer_name: string | null;
        created_at: string;
        order_date: string | null;
      } | null;
    },
  });

  const orderAt = order?.order_date || order?.created_at || null;
  const phoneKey = last10Digits(order?.customer_phone);
  const emailKey = (order?.customer_email || '').trim().toLowerCase() || null;

  // Calls to/from the customer's number — the self-verifying proof source.
  const { data: calls, isLoading: loadingCalls } = useQuery({
    queryKey: ['attribution-evidence-calls', orderId, phoneKey],
    enabled: !!phoneKey,
    queryFn: async (): Promise<CallLogRow[]> => {
      const { data, error } = await supabase
        .from('call_logs')
        .select('id, caller_number, call_duration, call_type, call_status, recording_url, created_at')
        .like('caller_number', `%${phoneKey}`)
        .order('created_at', { ascending: false })
        .limit(25);
      if (error) throw error;
      return (data ?? []) as CallLogRow[];
    },
  });

  // Leads matching the customer's email or phone — a lead logged for this
  // customer BEFORE the order, assigned to the same rep, is near-conclusive
  // (system-timestamped, can't be backdated).
  const { data: leads, isLoading: loadingLeads } = useQuery({
    queryKey: ['attribution-evidence-leads', orderId, emailKey, phoneKey],
    enabled: !!(emailKey || phoneKey),
    queryFn: async (): Promise<LeadMatchRow[]> => {
      const out: LeadMatchRow[] = [];

      const leadOr = [
        emailKey ? `email.ilike.${emailKey}` : null,
        phoneKey ? `phone.like.%${phoneKey}` : null,
      ].filter(Boolean).join(',');
      if (leadOr) {
        const { data } = await supabase
          .from('leads')
          .select('id, email, phone, source, assigned_to, assigned_to_name, created_at')
          .or(leadOr)
          .order('created_at', { ascending: false })
          .limit(15);
        for (const l of (data ?? []) as any[]) {
          out.push({
            lead_table: 'leads',
            id: l.id,
            matched_on:
              emailKey && (l.email || '').trim().toLowerCase() === emailKey ? 'email' : 'phone',
            created_at: l.created_at,
            assigned_to: l.assigned_to ?? null,
            assigned_to_name: l.assigned_to_name ?? null,
            source: l.source ?? null,
          });
        }
      }

      const emailLeadOr = [
        emailKey ? `email.ilike.${emailKey}` : null,
        phoneKey ? `phone_number.like.%${phoneKey}` : null,
      ].filter(Boolean).join(',');
      if (emailLeadOr) {
        const { data } = await supabase
          .from('email_leads')
          .select('id, email, phone_number, lead_source, assigned_to, assigned_to_name, sales_person_id, sales_person_name, created_at')
          .or(emailLeadOr)
          .order('created_at', { ascending: false })
          .limit(15);
        for (const l of (data ?? []) as any[]) {
          out.push({
            lead_table: 'email_leads',
            id: l.id,
            matched_on:
              emailKey && (l.email || '').trim().toLowerCase() === emailKey ? 'email' : 'phone',
            created_at: l.created_at,
            assigned_to: l.assigned_to ?? l.sales_person_id ?? null,
            assigned_to_name: l.assigned_to_name ?? l.sales_person_name ?? null,
            source: l.lead_source ?? 'email',
          });
        }
      }

      return out.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    },
  });

  const selectedCallIds = useMemo(
    () => new Set(value.filter((e): e is CallLogEvidence => e.type === 'call_log').map((e) => e.call_log_id)),
    [value],
  );
  const selectedLeadIds = useMemo(
    () => new Set(value.filter((e): e is LeadEvidence => e.type === 'lead').map((e) => e.lead_id)),
    [value],
  );
  const files = useMemo(
    () => value.filter((e): e is FileEvidence => e.type === 'file'),
    [value],
  );

  const toggleCall = (c: CallLogRow) => {
    if (selectedCallIds.has(c.id)) {
      onChange(value.filter((e) => e.type !== 'call_log' || e.call_log_id !== c.id));
    } else {
      const item: CallLogEvidence = {
        type: 'call_log',
        call_log_id: c.id,
        caller_number: c.caller_number,
        called_at: c.created_at,
        duration: c.call_duration,
        call_type: c.call_type,
        recording_url: c.recording_url,
      };
      onChange([...value, item]);
    }
  };

  const toggleLead = (l: LeadMatchRow) => {
    if (selectedLeadIds.has(l.id)) {
      onChange(value.filter((e) => e.type !== 'lead' || e.lead_id !== l.id));
    } else {
      const item: LeadEvidence = {
        type: 'lead',
        lead_table: l.lead_table,
        lead_id: l.id,
        matched_on: l.matched_on,
        lead_created_at: l.created_at,
        assigned_to: l.assigned_to,
        assigned_to_name: l.assigned_to_name,
        source: l.source,
        assigned_matches_rep: !!salesPersonId && l.assigned_to === salesPersonId,
      };
      onChange([...value, item]);
    }
  };

  const uploadFile = async (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      toast({ title: 'File too large', description: 'Max 10MB.', variant: 'destructive' });
      return;
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      toast({ title: 'Unsupported type', description: 'PDF, image, or text only.', variant: 'destructive' });
      return;
    }
    if (!user?.id) return;
    setUploading(true);
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, '_');
      const path = `${user.id}/${orderId}/${Date.now()}-${safe}`;
      const { error } = await supabase.storage
        .from(EVIDENCE_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const item: FileEvidence = {
        type: 'file', path, name: file.name, size: file.size, mime: file.type,
      };
      onChange([...value, item]);
    } catch (e) {
      toast({
        title: 'Upload failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const removeFile = async (f: FileEvidence) => {
    onChange(value.filter((e) => e.type !== 'file' || e.path !== f.path));
    // Best-effort cleanup — the item is gone from the request either way.
    await supabase.storage.from(EVIDENCE_BUCKET).remove([f.path]).catch(() => {});
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Proof the deal was closed by this rep *</Label>
        <p className="text-[11px] text-muted-foreground">
          Strongest: a call to the customer's number dated <b>before</b> the order. Or attach a
          WhatsApp/email export, pre-dated lead, or quote.
        </p>
      </div>

      {/* Matched call logs */}
      <div className="rounded-md border">
        <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-xs font-medium">
          <Phone className="h-3.5 w-3.5" />
          Calls matching {order?.customer_phone || 'customer phone'}
        </div>
        {!phoneKey ? (
          <div className="flex items-start gap-2 p-3 text-xs text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 text-amber-600" />
            No usable phone number on this order — attach a document instead.
          </div>
        ) : loadingCalls ? (
          <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching call logs…
          </div>
        ) : !calls?.length ? (
          <div className="p-3 text-xs text-muted-foreground">
            No synced calls found for this number — attach a document instead.
          </div>
        ) : (
          <div className="max-h-44 overflow-y-auto divide-y">
            {calls.map((c) => {
              const before = isBeforeOrder(c.created_at, orderAt);
              return (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-xs hover:bg-muted/40"
                >
                  <Checkbox
                    checked={selectedCallIds.has(c.id)}
                    onCheckedChange={() => toggleCall(c)}
                  />
                  <span className="font-mono">{format(new Date(c.created_at), 'dd MMM yy, HH:mm')}</span>
                  <span className="text-muted-foreground">
                    {c.call_type || c.call_status} · {formatCallDuration(c.call_duration)}
                  </span>
                  <span className="ml-auto">
                    {before ? (
                      <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 text-[10px]">
                        before order
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 text-[10px]">
                        after order
                      </Badge>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Leads matching customer email/phone */}
      {(emailKey || phoneKey) && (
        <div className="rounded-md border">
          <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-xs font-medium">
            <UserSearch className="h-3.5 w-3.5" />
            Leads matching {order?.customer_email || order?.customer_phone || 'customer'}
          </div>
          {loadingLeads ? (
            <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching leads…
            </div>
          ) : !leads?.length ? (
            <div className="p-3 text-xs text-muted-foreground">
              No leads found for this customer's email/phone.
            </div>
          ) : (
            <div className="max-h-44 overflow-y-auto divide-y">
              {leads.map((l) => {
                const before = isBeforeOrder(l.created_at, orderAt);
                const assignedMatch = !!salesPersonId && l.assigned_to === salesPersonId;
                return (
                  <label
                    key={`${l.lead_table}-${l.id}`}
                    className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-xs hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={selectedLeadIds.has(l.id)}
                      onCheckedChange={() => toggleLead(l)}
                    />
                    <span className="font-mono">{format(new Date(l.created_at), 'dd MMM yy, HH:mm')}</span>
                    <span className="text-muted-foreground">
                      {l.source || l.lead_table} · via {l.matched_on}
                    </span>
                    <span className="ml-auto flex items-center gap-1">
                      {salesPersonId && (
                        assignedMatch ? (
                          <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 text-[10px]">
                            assigned to this rep
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700 text-[10px]">
                            assigned: {l.assigned_to_name || 'unassigned'}
                          </Badge>
                        )
                      )}
                      <Badge
                        variant="outline"
                        className={before
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 text-[10px]'
                          : 'border-amber-300 bg-amber-50 text-amber-700 text-[10px]'}
                      >
                        {before ? 'before order' : 'after order'}
                      </Badge>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* File attachments */}
      <div className="space-y-1.5">
        {files.map((f) => (
          <div key={f.path} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">{f.name}</span>
            <span className="text-muted-foreground">({Math.ceil(f.size / 1024)} KB)</span>
            <button
              type="button"
              onClick={() => removeFile(f)}
              className="ml-auto rounded p-0.5 text-muted-foreground hover:text-destructive"
              aria-label={`Remove ${f.name}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          accept={ALLOWED_MIME.join(',')}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
        >
          {uploading
            ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            : <Paperclip className="h-3.5 w-3.5 mr-1.5" />}
          Attach document
        </Button>
      </div>
    </div>
  );
}
