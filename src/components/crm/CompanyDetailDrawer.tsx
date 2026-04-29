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
import { Company, useCompanyContacts, useCompanyOrders, useCompanyProspects, useCompanyPipeline } from '@/hooks/useCompanies';
import { format } from 'date-fns';
import {
  Building2, Phone, Mail, Globe, MapPin, Plus, Trash2, User, Package,
  TrendingUp, IndianRupee, RefreshCw, Loader2, Star, Activity, Sparkles
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
  const { contacts, addContact, deleteContact } = useCompanyContacts(company?.id || null);
  const { orders } = useCompanyOrders(company?.id || null);
  const { prospects } = useCompanyProspects(company?.id || null);
  const { pipeline } = useCompanyPipeline(company?.name || null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', designation: '', phone: '', email: '' });
  const [addingContact, setAddingContact] = useState(false);

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
      <SheetContent className="w-full sm:max-w-xl p-0">
        <ScrollArea className="h-full">
          <div className="p-6">
            <SheetHeader className="text-left">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-primary/10">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <SheetTitle className="text-xl">{company.name}</SheetTitle>
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
              </TabsList>

              <TabsContent value="account">
                <CompanyAccountTab company={company} />
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
                    {contacts.map(c => (
                      <Card key={c.id} className="border-border/50">
                        <CardContent className="p-3 flex items-center justify-between">
                          <div>
                            <div className="font-medium text-sm flex items-center gap-1.5">
                              {c.name}
                              {c.is_primary && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
                            </div>
                            {c.designation && <div className="text-xs text-muted-foreground">{c.designation}</div>}
                            <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                              {c.phone && <span className="flex items-center gap-1"><Phone className="h-2.5 w-2.5" />{c.phone}</span>}
                              {c.email && <span className="flex items-center gap-1"><Mail className="h-2.5 w-2.5" />{c.email}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {c.phone && (
                              <CallButton
                                phoneNumber={c.phone}
                                entityType="company"
                                entityId={company.id}
                                iconOnly
                                variant="ghost"
                                className="h-7 w-7"
                              />
                            )}
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteContact(c.id)}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
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
                {prospects.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2">Prospects</div>
                    {prospects.map(p => (
                      <Card key={p.id} className="border-border/50 mb-2">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-medium">{p.customer_name}</div>
                              <div className="text-xs text-muted-foreground">{p.product_name || 'No product'} • {p.city || '—'}</div>
                            </div>
                            <Badge className={cn('text-[9px] border-0', STATUS_COLORS[p.status] || 'bg-muted')}>{p.status}</Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
                {pipeline.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2">Pipeline Deals</div>
                    {pipeline.map(p => (
                      <Card key={p.id} className="border-border/50 mb-2">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-medium">{p.customer_name}</div>
                              <div className="text-xs text-muted-foreground">{p.product_name} • ₹{((p.expected_price || 0) / 1000).toFixed(0)}K</div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {p.lead_temperature && (
                                <Badge variant="outline" className="text-[9px]">{p.lead_temperature}</Badge>
                              )}
                              <Badge className={cn('text-[9px] border-0', STATUS_COLORS[p.status] || 'bg-muted')}>{p.status}</Badge>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
                {prospects.length === 0 && pipeline.length === 0 && (
                  <div className="text-center py-6 text-xs text-muted-foreground">No prospects or pipeline deals linked</div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
