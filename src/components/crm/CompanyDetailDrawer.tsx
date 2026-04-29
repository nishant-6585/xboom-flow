import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Company, useCompanyContacts, useCompanyOrders, useCompanyProspects, useCompanyPipeline, useCompanies } from '@/hooks/useCompanies';
import { useProfileNames } from '@/hooks/useProfileNames';
import { CompanyOwnerPicker } from './CompanyOwnerPicker';
import { CompanyFollowupsTab } from './CompanyFollowupsTab';
import { useCompanyFollowups } from '@/hooks/useCompanyFollowups';
import { format } from 'date-fns';
import {
  Building2, Phone, Mail, Globe, MapPin, Plus, Trash2, User, Package,
  TrendingUp, IndianRupee, RefreshCw, Loader2, Star, Activity, Sparkles,
  ChevronDown, ChevronRight, Pencil, Save, X as XIcon, Calendar,
  Tag, Hash, Flame, Target, Clock, AlertTriangle, Layers
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CallButton } from '@/components/calls/CallButton';
import { CompanyTierBadge } from './CompanyTierBadge';
import { CompanyHealthBadge } from './CompanyHealthBadge';
import { CompanyTimelineTab } from './CompanyTimelineTab';
import { CompanyAccountTab } from './CompanyAccountTab';

interface Props {
  company: Company | null;
  open: boolean;
  onClose: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-500/20 text-blue-700',
  contacted: 'bg-purple-500/20 text-purple-700',
  qualified: 'bg-amber-500/20 text-amber-700',
  negotiation: 'bg-indigo-500/20 text-indigo-700',
  converted: 'bg-green-500/20 text-green-700',
  won: 'bg-green-500/20 text-green-700',
  lost: 'bg-red-500/20 text-red-700',
  active: 'bg-blue-500/20 text-blue-700',
};

export function CompanyDetailDrawer({ company, open, onClose }: Props) {
  const { contacts, addContact, deleteContact, updateContact } = useCompanyContacts(company?.id || null);
  const { orders } = useCompanyOrders(company?.id || null);
  const { prospects } = useCompanyProspects(company?.id || null);
  const { pipeline } = useCompanyPipeline(company?.name || null);
  const { updateCompany } = useCompanies();
  const { resolveName: resolveOwnerName } = useProfileNames();
  const { followups: companyFollowups } = useCompanyFollowups(company?.id || null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', designation: '', phone: '', email: '' });
  const [addingContact, setAddingContact] = useState(false);
  const [expandedContactId, setExpandedContactId] = useState<string | null>(null);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', designation: '', phone: '', email: '', notes: '' });

  if (!company) return null;

  const handleAddContact = async () => {
    if (!contactForm.name.trim()) return;
    setAddingContact(true);
    try {
      await addContact({
        company_id: company.id,
        name: contactForm.name,
        designation: contactForm.designation || null,
        phone: contactForm.phone || null,
        email: contactForm.email || null,
      });
      setContactForm({ name: '', designation: '', phone: '', email: '' });
      setShowAddContact(false);
    } finally {
      setAddingContact(false);
    }
  };

  // Identify recurring orders (same product ordered 2+ times)
  const productCounts: Record<string, number> = {};
  orders.forEach(o => {
    const key = o.product_name || 'Unknown';
    productCounts[key] = (productCounts[key] || 0) + 1;
  });
  const recurringProducts = new Set(Object.entries(productCounts).filter(([, c]) => c >= 2).map(([k]) => k));

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl p-0 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <div className="p-6 max-w-full">
            <SheetHeader className="text-left">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-primary/10">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <SheetTitle className="text-xl">
                    {company.name && company.name.trim() && company.name.trim() !== '-'
                      ? company.name
                      : <span className="italic text-muted-foreground">Unnamed company</span>}
                  </SheetTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className={cn('text-[10px] border-0', company.status === 'customer' ? 'bg-green-500/20 text-green-700' : 'bg-blue-500/20 text-blue-700')}>
                      {company.status}
                    </Badge>
                    {company.is_recurring && (
                      <Badge className="text-[10px] border-0 bg-amber-500/20 text-amber-700">
                        <RefreshCw className="h-2.5 w-2.5 mr-0.5" />Recurring
                      </Badge>
                    )}
                    {company.industry && <Badge variant="outline" className="text-[10px]">{company.industry}</Badge>}
                    <CompanyTierBadge tier={company.tier as any} source={company.tier_source as any} />
                    <CompanyHealthBadge score={company.health_score} band={company.health_band as any} />
                  </div>
                </div>
              </div>
            </SheetHeader>

            {/* Company Info */}
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              {company.city && <div className="flex items-center gap-1.5 text-muted-foreground"><MapPin className="h-3 w-3" />{company.city}{company.state ? `, ${company.state}` : ''}</div>}
              {company.phone && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Phone className="h-3 w-3" />
                  <span className="flex-1 truncate">{company.phone}</span>
                  <CallButton
                    phoneNumber={company.phone}
                    entityType="company"
                    entityId={company.id}
                    iconOnly
                    variant="ghost"
                    className="h-6 w-6"
                  />
                </div>
              )}
              {company.email && <div className="flex items-center gap-1.5 text-muted-foreground"><Mail className="h-3 w-3" />{company.email}</div>}
              {company.website && <div className="flex items-center gap-1.5 text-muted-foreground"><Globe className="h-3 w-3" />{company.website}</div>}
            </div>

            {/* Account Owner */}
            <div className="mt-3 flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Account Owner:</span>
              <CompanyOwnerPicker
                ownerId={company.account_owner_id}
                ownerName={company.account_owner_id ? resolveOwnerName(company.account_owner_id) : null}
                onChange={(uid) => updateCompany({ id: company.id, account_owner_id: uid as any })}
              />
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-3 mt-4">
              <Card className="border-border/50">
                <CardContent className="p-3 text-center">
                  <div className="text-lg font-bold">{company.total_orders_count}</div>
                  <div className="text-[10px] text-muted-foreground">Orders</div>
                </CardContent>
              </Card>
              <Card className="border-border/50">
                <CardContent className="p-3 text-center">
                  <div className="text-lg font-bold">₹{(company.total_order_value / 100000).toFixed(1)}L</div>
                  <div className="text-[10px] text-muted-foreground">Total Value</div>
                </CardContent>
              </Card>
              <Card className="border-border/50">
                <CardContent className="p-3 text-center">
                  <div className="text-lg font-bold">{prospects.length + pipeline.length}</div>
                  <div className="text-[10px] text-muted-foreground">Active Deals</div>
                </CardContent>
              </Card>
            </div>

            <Separator className="my-4" />

            <Tabs defaultValue="account" className="space-y-3">
              <TabsList className="w-full flex-wrap h-auto">
                <TabsTrigger value="account" className="flex-1 text-xs gap-1"><Sparkles className="h-3 w-3" />Account</TabsTrigger>
                <TabsTrigger value="timeline" className="flex-1 text-xs gap-1"><Activity className="h-3 w-3" />Timeline</TabsTrigger>
                <TabsTrigger value="contacts" className="flex-1 text-xs gap-1"><User className="h-3 w-3" />Contacts ({contacts.length})</TabsTrigger>
                <TabsTrigger value="orders" className="flex-1 text-xs gap-1"><Package className="h-3 w-3" />Orders ({orders.length})</TabsTrigger>
                <TabsTrigger value="pipeline" className="flex-1 text-xs gap-1"><TrendingUp className="h-3 w-3" />Pipeline ({prospects.length + pipeline.length})</TabsTrigger>
                <TabsTrigger value="followups" className="flex-1 text-xs gap-1"><Clock className="h-3 w-3" />Follow-ups ({companyFollowups.filter(f => f.status === 'pending').length})</TabsTrigger>
              </TabsList>

              <TabsContent value="account">
                <CompanyAccountTab company={company} />
              </TabsContent>

              <TabsContent value="followups">
                <CompanyFollowupsTab company={company} />
              </TabsContent>

              <TabsContent value="timeline">
                <CompanyTimelineTab companyId={company.id} companyName={company.name} />
              </TabsContent>

              {/* Contacts Tab */}
              <TabsContent value="contacts" className="space-y-3">
                <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setShowAddContact(!showAddContact)}>
                  <Plus className="h-3 w-3" />{showAddContact ? 'Cancel' : 'Add Contact'}
                </Button>
                {showAddContact && (
                  <Card className="border-border/50">
                    <CardContent className="p-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div><Label className="text-xs">Name *</Label><Input className="h-8 text-xs" value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} /></div>
                        <div><Label className="text-xs">Designation</Label><Input className="h-8 text-xs" value={contactForm.designation} onChange={e => setContactForm(f => ({ ...f, designation: e.target.value }))} /></div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div><Label className="text-xs">Phone</Label><Input className="h-8 text-xs" value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} /></div>
                        <div><Label className="text-xs">Email</Label><Input className="h-8 text-xs" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} /></div>
                      </div>
                      <Button size="sm" className="w-full text-xs" onClick={handleAddContact} disabled={addingContact || !contactForm.name.trim()}>
                        {addingContact ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}Save Contact
                      </Button>
                    </CardContent>
                  </Card>
                )}
                {contacts.length === 0 ? (
                  <div className="text-center py-6 text-xs text-muted-foreground">No contacts added yet</div>
                ) : (
                  <div className="space-y-2">
                    {contacts.map(c => {
                      const isExpanded = expandedContactId === c.id;
                      const isEditing = editingContactId === c.id;
                      return (
                        <Card key={c.id} className="border-border/50 overflow-hidden">
                          <CardContent
                            className="p-3 flex items-center justify-between cursor-pointer hover:bg-accent/30 transition-colors"
                            onClick={() => {
                              if (isEditing) return;
                              setExpandedContactId(isExpanded ? null : c.id);
                            }}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                              <div className="min-w-0">
                                <div className="font-medium text-sm flex items-center gap-1.5">
                                  {c.name}
                                  {c.is_primary && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
                                </div>
                                {c.designation && <div className="text-xs text-muted-foreground truncate">{c.designation}</div>}
                                {!isExpanded && (
                                  <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                                    {c.phone && <span className="flex items-center gap-1"><Phone className="h-2.5 w-2.5" />{c.phone}</span>}
                                    {c.email && <span className="flex items-center gap-1 truncate"><Mail className="h-2.5 w-2.5" />{c.email}</span>}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              {c.phone && !isEditing && (
                                <CallButton
                                  phoneNumber={c.phone}
                                  entityType="company"
                                  entityId={company.id}
                                  iconOnly
                                  variant="ghost"
                                  className="h-7 w-7"
                                />
                              )}
                              {!isEditing && (
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteContact(c.id)}>
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </CardContent>
                          {isExpanded && (
                            <div className="border-t border-border/50 p-3 bg-muted/20 space-y-3" onClick={(e) => e.stopPropagation()}>
                              {!isEditing ? (
                                <>
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                      <div className="text-muted-foreground">Phone</div>
                                      <div className="font-medium flex items-center gap-1">
                                        {c.phone ? <><Phone className="h-3 w-3" />{c.phone}</> : <span className="text-muted-foreground">—</span>}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-muted-foreground">Email</div>
                                      <div className="font-medium flex items-center gap-1 truncate">
                                        {c.email ? <><Mail className="h-3 w-3 shrink-0" /><span className="truncate">{c.email}</span></> : <span className="text-muted-foreground">—</span>}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-muted-foreground">Designation</div>
                                      <div className="font-medium">{c.designation || <span className="text-muted-foreground">—</span>}</div>
                                    </div>
                                    <div>
                                      <div className="text-muted-foreground">Added</div>
                                      <div className="font-medium flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(c.created_at), 'dd MMM yyyy')}</div>
                                    </div>
                                  </div>
                                  {c.notes && (
                                    <div className="text-xs">
                                      <div className="text-muted-foreground mb-0.5">Notes</div>
                                      <div className="whitespace-pre-wrap">{c.notes}</div>
                                    </div>
                                  )}
                                  <div className="flex gap-2 pt-1">
                                    <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => {
                                      setEditingContactId(c.id);
                                      setEditForm({
                                        name: c.name,
                                        designation: c.designation || '',
                                        phone: c.phone || '',
                                        email: c.email || '',
                                        notes: c.notes || '',
                                      });
                                    }}>
                                      <Pencil className="h-3 w-3" />Edit
                                    </Button>
                                    {!c.is_primary && (
                                      <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={async () => {
                                        // Demote others, promote this
                                        for (const other of contacts.filter(x => x.is_primary && x.id !== c.id)) {
                                          await updateContact({ id: other.id, is_primary: false });
                                        }
                                        await updateContact({ id: c.id, is_primary: true });
                                      }}>
                                        <Star className="h-3 w-3" />Set Primary
                                      </Button>
                                    )}
                                  </div>
                                </>
                              ) : (
                                <div className="space-y-2">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div><Label className="text-xs">Name *</Label><Input className="h-8 text-xs" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></div>
                                    <div><Label className="text-xs">Designation</Label><Input className="h-8 text-xs" value={editForm.designation} onChange={e => setEditForm(f => ({ ...f, designation: e.target.value }))} /></div>
                                    <div><Label className="text-xs">Phone</Label><Input className="h-8 text-xs" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} /></div>
                                    <div><Label className="text-xs">Email</Label><Input className="h-8 text-xs" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} /></div>
                                  </div>
                                  <div>
                                    <Label className="text-xs">Notes</Label>
                                    <Input className="h-8 text-xs" value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
                                  </div>
                                  <div className="flex gap-2">
                                    <Button size="sm" className="text-xs h-7 gap-1" onClick={async () => {
                                      await updateContact({
                                        id: c.id,
                                        name: editForm.name,
                                        designation: editForm.designation || null,
                                        phone: editForm.phone || null,
                                        email: editForm.email || null,
                                        notes: editForm.notes || null,
                                      });
                                      setEditingContactId(null);
                                    }} disabled={!editForm.name.trim()}>
                                      <Save className="h-3 w-3" />Save
                                    </Button>
                                    <Button size="sm" variant="ghost" className="text-xs h-7 gap-1" onClick={() => setEditingContactId(null)}>
                                      <XIcon className="h-3 w-3" />Cancel
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* Orders Tab */}
              <TabsContent value="orders" className="space-y-2">
                {orders.length === 0 ? (
                  <div className="text-center py-6 text-xs text-muted-foreground">No orders linked to this company</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Product</TableHead>
                          <TableHead className="text-xs">Amount</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orders.map(o => (
                          <TableRow key={o.id}>
                            <TableCell className="text-xs">
                              <div className="flex items-center gap-1">
                                {o.product_name}
                                {recurringProducts.has(o.product_name || '') && (
                                  <Badge className="text-[8px] px-1 py-0 bg-amber-500/20 text-amber-700 border-0">
                                    <RefreshCw className="h-2 w-2 mr-0.5" />repeat
                                  </Badge>
                                )}
                              </div>
                              {o.order_number && <div className="text-[10px] text-muted-foreground">#{o.order_number}</div>}
                            </TableCell>
                            <TableCell className="text-xs font-medium">
                              {o.total_sales_amount ? `₹${(o.total_sales_amount / 1000).toFixed(0)}K` : '—'}
                            </TableCell>
                            <TableCell>
                              <Badge className={cn('text-[9px] border-0', STATUS_COLORS[o.status] || 'bg-muted')}>{o.status}</Badge>
                            </TableCell>
                            <TableCell className="text-[10px] text-muted-foreground">
                              {o.order_date ? format(new Date(o.order_date), 'dd MMM yy') : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* Pipeline Tab */}
              <TabsContent value="pipeline" className="space-y-3">
                {/* Aggregate strip */}
                {(prospects.length > 0 || pipeline.length > 0) && (
                  <div className="grid grid-cols-3 gap-2">
                    <Card className="border-border/50">
                      <CardContent className="p-2 text-center">
                        <div className="text-sm font-bold">{prospects.length}</div>
                        <div className="text-[10px] text-muted-foreground">Prospects</div>
                      </CardContent>
                    </Card>
                    <Card className="border-border/50">
                      <CardContent className="p-2 text-center">
                        <div className="text-sm font-bold">{pipeline.length}</div>
                        <div className="text-[10px] text-muted-foreground">Pipeline</div>
                      </CardContent>
                    </Card>
                    <Card className="border-border/50">
                      <CardContent className="p-2 text-center">
                        <div className="text-sm font-bold">
                          ₹{((
                            prospects.reduce((s: number, p: any) => s + (Number(p.quoted_price ?? p.default_price ?? 0) * Number(p.quantity ?? 1)), 0) +
                            pipeline.reduce((s: number, p: any) => s + Number(p.expected_price ?? 0), 0)
                          ) / 100000).toFixed(1)}L
                        </div>
                        <div className="text-[10px] text-muted-foreground">Open Value</div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Prospects list */}
                {prospects.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Layers className="h-3 w-3" />Prospects ({prospects.length})
                    </div>
                    <div className="space-y-2">
              {prospects.map((p: any) => {
                        const unit = Number(p.quoted_price ?? p.default_price ?? 0);
                        const qty = Number(p.quantity ?? 1);
                        const total = unit * qty;
                        return (
                          <Card key={p.id} className="border-border/50 overflow-hidden">
                            <CardContent className="p-3 space-y-2 min-w-0">
                              <div className="flex items-start justify-between gap-2 min-w-0">
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium flex items-start gap-1.5 min-w-0">
                                    <Package className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                                    <span className="break-words min-w-0 flex-1">{p.product_name || 'Unknown product'}</span>
                                    {p.is_a_category && <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0 mt-0.5" />}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                                    {p.product_category && <span className="flex items-center gap-1"><Tag className="h-2.5 w-2.5" />{p.product_category}</span>}
                                    {p.product_code && <span className="flex items-center gap-1"><Hash className="h-2.5 w-2.5" />{p.product_code}</span>}
                                  </div>
                                </div>
                                <Badge className={cn('text-[9px] border-0 shrink-0', STATUS_COLORS[p.status] || 'bg-muted')}>{p.status}</Badge>
                              </div>

                              <div className="grid grid-cols-3 gap-2 text-[11px]">
                                <div>
                                  <div className="text-muted-foreground">Qty</div>
                                  <div className="font-medium">{qty}</div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">Unit Price</div>
                                  <div className="font-medium">{unit > 0 ? `₹${unit.toLocaleString('en-IN')}` : '—'}</div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">Total</div>
                                  <div className="font-semibold text-primary">{total > 0 ? `₹${(total / 1000).toFixed(1)}K` : '—'}</div>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/40">
                                {p.urgency && <Badge variant="outline" className="text-[9px] gap-1"><Flame className="h-2.5 w-2.5" />{p.urgency}</Badge>}
                                {p.lead_quality && <Badge variant="outline" className="text-[9px]">{p.lead_quality}</Badge>}
                                {p.prospect_type && <Badge variant="outline" className="text-[9px]">{p.prospect_type}</Badge>}
                                {p.lead_source && <Badge variant="outline" className="text-[9px]">{p.lead_source}</Badge>}
                                {p.requested_timeline && <Badge variant="outline" className="text-[9px] gap-1"><Clock className="h-2.5 w-2.5" />{p.requested_timeline}</Badge>}
                              </div>

                              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                <span className="flex items-center gap-1"><User className="h-2.5 w-2.5" />{p.created_by_name || 'Unassigned'}</span>
                                <span className="flex items-center gap-1"><Calendar className="h-2.5 w-2.5" />{p.created_at ? format(new Date(p.created_at), 'dd MMM yy') : '—'}</span>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Pipeline list */}
                {pipeline.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                      <TrendingUp className="h-3 w-3" />Pipeline Deals ({pipeline.length})
                    </div>
                    <div className="space-y-2">
              {pipeline.map((p: any) => {
                        const value = Number(p.expected_price ?? 0);
                        const qty = Number(p.quantity ?? 1);
                        return (
                          <Card key={p.id} className="border-border/50 overflow-hidden">
                            <CardContent className="p-3 space-y-2 min-w-0">
                              <div className="flex items-start justify-between gap-2 min-w-0">
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium flex items-start gap-1.5 min-w-0">
                                    <Package className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                                    <span className="break-words min-w-0 flex-1">{p.product_name || 'Unknown product'}</span>
                                    {p.is_mega_deal && <Badge className="text-[9px] border-0 bg-amber-500/20 text-amber-700 shrink-0">MEGA</Badge>}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                                    {p.product_category && <span className="flex items-center gap-1"><Tag className="h-2.5 w-2.5" />{p.product_category}</span>}
                                    {p.product_code && <span className="flex items-center gap-1"><Hash className="h-2.5 w-2.5" />{p.product_code}</span>}
                                  </div>
                                </div>
                                <Badge className={cn('text-[9px] border-0 shrink-0', STATUS_COLORS[p.status] || 'bg-muted')}>{p.status}</Badge>
                              </div>

                              <div className="grid grid-cols-3 gap-2 text-[11px]">
                                <div>
                                  <div className="text-muted-foreground">Qty</div>
                                  <div className="font-medium">{qty}</div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">Expected Value</div>
                                  <div className="font-semibold text-primary">{value > 0 ? `₹${(value / 1000).toFixed(1)}K` : '—'}</div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground flex items-center gap-1"><Target className="h-2.5 w-2.5" />Probability</div>
                                  <div className="font-medium">{p.probability != null ? `${p.probability}%` : '—'}</div>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/40">
                                {p.lead_temperature && <Badge variant="outline" className="text-[9px] gap-1"><Flame className="h-2.5 w-2.5" />{p.lead_temperature}</Badge>}
                                {p.priority && <Badge variant="outline" className="text-[9px] gap-1"><AlertTriangle className="h-2.5 w-2.5" />{p.priority}</Badge>}
                                {p.customer_type && <Badge variant="outline" className="text-[9px]">{p.customer_type}</Badge>}
                                {p.lead_source && <Badge variant="outline" className="text-[9px]">{p.lead_source}</Badge>}
                                {p.expected_closure_date && (
                                  <Badge variant="outline" className="text-[9px] gap-1">
                                    <Calendar className="h-2.5 w-2.5" />Close {format(new Date(p.expected_closure_date), 'dd MMM yy')}
                                  </Badge>
                                )}
                              </div>

                              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                <span className="flex items-center gap-1"><User className="h-2.5 w-2.5" />{p.sales_person_name || 'Unassigned'}</span>
                                <span className="flex items-center gap-1"><Calendar className="h-2.5 w-2.5" />{p.created_at ? format(new Date(p.created_at), 'dd MMM yy') : '—'}</span>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}

                {prospects.length === 0 && pipeline.length === 0 && (
                  <div className="text-center py-6 text-xs text-muted-foreground">No prospects or pipeline deals linked</div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
