import { useState, useEffect, useMemo, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { useFollowups, Followup, FollowupFormData } from '@/hooks/useFollowups';
import { useAuth } from '@/hooks/useAuth';
import { format, isBefore, isToday } from 'date-fns';
import {
  User, Phone, Mail, Building2, MapPin, Package, Calendar, Clock,
  CheckCircle2, AlertTriangle, Plus, Save, Loader2, MessageCircle,
  Video, PhoneCall, Send, FileText, X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveProductName } from '@/lib/leadEnquiry';
import { toast } from 'sonner';
import { CallButton } from '@/components/calls/CallButton';
import { LeadRowActions, type LeadRowActionsProps } from './LeadRowActions';
import { DispositionDialog } from './DispositionDialog';
import { useSalesUsers } from '@/hooks/useSalesUsers';
import { supabase } from '@/integrations/supabase/client';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LeadSourceBadge, normalizeSource } from '@/components/LeadSourceBadge';
import { usePushToCompany, pushLeadToCompanyToast } from '@/hooks/usePushToCompany';
import { isValidCompanyName } from '@/lib/companyNormalize';
import { Building } from 'lucide-react';

/**
 * Extract human-readable form responses from a lead payload.
 * If `payload.raw_fields` exists, it is the source of truth. It may be either:
 *   - a record of field-name -> value
 *   - an array of { name: string, values?: string[] } entries (Facebook Lead Ads format)
 * Otherwise we fall back to the top-level payload entries themselves.
 */
function getFormResponseEntries(payload: Record<string, unknown> | null | undefined): [string, unknown][] {
  if (!payload) return [];

  const raw = payload.raw_fields;
  if (raw !== undefined && raw !== null) {
    if (Array.isArray(raw)) {
      return raw
        .filter((item): item is { name?: string; values?: unknown[] | null } & Record<string, unknown> =>
          typeof item === 'object' && item !== null
        )
        .map((item) => {
          const name = item.name ?? 'unnamed_field';
          const values = Array.isArray(item.values) ? item.values : [];
          const value = values.length === 1 ? values[0] : values;
          return [String(name), value] as [string, unknown];
        })
        .filter(([, v]) => v !== null && v !== undefined && v !== '');
    }

    if (typeof raw === 'object' && raw !== null) {
      return Object.entries(raw).filter(([, v]) => v !== null && v !== undefined && v !== '');
    }
  }

  return Object.entries(payload)
    .filter(([key, v]) => key !== 'raw_fields' && v !== null && v !== undefined && v !== '');
}

export interface LeadContactData {
  id: string;
  source_type: 'enquiry' | 'myoperator' | 'email' | 'form_lead' | 'google_ads' | 'interakt' | 'prospect' | 'pipeline' | 'lead';
  customer_name: string;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  city?: string | null;
  product_name?: string | null;
  notes?: string | null;
  status?: string | null;
  assigned_to_name?: string | null;
  created_at?: string;
  /** Free-text channel label carried from prospect/pipeline/order (e.g. 'call', 'whatsapp', 'website'). */
  lead_source?: string | null;
  // extra fields for display
  extras?: Record<string, string | number | boolean | null>;
  /** Raw form payload (e.g. Facebook Lead Ads answers). */
  payload?: Record<string, unknown> | null;
  /** How the lead reached its current owner (e.g. "Round-robin", "Manual"). */
  assignment_method?: string | null;
}

/** Wiring for disposition / reassign / source navigation. Optional — omit to hide those controls. */
export interface LeadDrawerActions {
  sourceTable: LeadRowActionsProps['sourceTable'];
  sourceRowId: string;
  disposition?: string | null;
  onChanged?: () => void;
  onViewInSource?: () => void;
}

interface LeadContactDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: LeadContactData | null;
  onSave?: (updates: { customer_name: string; phone?: string | null; email?: string | null; company?: string | null; city?: string | null; product_name?: string | null; notes?: string | null }) => void;
  saving?: boolean;
  /** Extra content rendered below contact details (e.g. email body, call recording) */
  extraContent?: React.ReactNode;
  /** Enables the Qualified / Not qualified / Junk / Reassign row and the ⋯ menu. */
  actions?: LeadDrawerActions;
}

const FOLLOWUP_TYPES = [
  { value: 'Call', icon: PhoneCall },
  { value: 'Email', icon: Send },
  { value: 'WhatsApp', icon: MessageCircle },
  { value: 'Meeting', icon: Video },
];

function openWhatsApp(phone: string | null | undefined) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return;
  window.open(`https://wa.me/${digits}`, '_blank', 'noopener,noreferrer');
}

export function LeadContactDrawer({ open, onOpenChange, lead, onSave, saving, extraContent, actions }: LeadContactDrawerProps) {
  const { user, profile } = useAuth();
  const { followups, createFollowup, completeFollowup, rescheduleFollowup } = useFollowups();
  const { pushLeadToCompany } = usePushToCompany();
  const { salesUsers } = useSalesUsers();
  const [pushing, setPushing] = useState(false);
  const [dispositionTarget, setDispositionTarget] = useState<'qualified' | 'not_qualified' | 'junk' | null>(null);
  const [reassigning, setReassigning] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('details');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ customer_name: '', phone: '', email: '', company: '', city: '', product_name: '', notes: '' });

  // Follow-up creation
  const [showNewFollowup, setShowNewFollowup] = useState(false);
  const [followupType, setFollowupType] = useState('Call');
  const [followupDate, setFollowupDate] = useState('');
  const [followupNotes, setFollowupNotes] = useState('');
  const [creatingFollowup, setCreatingFollowup] = useState(false);

  // Complete followup
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [completeRemark, setCompleteRemark] = useState('');
  const [completing, setCompleting] = useState(false);

  // Keep the latest lead available without making it an effect dependency —
  // callers build this object inline, so its identity changes on every parent
  // render (realtime/refetch). Resetting on identity was wiping the open
  // follow-up form mid-typing.
  const leadRef = useRef(lead);
  leadRef.current = lead;

  useEffect(() => {
    const l = leadRef.current;
    if (!l) return;
    setForm({
      customer_name: l.customer_name || '',
      phone: l.phone || '',
      email: l.email || '',
      company: l.company || '',
      city: l.city || '',
      product_name: l.product_name || '',
      notes: l.notes || '',
    });
    setEditing(false);
    setShowNewFollowup(false);
    setCompletingId(null);
    // Reset only when a different lead is opened (or the drawer reopens).
  }, [lead?.id, lead?.source_type, open]);

  // Filter followups for this lead
  const leadFollowups = useMemo(() => {
    if (!lead) return [];
    return followups.filter(f => f.source_id === lead.id && f.source_type === lead.source_type)
      .sort((a, b) => new Date(b.followup_at).getTime() - new Date(a.followup_at).getTime());
  }, [followups, lead]);

  const pendingFollowups = leadFollowups.filter(f => f.status === 'pending');
  const completedFollowups = leadFollowups.filter(f => f.status === 'completed');

  const handleSave = () => {
    if (!onSave) return;
    onSave({
      customer_name: form.customer_name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      company: form.company.trim() || null,
      city: form.city.trim() || null,
      product_name: form.product_name.trim() || null,
      notes: form.notes.trim() || null,
    });
    setEditing(false);
  };

  const handleCreateFollowup = async () => {
    if (!lead || !followupDate) return;
    setCreatingFollowup(true);
    try {
      await createFollowup({
        source_type: lead.source_type as FollowupFormData['source_type'],
        source_id: lead.id,
        customer_name: lead.customer_name,
        customer_company: lead.company,
        product_name: lead.product_name ? `[${followupType}] ${lead.product_name}` : `[${followupType}]`,
        phone: lead.phone,
        email: lead.email,
        followup_at: new Date(followupDate).toISOString(),
      });
      setShowNewFollowup(false);
      setFollowupDate('');
      setFollowupNotes('');
      setFollowupType('Call');
    } catch (e) {
      // toast is handled in hook
    } finally {
      setCreatingFollowup(false);
    }
  };

  const handleCompleteFollowup = async () => {
    if (!completingId) return;
    setCompleting(true);
    const ok = await completeFollowup(completingId, completeRemark);
    setCompleting(false);
    if (ok) {
      setCompletingId(null);
      setCompleteRemark('');
    }
  };

  if (!lead) return null;

  // Neutral cards; colour is reserved for genuinely overdue items.
  const getFollowupStatusColor = (f: Followup) =>
    f.status === 'pending' && isBefore(new Date(f.followup_at), new Date())
      ? 'border-l-destructive'
      : 'border-l-border';

  const getFollowupTypeFromProduct = (productName: string | null) => {
    if (!productName) return null;
    const match = productName.match(/^\[(\w+)\]/);
    return match ? match[1] : null;
  };

  const getFollowupTypeIcon = (type: string | null) => {
    const found = FOLLOWUP_TYPES.find(t => t.value === type);
    if (found) {
      const Icon = found.icon;
      return <Icon className="w-3.5 h-3.5 text-muted-foreground" />;
    }
    return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[560px] p-0 flex flex-col" side="right">
        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b bg-muted/30">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-6 h-6 text-primary" />
              </div>
              <div>
                <SheetTitle className="text-lg">{lead.customer_name}</SheetTitle>
                <div className="flex items-center gap-2 mt-1">
                  <LeadSourceBadge source={lead.source_type} size="sm" />
                  {lead.lead_source && normalizeSource(lead.lead_source) !== normalizeSource(lead.source_type) && (
                    <LeadSourceBadge source={lead.lead_source} size="sm" />
                  )}
                  {lead.status && <Badge variant="secondary" className="text-[10px] capitalize">{lead.status}</Badge>}
                  {pendingFollowups.length > 0 && (
                    <Badge className="text-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-400 border-0">
                      {pendingFollowups.length} pending follow-up{pendingFollowups.length > 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
          {/* Quick contact actions */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {lead.phone && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground bg-background border rounded-md px-2.5 py-1.5">
                <Phone className="w-3.5 h-3.5" /> {lead.phone}
              </span>
            )}
            {lead.email && (
              <a href={`mailto:${lead.email}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors bg-background border rounded-md px-2.5 py-1.5">
                <Mail className="w-3.5 h-3.5" /> {lead.email}
              </a>
            )}
            {lead.company && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground bg-background border rounded-md px-2.5 py-1.5">
                <Building2 className="w-3.5 h-3.5" /> {lead.company}
              </span>
            )}
            {lead.city && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground bg-background border rounded-md px-2.5 py-1.5">
                <MapPin className="w-3.5 h-3.5" /> {lead.city}
              </span>
            )}
          </div>

          {/* Primary actions — calling is the job for message-less channels. */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <CallButton
              phoneNumber={lead.phone}
              entityType={lead.source_type as any}
              entityId={lead.id}
              variant="default"
              size="sm"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!lead.phone}
              className="hover:text-success"
              title={lead.phone ? 'WhatsApp' : 'No phone number'}
              onClick={() => openWhatsApp(lead.phone)}
            >
              <MessageCircle className="w-4 h-4 mr-2" /> WhatsApp
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setActiveTab('followups'); setShowNewFollowup(true); }}
            >
              <Plus className="w-4 h-4 mr-2" /> Log follow-up
            </Button>
            {actions && (
              <LeadRowActions
                sourceTable={actions.sourceTable}
                sourceRowId={actions.sourceRowId}
                contactName={lead.customer_name}
                contactPhone={lead.phone}
                currentDisposition={actions.disposition as any}
                onViewInSource={actions.onViewInSource}
                onDispositionChanged={actions.onChanged}
              />
            )}
          </div>

          {/* Disposition — close the lead out without returning to the table. */}
          {actions && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setDispositionTarget('qualified')}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Qualified
              </Button>
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setDispositionTarget('not_qualified')}>
                <X className="w-3.5 h-3.5 mr-1" /> Not qualified
              </Button>
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setDispositionTarget('junk')}>
                Junk
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="text-xs" disabled={reassigning}>
                    {reassigning ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <User className="w-3.5 h-3.5 mr-1" />}
                    Reassign
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                  {salesUsers.map((u) => (
                    <DropdownMenuItem
                      key={u.user_id}
                      onClick={async () => {
                        setReassigning(true);
                        const { error } = await supabase.rpc('set_lead_assignee' as any, {
                          _source_table: actions.sourceTable,
                          _source_row_id: actions.sourceRowId,
                          _user_id: u.user_id,
                        });
                        setReassigning(false);
                        if (error) toast.error(error.message || 'Could not reassign lead.');
                        else {
                          toast.success(`Assigned to ${u.name}`);
                          actions.onChanged?.();
                        }
                      }}
                    >
                      {u.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </SheetHeader>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-6 mt-3 w-fit">
            <TabsTrigger value="details" className="text-xs">Details</TabsTrigger>
            <TabsTrigger value="followups" className="text-xs">
              Follow-ups
              {pendingFollowups.length > 0 && (
                <span className="ml-1.5 bg-amber-500/20 text-amber-700 dark:text-amber-400 rounded-full px-1.5 text-[10px] font-semibold">
                  {pendingFollowups.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1">
            {/* Details Tab */}
            <TabsContent value="details" className="px-6 pb-6 mt-0">
              <div className="space-y-4 pt-3">
                {/* Editable contact details */}
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Contact Details</h3>
                  <div className="flex items-center gap-2">
                    {isValidCompanyName(lead.company) && !editing && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pushing}
                        onClick={async () => {
                          setPushing(true);
                          await pushLeadToCompanyToast(() => pushLeadToCompany({
                            company: lead.company,
                            customer_name: lead.customer_name,
                            phone: lead.phone,
                            email: lead.email,
                            city: lead.city,
                            source_label: lead.source_type,
                          }));
                          setPushing(false);
                        }}
                      >
                        {pushing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Building className="w-3.5 h-3.5 mr-1" />}
                        Push to Companies
                      </Button>
                    )}
                    {onSave && (
                      <Button variant={editing ? 'default' : 'outline'} size="sm" onClick={() => editing ? handleSave() : setEditing(true)} disabled={saving}>
                        {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : editing ? <Save className="w-3.5 h-3.5 mr-1" /> : null}
                        {editing ? 'Save' : 'Edit'}
                      </Button>
                    )}
                  </div>
                </div>

                {editing ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Name *</Label>
                      <Input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Phone</Label>
                      <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Email</Label>
                      <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Company</Label>
                      <Input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">City</Label>
                      <Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Product</Label>
                      <Input value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))} className="h-9" />
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      <Label className="text-xs">Notes</Label>
                      <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
                    </div>
                  </div>
                ) : (() => {
                  // Only render fields that carry a value; state the gaps once
                  // instead of printing a column of em-dashes.
                  const fields = [
                    { icon: User, label: 'Name', value: lead.customer_name },
                    { icon: Phone, label: 'Phone', value: lead.phone },
                    { icon: Mail, label: 'Email', value: lead.email },
                    { icon: Building2, label: 'Company', value: lead.company },
                    { icon: MapPin, label: 'City', value: lead.city },
                    {
                      icon: Package,
                      label: 'Enquiry',
                      value: resolveProductName(lead.product_name, [lead.lead_source, lead.source_type]),
                    },
                    { icon: User, label: 'Assigned To', value: lead.assigned_to_name },
                    {
                      icon: Calendar,
                      label: 'Created',
                      value: lead.created_at ? format(new Date(lead.created_at), 'dd MMM yyyy, hh:mm a') : null,
                    },
                  ];
                  const present = fields.filter((f) => !!(f.value && String(f.value).trim()));
                  const missing = fields
                    .filter((f) => !(f.value && String(f.value).trim()))
                    .map((f) => f.label);
                  return (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                        {present.map((f) => (
                          <InfoRow key={f.label} icon={f.icon} label={f.label} value={String(f.value)} />
                        ))}
                      </div>
                      {missing.length > 0 && (
                        <p className="text-xs italic text-muted-foreground">
                          Not provided by this channel: {missing.join(', ')}
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Extra fields */}
                {lead.extras && Object.keys(lead.extras).length > 0 && (
                  <>
                    <Separator />
                    <h3 className="text-sm font-semibold">Additional Information</h3>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                      {Object.entries(lead.extras).filter(([, v]) => v != null && v !== '').map(([key, value]) => (
                        <div key={key} className="space-y-0.5">
                          <span className="text-[11px] text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
                          <p className="text-sm">{String(value)}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Form Responses (raw payload such as Facebook Lead Ads) */}
                {(() => {
                  const entries = getFormResponseEntries(lead.payload);
                  return entries.length > 0 ? (
                    <>
                      <Separator />
                      <h3 className="text-sm font-semibold">Form Responses</h3>
                      <div className="grid grid-cols-1 gap-y-3">
                        {entries.map(([key, value]) => {
                          const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                          const display =
                            typeof value === 'object' && value !== null
                              ? JSON.stringify(value, null, 2)
                              : String(value);
                          return (
                            <div key={key} className="space-y-0.5 border-l-2 border-muted pl-3">
                              <span className="text-[11px] text-muted-foreground">{label}</span>
                              <p className="text-sm whitespace-pre-wrap">{display}</p>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : null;
                })()}

                {/* Notes (read-only when not editing) */}
                {!editing && lead.notes && (
                  <>
                    <Separator />
                    <div>
                      <h3 className="text-sm font-semibold mb-2">Notes</h3>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{lead.notes}</p>
                    </div>
                  </>
                )}

                {/* Extra content (email body, recording, etc.) */}
                {extraContent && (
                  <>
                    <Separator />
                    {extraContent}
                  </>
                )}

                {/* Activity — how this lead arrived and who owns it. */}
                <Separator />
                <h3 className="text-sm font-semibold">Activity</h3>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  {lead.created_at && (
                    <li>
                      Captured {format(new Date(lead.created_at), 'dd MMM yyyy, hh:mm a')}
                    </li>
                  )}
                  <li>Channel: {lead.lead_source || lead.source_type}</li>
                  <li>
                    {lead.assigned_to_name
                      ? `Assigned to ${lead.assigned_to_name}`
                      : 'Not assigned yet'}
                    {lead.assignment_method ? ` · ${lead.assignment_method}` : ''}
                  </li>
                </ul>
              </div>
            </TabsContent>

            {/* Follow-ups Tab */}
            <TabsContent value="followups" className="px-6 pb-6 mt-0">
              <div className="space-y-4 pt-3">
                {/* New follow-up form */}
                {!showNewFollowup ? (
                  <Button onClick={() => setShowNewFollowup(true)} className="w-full" variant="outline">
                    <Plus className="w-4 h-4 mr-2" /> Log New Follow-up
                  </Button>
                ) : (
                  <Card>
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold">New Follow-up</h4>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowNewFollowup(false)}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                      {/* Type selector */}
                      <div className="flex gap-2">
                        {FOLLOWUP_TYPES.map(t => {
                          const Icon = t.icon;
                          return (
                            <Button
                              key={t.value}
                              variant={followupType === t.value ? 'default' : 'outline'}
                              size="sm"
                              className="text-xs flex-1"
                              onClick={() => setFollowupType(t.value)}
                            >
                              <Icon className="w-3.5 h-3.5 mr-1" /> {t.value}
                            </Button>
                          );
                        })}
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Scheduled Date & Time *</Label>
                        <Input type="datetime-local" value={followupDate} onChange={e => setFollowupDate(e.target.value)} className="h-9" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Notes (optional)</Label>
                        <Textarea value={followupNotes} onChange={e => setFollowupNotes(e.target.value)} rows={2} placeholder="What to discuss..." />
                      </div>
                      <Button onClick={handleCreateFollowup} disabled={creatingFollowup || !followupDate} className="w-full">
                        {creatingFollowup ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Calendar className="w-4 h-4 mr-2" />}
                        Schedule Follow-up
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* Timeline */}
                <h4 className="text-sm font-semibold text-muted-foreground">Follow-up Timeline ({leadFollowups.length})</h4>
                {leadFollowups.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No follow-ups yet</p>
                    <p className="text-xs">Click "Log New Follow-up" to get started</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {leadFollowups.map(f => {
                      const fType = getFollowupTypeFromProduct(f.product_name);
                      const isOverdue = f.status === 'pending' && isBefore(new Date(f.followup_at), new Date());
                      const isDueToday = f.status === 'pending' && isToday(new Date(f.followup_at));

                      return (
                        <div key={f.id} className={cn('border-l-4 rounded-lg border p-3 space-y-2', getFollowupStatusColor(f))}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {getFollowupTypeIcon(fType)}
                              <span className="text-xs font-medium">
                                {fType || 'Follow-up'} — {format(new Date(f.followup_at), 'dd MMM yyyy, hh:mm a')}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              {f.status === 'completed' && <Badge variant="secondary" className="text-[10px]">Done</Badge>}
                              {f.status === 'cancelled' && <Badge variant="secondary" className="text-[10px]">Cancelled</Badge>}
                              {isOverdue && <Badge variant="destructive" className="text-[10px]">Overdue</Badge>}
                              {isDueToday && !isOverdue && <Badge variant="outline" className="text-[10px]">Due today</Badge>}
                              {f.status === 'pending' && !isOverdue && !isDueToday && <Badge variant="outline" className="text-[10px]">Upcoming</Badge>}
                            </div>
                          </div>
                          {f.remark && <p className="text-xs text-muted-foreground">{f.remark}</p>}
                          <div className="text-[11px] text-muted-foreground">
                            By {f.created_by_name}
                            {f.completed_by_name && ` • Completed by ${f.completed_by_name}`}
                          </div>
                          {/* Actions for pending */}
                          {f.status === 'pending' && (
                            <div className="flex gap-2 pt-1">
                              {completingId === f.id ? (
                                <div className="flex-1 space-y-2">
                                  <Textarea
                                    value={completeRemark}
                                    onChange={e => setCompleteRemark(e.target.value)}
                                    placeholder="Add remark about the follow-up..."
                                    rows={2}
                                    className="text-xs"
                                  />
                                  <div className="flex gap-2">
                                    <Button size="sm" className="text-xs" onClick={handleCompleteFollowup} disabled={completing}>
                                      {completing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                                      Complete
                                    </Button>
                                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => setCompletingId(null)}>Cancel</Button>
                                  </div>
                                </div>
                              ) : (
                                <Button size="sm" variant="outline" className="text-xs" onClick={() => setCompletingId(f.id)}>
                                  <CheckCircle2 className="w-3 h-3 mr-1" /> Mark Complete
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        {actions && dispositionTarget && (
          <DispositionDialog
            open={!!dispositionTarget}
            onOpenChange={(o) => { if (!o) setDispositionTarget(null); }}
            sourceTable={actions.sourceTable}
            sourceRowId={actions.sourceRowId}
            contactName={lead.customer_name}
            contactPhone={lead.phone}
            target={dispositionTarget}
            onSuccess={actions.onChanged}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value?: string | null }) {
  return (
    <div className="space-y-0.5">
      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
        <Icon className="w-3 h-3" /> {label}
      </span>
      <p className="text-sm">{value || <span className="text-muted-foreground">—</span>}</p>
    </div>
  );
}

function FollowupMiniCard({ followup, statusColor, typeIcon }: { followup: Followup; statusColor: string; typeIcon: React.ReactNode }) {
  return (
    <div className={cn('border-l-4 rounded border p-2 flex items-center justify-between', statusColor)}>
      <div className="flex items-center gap-2">
        {typeIcon}
        <div>
          <span className="text-xs">{format(new Date(followup.followup_at), 'dd MMM, hh:mm a')}</span>
          {followup.remark && <p className="text-[11px] text-muted-foreground truncate max-w-[200px]">{followup.remark}</p>}
        </div>
      </div>
      {followup.status === 'completed' ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
      ) : followup.status === 'pending' && isBefore(new Date(followup.followup_at), new Date()) ? (
        <AlertTriangle className="w-4 h-4 text-red-500" />
      ) : (
        <Clock className="w-4 h-4 text-amber-500" />
      )}
    </div>
  );
}
