import { useState, useEffect, useMemo } from 'react';
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
import { toast } from 'sonner';
import { CallButton } from '@/components/calls/CallButton';
import { LeadSourceBadge, normalizeSource } from '@/components/LeadSourceBadge';
import { usePushToCompany, pushLeadToCompanyToast } from '@/hooks/usePushToCompany';
import { isValidCompanyName } from '@/lib/companyNormalize';
import { Building } from 'lucide-react';

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
}

interface LeadContactDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: LeadContactData | null;
  onSave?: (updates: { customer_name: string; phone?: string | null; email?: string | null; company?: string | null; city?: string | null; product_name?: string | null; notes?: string | null }) => void;
  saving?: boolean;
  /** Extra content rendered below contact details (e.g. email body, call recording) */
  extraContent?: React.ReactNode;
}

const FOLLOWUP_TYPES = [
  { value: 'Call', icon: PhoneCall, color: 'text-blue-500' },
  { value: 'Email', icon: Send, color: 'text-amber-500' },
  { value: 'WhatsApp', icon: MessageCircle, color: 'text-green-500' },
  { value: 'Meeting', icon: Video, color: 'text-purple-500' },
];

export function LeadContactDrawer({ open, onOpenChange, lead, onSave, saving, extraContent }: LeadContactDrawerProps) {
  const { user, profile } = useAuth();
  const { followups, createFollowup, completeFollowup, rescheduleFollowup } = useFollowups();
  const { pushLeadToCompany } = usePushToCompany();
  const [pushing, setPushing] = useState(false);
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

  useEffect(() => {
    if (lead) {
      setForm({
        customer_name: lead.customer_name || '',
        phone: lead.phone || '',
        email: lead.email || '',
        company: lead.company || '',
        city: lead.city || '',
        product_name: lead.product_name || '',
        notes: lead.notes || '',
      });
      setEditing(false);
      setShowNewFollowup(false);
      setCompletingId(null);
    }
  }, [lead]);

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

  const getFollowupStatusColor = (f: Followup) => {
    if (f.status === 'completed') return 'border-l-emerald-500 bg-emerald-500/5';
    if (f.status === 'cancelled') return 'border-l-muted bg-muted/30';
    if (isBefore(new Date(f.followup_at), new Date()) && f.status === 'pending') return 'border-l-red-500 bg-red-500/5';
    if (isToday(new Date(f.followup_at))) return 'border-l-amber-500 bg-amber-500/5';
    return 'border-l-primary bg-primary/5';
  };

  const getFollowupTypeFromProduct = (productName: string | null) => {
    if (!productName) return null;
    const match = productName.match(/^\[(\w+)\]/);
    return match ? match[1] : null;
  };

  const getFollowupTypeIcon = (type: string | null) => {
    const found = FOLLOWUP_TYPES.find(t => t.value === type);
    if (found) {
      const Icon = found.icon;
      return <Icon className={cn('w-3.5 h-3.5', found.color)} />;
    }
    return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[700px] p-0 flex flex-col" side="right">
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
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-background border rounded-md px-2.5 py-1 pr-1">
                <Phone className="w-3.5 h-3.5" /> {lead.phone}
                <CallButton
                  phoneNumber={lead.phone}
                  entityType={lead.source_type as any}
                  entityId={lead.id}
                  iconOnly
                  variant="ghost"
                  className="h-6 w-6 ml-1"
                />
              </div>
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
                ) : (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    <InfoRow icon={User} label="Name" value={lead.customer_name} />
                    <InfoRow icon={Phone} label="Phone" value={lead.phone} />
                    <InfoRow icon={Mail} label="Email" value={lead.email} />
                    <InfoRow icon={Building2} label="Company" value={lead.company} />
                    <InfoRow icon={MapPin} label="City" value={lead.city} />
                    <InfoRow icon={Package} label="Product" value={lead.product_name} />
                    {lead.assigned_to_name && <InfoRow icon={User} label="Assigned To" value={lead.assigned_to_name} />}
                    {lead.created_at && <InfoRow icon={Calendar} label="Created" value={format(new Date(lead.created_at), 'dd MMM yyyy, hh:mm a')} />}
                  </div>
                )}

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
                {lead.payload && Object.keys(lead.payload).length > 0 && (
                  <>
                    <Separator />
                    <h3 className="text-sm font-semibold">Form Responses</h3>
                    <div className="grid grid-cols-1 gap-y-3">
                      {Object.entries(lead.payload)
                        .filter(([, v]) => v !== null && v !== undefined && v !== '')
                        .map(([key, value]) => {
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
                )}

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

                {/* Quick follow-up inline */}
                <Separator />
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Recent Follow-ups</h3>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => { setActiveTab('followups'); setShowNewFollowup(true); }}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Log Follow-up
                  </Button>
                </div>
                {leadFollowups.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3">No follow-ups logged yet.</p>
                ) : (
                  <div className="space-y-2">
                    {leadFollowups.slice(0, 3).map(f => (
                      <FollowupMiniCard key={f.id} followup={f} statusColor={getFollowupStatusColor(f)} typeIcon={getFollowupTypeIcon(getFollowupTypeFromProduct(f.product_name))} />
                    ))}
                    {leadFollowups.length > 3 && (
                      <Button variant="ghost" size="sm" className="text-xs w-full" onClick={() => setActiveTab('followups')}>
                        View all {leadFollowups.length} follow-ups →
                      </Button>
                    )}
                  </div>
                )}
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
                              {f.status === 'completed' && <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-0 text-[10px]">✅ Done</Badge>}
                              {f.status === 'cancelled' && <Badge variant="secondary" className="text-[10px]">Cancelled</Badge>}
                              {isOverdue && <Badge className="bg-red-500/20 text-red-700 dark:text-red-400 border-0 text-[10px]">⚠ Overdue</Badge>}
                              {isDueToday && !isOverdue && <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-400 border-0 text-[10px]">Due Today</Badge>}
                              {f.status === 'pending' && !isOverdue && !isDueToday && <Badge className="bg-primary/20 text-primary border-0 text-[10px]">Upcoming</Badge>}
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
