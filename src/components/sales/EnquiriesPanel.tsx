import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEnquiries, PRODUCT_CATEGORIES, Enquiry, ENQUIRY_STATUSES } from '@/hooks/useEnquiries';
import { useEnquiryItems, EnquiryItem } from '@/hooks/useEnquiryItems';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { 
  Upload, FileSpreadsheet, Download, Search, Plus, Package, 
  Building2, Calendar, Filter, Loader2, Eye, ArrowRight, Pencil, Trash2, IndianRupee, Zap, BarChart3, ListFilter
} from 'lucide-react';
import { EnquiriesDashboard } from './EnquiriesDashboard';
import { format } from 'date-fns';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { EnquiryFormDialog } from './EnquiryFormDialog';
import { CallIntelligencePanel } from './CallIntelligencePanel';
import { AssigneeCell } from './AssigneeCell';
import { LinkToCompanyButton } from './LinkToCompanyButton';
import { useProfileNames } from '@/hooks/useProfileNames';
import { cn } from '@/lib/utils';
import { touchedRowCn, isRowTouched } from '@/lib/touchedRow';
import { useEngagedLeadIds } from '@/hooks/useEngagedLeadIds';

interface EnquiriesPanelProps {
  selectedLeadId?: string | null;
}

export function EnquiriesPanel({ selectedLeadId }: EnquiriesPanelProps = {}) {
  const { enquiries, loading, refetch } = useEnquiries();
  const { fetchEnquiryItems } = useEnquiryItems();
  const { data: engagedIds } = useEngagedLeadIds('enquiry');
  const { user, profile, role } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [salesPersonFilter, setSalesPersonFilter] = useState<string>('all');
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingEnquiry, setEditingEnquiry] = useState<Enquiry | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingEnquiry, setViewingEnquiry] = useState<Enquiry | null>(null);
  const [enquiryItems, setEnquiryItems] = useState<EnquiryItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [innerTab, setInnerTab] = useState<string>('dashboard');
  const lastAutoOpenedId = useRef<string | null>(null);

  // Auto-open enquiry when selectedLeadId is provided
  useEffect(() => {
    if (!selectedLeadId || loading || enquiries.length === 0) return;
    if (lastAutoOpenedId.current === selectedLeadId) return;
    const target = enquiries.find(e => e.id === selectedLeadId);
    if (target) {
      lastAutoOpenedId.current = selectedLeadId;
      setViewingEnquiry(target);
      setViewDialogOpen(true);
      // Fetch items
      fetchEnquiryItems(target.id).then(items => {
        setEnquiryItems(items);
      }).catch(() => {});
    }
  }, [selectedLeadId, loading, enquiries, fetchEnquiryItems]);

  const canSeeAllEnquiries = role === 'admin' || role === 'supply_chain';
  const { resolveName } = useProfileNames();
  const salesPersons = Array.from(
    new Map(
      enquiries
        .filter(e => e.sales_person_id)
        .map(e => [e.sales_person_id as string, { id: e.sales_person_id as string, name: resolveName(e.sales_person_id) }])
    ).values()
  )
    .filter(p => p.name && p.name !== '—')
    .sort((a, b) => a.name.localeCompare(b.name));

  const filteredEnquiries = enquiries.filter(e => {
    if (!canSeeAllEnquiries && e.sales_person_id !== user?.id) {
      return false;
    }

    const matchesSearch = 
      (e.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
      (e.customer_company?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
      (e.product_name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    
    const matchesCategory = categoryFilter === 'all' || e.product_category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
    const matchesSalesPerson = salesPersonFilter === 'all' || e.sales_person_id === salesPersonFilter;
    
    return matchesSearch && matchesCategory && matchesStatus && matchesSalesPerson;
  });

  const handleViewEnquiry = async (enquiry: Enquiry) => {
    setViewingEnquiry(enquiry);
    setViewDialogOpen(true);
    setLoadingItems(true);
    
    const items = await fetchEnquiryItems(enquiry.id);
    setEnquiryItems(items);
    setLoadingItems(false);
  };

  const handleEditEnquiry = (enquiry: Enquiry) => {
    setEditingEnquiry(enquiry);
    setFormDialogOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-blue-500/20 text-blue-700 border-blue-500/30';
      case 'responded': return 'bg-purple-500/20 text-purple-700 border-purple-500/30';
      case 'on_hold': return 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30';
      case 'moved_to_pipeline': return 'bg-indigo-500/20 text-indigo-700 border-indigo-500/30';
      case 'order_won': return 'bg-green-500/20 text-green-700 border-green-500/30';
      case 'order_lost': return 'bg-red-500/20 text-red-700 border-red-500/30';
      default: return 'bg-gray-500/20 text-gray-700 border-gray-500/30';
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'critical': return 'bg-red-500/20 text-red-700 border-red-500/30';
      case 'high': return 'bg-orange-500/20 text-orange-700 border-orange-500/30';
      case 'medium': return 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30';
      default: return 'bg-green-500/20 text-green-700 border-green-500/30';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Stats
  const totalEnquiries = filteredEnquiries.length;
  const pendingEnquiries = filteredEnquiries.filter(e => e.status === 'pending').length;
  const respondedEnquiries = filteredEnquiries.filter(e => e.status === 'responded').length;
  const convertedEnquiries = filteredEnquiries.filter(e => e.status === 'order_won' || e.status === 'moved_to_pipeline').length;

  return (
    <div className="space-y-6">
      {/* Inner Tabs: Dashboard / List */}
      <Tabs value={innerTab} onValueChange={setInnerTab}>
        <TabsList>
          <TabsTrigger value="dashboard" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="list" className="gap-1.5">
            <ListFilter className="h-4 w-4" />
            Enquiries List
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <EnquiriesDashboard enquiries={canSeeAllEnquiries ? enquiries : enquiries.filter(e => e.sales_person_id === user?.id)} />
        </TabsContent>

        <TabsContent value="list" className="mt-4 space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <Package className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalEnquiries}</p>
                <p className="text-xs text-muted-foreground">Total Enquiries</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 border-yellow-500/20">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/20">
                <Calendar className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingEnquiries}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <Eye className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{respondedEnquiries}</p>
                <p className="text-xs text-muted-foreground">Responded</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <ArrowRight className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{convertedEnquiries}</p>
                <p className="text-xs text-muted-foreground">Converted</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search enquiries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {ENQUIRY_STATUSES.map((status) => (
                    <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {PRODUCT_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {canSeeAllEnquiries && (
                <Select value={salesPersonFilter} onValueChange={setSalesPersonFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Sales Person" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sales</SelectItem>
                    {salesPersons.map((person) => (
                      <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button onClick={() => { setEditingEnquiry(null); setFormDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                New Enquiry
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Enquiries Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Enquiries ({filteredEnquiries.length})
          </CardTitle>
          <CardDescription>
            Manage product enquiries with multi-product and GST support
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredEnquiries.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No enquiries found</h3>
              <p className="text-muted-foreground mb-4">Create your first enquiry</p>
              <Button onClick={() => { setEditingEnquiry(null); setFormDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                New Enquiry
              </Button>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                       <TableHead>Customer</TableHead>
                       <TableHead>Company</TableHead>
                       <TableHead>Product</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                       <TableHead>Assigned To</TableHead>
                      <TableHead>Urgency</TableHead>
                      <TableHead>Status</TableHead>
                       <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                     {filteredEnquiries.map((enquiry) => (
                       <TableRow
                         key={enquiry.id}
                         className={touchedRowCn(isRowTouched('enquiries', enquiry, engagedIds), "cursor-pointer transition-colors")}
                         onClick={() => handleViewEnquiry(enquiry)}
                       >
                         <TableCell>
                           <div>
                             <p className="font-medium">{enquiry.customer_name}</p>
                              <p className="text-xs text-muted-foreground">{(enquiry as any).customer_state || ""}</p>
                           </div>
                         </TableCell>
                          <TableCell>
                            <span className="text-sm">{enquiry.customer_company || "—"}</span>
                          </TableCell>
                         <TableCell>
                           <div>
                             <p className="font-medium text-sm">{enquiry.product_name}</p>
                             <Badge variant="outline" className="text-xs mt-1">
                               {enquiry.product_category}
                             </Badge>
                           </div>
                         </TableCell>
                         <TableCell className="text-center">
                           <span className="font-medium">{enquiry.quantity}</span>
                         </TableCell>
                          <TableCell>
                             <div className="flex items-center gap-1">
                               <AssigneeCell userId={(enquiry as any).sales_person_id} name={enquiry.sales_person_name} />
                               <LinkToCompanyButton lead={{ customer_name: enquiry.customer_name, company: (enquiry as any).customer_company, phone: (enquiry as any).customer_phone, email: (enquiry as any).customer_email, city: (enquiry as any).customer_city, state: (enquiry as any).customer_state, source_label: 'Enquiry' }} />
                             </div>
                          </TableCell>
                         <TableCell>
                           <Badge variant="outline" className={cn("capitalize text-xs", getUrgencyColor(enquiry.urgency))}>
                             {enquiry.urgency}
                           </Badge>
                         </TableCell>
                         <TableCell>
                           <Badge variant="outline" className={cn("capitalize text-xs", getStatusColor(enquiry.status))}>
                             {enquiry.status.replace(/_/g, ' ')}
                           </Badge>
                         </TableCell>
                         <TableCell>
                           <span className="text-sm text-muted-foreground">
                             {format(new Date(enquiry.created_at), 'MMM dd, yyyy')}
                           </span>
                         </TableCell>
                       </TableRow>
                     ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <EnquiryFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        enquiry={editingEnquiry}
        onSuccess={() => {
          setFormDialogOpen(false);
          setEditingEnquiry(null);
          refetch();
        }}
      />

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Enquiry Details
            </DialogTitle>
            <DialogDescription>
              View enquiry information, product items, and call intelligence
            </DialogDescription>
          </DialogHeader>

          {viewingEnquiry && (
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="calls" className="flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  Call Intelligence
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-6 mt-4">
                {/* Customer Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Customer</p>
                    <p className="font-medium">{viewingEnquiry.customer_name}</p>
                    <p className="text-sm text-muted-foreground">{viewingEnquiry.customer_company}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge variant="outline" className={cn("capitalize mt-1", getStatusColor(viewingEnquiry.status))}>
                      {viewingEnquiry.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Urgency</p>
                    <Badge variant="outline" className={cn("capitalize mt-1", getUrgencyColor(viewingEnquiry.urgency))}>
                      {viewingEnquiry.urgency}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Created</p>
                    <p className="font-medium">{format(new Date(viewingEnquiry.created_at), 'MMM dd, yyyy HH:mm')}</p>
                  </div>
                </div>

                {/* Main Product */}
                <div className="border rounded-lg p-4 bg-muted/30">
                  <h4 className="font-medium mb-2">Primary Product</h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Product</p>
                      <p className="font-medium">{viewingEnquiry.product_name}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Category</p>
                      <p className="font-medium">{viewingEnquiry.product_category}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Quantity</p>
                      <p className="font-medium">{viewingEnquiry.quantity}</p>
                    </div>
                  </div>
                </div>

                {/* Additional Items */}
                {loadingItems ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : enquiryItems.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-medium">Additional Products ({enquiryItems.length})</h4>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead>Product</TableHead>
                            <TableHead className="text-center">Qty</TableHead>
                            <TableHead className="text-right">Unit Price</TableHead>
                            <TableHead className="text-center">GST</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {enquiryItems.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell>
                                <p className="font-medium">{item.product_name}</p>
                                <p className="text-xs text-muted-foreground">{item.product_category}</p>
                              </TableCell>
                              <TableCell className="text-center">{item.quantity}</TableCell>
                              <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline" className="text-xs">
                                  {item.gst_percent}%{item.price_includes_gst ? ' (incl)' : ''}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrency(item.total_amount)}
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-muted/30">
                            <TableCell colSpan={3} className="text-right font-medium">
                              Grand Total
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="text-sm text-muted-foreground">
                                GST: {formatCurrency(enquiryItems.reduce((sum, item) => sum + item.gst_amount, 0))}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-bold text-primary">
                              {formatCurrency(enquiryItems.reduce((sum, item) => sum + item.total_amount, 0))}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Notes */}
                {viewingEnquiry.notes && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm bg-muted/30 p-3 rounded-lg">{viewingEnquiry.notes}</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="calls" className="mt-4">
                <CallIntelligencePanel
                  leadId={viewingEnquiry.id}
                  customerName={viewingEnquiry.customer_name}
                />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
