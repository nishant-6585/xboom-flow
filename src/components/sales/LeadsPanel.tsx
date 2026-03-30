import { useState, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GoogleAdsSyncPanel } from '@/components/sales/GoogleAdsSyncPanel';
import { useEnquiries, PRODUCT_CATEGORIES, Enquiry } from '@/hooks/useEnquiries';
import { useInteraktLeads, InteraktLead } from '@/hooks/useInteraktLeads';
import { useProspects } from '@/hooks/useProspects';
import { useAttentionItems } from '@/hooks/useAttentionItems';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { 
  Upload, FileSpreadsheet, Download, Search, Plus, Users, 
  Package, Building2, Calendar, Filter, Loader2, Eye, ArrowRight, Pencil,
  RefreshCw, Phone, MessageCircle, MapPin
} from 'lucide-react';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, addDays } from 'date-fns';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { LeadFormDialog } from './LeadFormDialog';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { InteraktLeadEditDialog } from '@/components/interakt/InteraktLeadEditDialog';
import { CallLogsPanel } from '@/components/admin/CallLogsPanel';
import { ProspectButton } from './ProspectButton';
import { AttentionButton } from './AttentionButton';
import { EnquiryConvertButton } from './EnquiryConvertButton';
import { ProspectAnalyticsCards } from './ProspectAnalyticsCards';
import { EmailLeadsPanel } from './EmailLeadsPanel';
import { FormsLeadsPanel } from './FormsLeadsPanel';
import { Mail, FileText, Megaphone } from 'lucide-react';
import { MyOperatorAnalytics } from './MyOperatorAnalytics';
import { MyOperatorTabContent } from './MyOperatorTabContent';
import { InteraktAnalytics } from './InteraktAnalytics';

const LEAD_SOURCES = [
  'Website',
  'IndiaMART',
  'Trade India',
  'Just Dial',
  'Google Ads',
  'Facebook',
  'Instagram',
  'LinkedIn',
  'WhatsApp',
  'Interakt',
  'Referral',
  'Cold Call',
  'Exhibition',
  'Email Campaign',
  'Other',
] as const;

export function LeadsPanel() {
  const { enquiries, loading, refetch } = useEnquiries();
  const { leads: interaktLeads, loading: interaktLoading, syncFromInterakt, syncing, updateLead, updating } = useInteraktLeads();
  const { prospects } = useProspects();
  const { items: attentionItems } = useAttentionItems();
  const { user, profile, role } = useAuth();

  // Build set of already-prospect source IDs for quick lookup
  const prospectSourceIds = useMemo(() => {
    const set = new Set<string>();
    prospects.forEach(p => set.add(`${p.source_type}:${p.source_id}`));
    return set;
  }, [prospects]);

  // Build set of already-attention source IDs
  const attentionSourceIds = useMemo(() => {
    const set = new Set<string>();
    attentionItems.forEach(a => set.add(`${a.source_type}:${a.source_id}`));
    return set;
  }, [attentionItems]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [salesPersonFilter, setSalesPersonFilter] = useState<string>('all');
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Enquiry | null>(null);
  const [dateStart, setDateStart] = useState<Date | undefined>();
  const [dateEnd, setDateEnd] = useState<Date | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [interaktSearch, setInteraktSearch] = useState('');
  const [interaktStatusFilter, setInteraktStatusFilter] = useState('all');
  const [interaktDateFilter, setInteraktDateFilter] = useState('all');
  const [interaktDateStart, setInteraktDateStart] = useState<Date | undefined>();
  const [interaktDateEnd, setInteraktDateEnd] = useState<Date | undefined>();
  const [editingInteraktLead, setEditingInteraktLead] = useState<InteraktLead | null>(null);
  const [interaktEditOpen, setInteraktEditOpen] = useState(false);

  // Check edit permission for Interakt leads
  const canEditInteraktLeads = role === 'admin' || role === 'sales' || role === 'sales_manager';

  // Filter Interakt leads
  const filteredInteraktLeads = interaktLeads.filter((lead) => {
    const matchesSearch = !interaktSearch || 
      lead.customer_name.toLowerCase().includes(interaktSearch.toLowerCase()) ||
      lead.phone_number.includes(interaktSearch) ||
      (lead.city && lead.city.toLowerCase().includes(interaktSearch.toLowerCase())) ||
      (lead.product_name && lead.product_name.toLowerCase().includes(interaktSearch.toLowerCase())) ||
      (lead.company && lead.company.toLowerCase().includes(interaktSearch.toLowerCase()));
    const matchesStatus = interaktStatusFilter === 'all' || lead.status === interaktStatusFilter;
    
    // Preset date filter
    let matchesDate = true;
    if (interaktDateFilter !== 'all') {
      const dateStr = lead.interakt_created_at || lead.created_at;
      const d = new Date(dateStr);
      const now = new Date();
      if (interaktDateFilter === 'today') matchesDate = d >= startOfDay(now) && d <= endOfDay(now);
      else if (interaktDateFilter === 'this_week') matchesDate = d >= startOfWeek(now) && d <= endOfWeek(now);
      else if (interaktDateFilter === 'this_month') matchesDate = d >= startOfMonth(now) && d <= endOfMonth(now);
      else if (interaktDateFilter === 'last_month') { const lm = subMonths(now, 1); matchesDate = d >= startOfMonth(lm) && d <= endOfMonth(lm); }
    }

    // Custom date range filter
    if (interaktDateStart || interaktDateEnd) {
      const dateStr = lead.interakt_created_at || lead.created_at;
      const d = new Date(dateStr);
      if (interaktDateStart && d < startOfDay(interaktDateStart)) matchesDate = false;
      if (interaktDateEnd && d > endOfDay(interaktDateEnd)) matchesDate = false;
    }

    return matchesSearch && matchesStatus && matchesDate;
  });

  // Check if user can see all leads (admin, supply_chain, or sales_manager)
  const canSeeAllLeads = role === 'admin' || role === 'supply_chain' || role === 'sales_manager';

  // Get unique sales persons for filter dropdown
  const salesPersons = Array.from(new Set(enquiries.map(e => e.sales_person_name))).filter(Boolean).sort();

  // Filter leads based on role and filters
  const leads = enquiries.filter(e => {
    // Role-based visibility: sales sees only their own, admin/supply_chain sees all
    if (!canSeeAllLeads && e.sales_person_id !== user?.id) {
      return false;
    }

    const matchesSearch = 
      e.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.customer_company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.product_name.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = categoryFilter === 'all' || e.product_category === categoryFilter;
    
    // For source filter, check notes field (where lead source is stored)
    const matchesSource = sourceFilter === 'all' || e.notes?.toLowerCase().includes(sourceFilter.toLowerCase());
    
    // Filter by sales person (only applicable if user can see all leads)
    const matchesSalesPerson = salesPersonFilter === 'all' || e.sales_person_name === salesPersonFilter;

    // Date filter
    const leadDate = new Date(e.created_at);
    const matchesDate = (!dateStart || leadDate >= startOfDay(dateStart)) && (!dateEnd || leadDate <= endOfDay(dateEnd));
    
    return matchesSearch && matchesCategory && matchesSource && matchesSalesPerson && matchesDate;
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !profile) return;

    setImportLoading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const parsedLeads = jsonData.map((row: any) => ({
        product_name: row['Product Name'] || row['product_name'] || row['Product'] || '',
        product_code: row['Product Code'] || row['product_code'] || row['SKU'] || 'N/A',
        product_category: PRODUCT_CATEGORIES.includes(row['Product Category'] || row['product_category'] || row['Category']) 
          ? (row['Product Category'] || row['product_category'] || row['Category']) 
          : 'Consumer Drones',
        quantity: parseInt(row['Quantity'] || row['quantity'] || row['Qty'] || '1') || 1,
        customer_name: row['Customer Name'] || row['customer_name'] || row['Name'] || row['Contact'] || '',
        customer_company: row['Company'] || row['customer_company'] || row['Company Name'] || row['Organization'] || '',
        sales_person_id: user.id,
        sales_person_name: profile.name,
        urgency: (['low', 'medium', 'high', 'critical'].includes((row['Urgency'] || row['urgency'] || 'medium').toLowerCase()))
          ? (row['Urgency'] || row['urgency'] || 'medium').toLowerCase()
          : 'medium',
        requested_timeline: row['Timeline'] || row['requested_timeline'] || row['Delivery Timeline'] || null,
        notes: `Lead Source: ${row['Lead Source'] || row['lead_source'] || row['Source'] || 'Unknown'}${row['Notes'] || row['notes'] ? ` | ${row['Notes'] || row['notes']}` : ''}`,
        status: 'pending',
      })).filter((item: any) => item.product_name && item.customer_name);

      if (parsedLeads.length === 0) {
        toast.error('No valid leads found. Ensure "Product Name" and "Customer Name" columns exist.');
        setImportLoading(false);
        return;
      }

      const { error } = await supabase.from('enquiries').insert(parsedLeads);

      if (error) throw error;

      toast.success(`${parsedLeads.length} leads imported successfully!`);
      setImportDialogOpen(false);
      refetch();
    } catch (error) {
      console.error('Error importing leads:', error);
      toast.error('Failed to import leads');
    } finally {
      setImportLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const downloadTemplate = () => {
    const templateData = [
      {
        'Customer Name': 'John Doe',
        'Company': 'ABC Corp',
        'Product Name': 'DJI Mavic 3',
        'Product Code': 'DJI-M3-001',
        'Product Category': 'Consumer Drones',
        'Quantity': 2,
        'Lead Source': 'IndiaMART',
        'Urgency': 'medium',
        'Timeline': '2 weeks',
        'Notes': 'Customer interested in bulk purchase',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');
    XLSX.writeFile(wb, 'leads_import_template.xlsx');
    toast.success('Template downloaded');
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'critical': return 'bg-red-500/20 text-red-700 border-red-500/30';
      case 'high': return 'bg-orange-500/20 text-orange-700 border-orange-500/30';
      case 'medium': return 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30';
      default: return 'bg-green-500/20 text-green-700 border-green-500/30';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-blue-500/20 text-blue-700';
      case 'responded': return 'bg-purple-500/20 text-purple-700';
      case 'moved_to_pipeline': return 'bg-indigo-500/20 text-indigo-700';
      case 'order_won': return 'bg-green-500/20 text-green-700';
      case 'order_lost': return 'bg-red-500/20 text-red-700';
      default: return 'bg-gray-500/20 text-gray-700';
    }
  };

  const extractLeadSource = (notes: string | null): string => {
    if (!notes) return 'Unknown';
    const match = notes.match(/Lead Source:\s*([^|]+)/i);
    return match ? match[1].trim() : 'Unknown';
  };

  const getSourceBadge = (source: string) => {
    if (source.toLowerCase() === 'interakt') {
      return (
        <Badge className="bg-emerald-500/20 text-emerald-700 border-emerald-500/30 text-xs gap-1">
          <MessageCircle className="h-3 w-3" />
          Interakt
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="text-xs">
        {source}
      </Badge>
    );
  };

  // Stats
  const totalLeads = leads.length;
  const pendingLeads = leads.filter(l => l.status === 'pending').length;
  const respondedLeads = leads.filter(l => l.status === 'responded').length;
  const convertedLeads = leads.filter(l => l.status === 'order_won' || l.status === 'moved_to_pipeline').length;

  return (
    <Tabs defaultValue="leads" className="space-y-6">
      <TabsList>
        <TabsTrigger value="leads">All Leads</TabsTrigger>
        <TabsTrigger value="interakt" className="gap-1.5">
          <MessageCircle className="h-3.5 w-3.5" />
          Interakt
          {interaktLeads.length > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{interaktLeads.length}</Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="myoperator" className="gap-1.5">
          <Phone className="h-3.5 w-3.5" />
          MyOperator
        </TabsTrigger>
        <TabsTrigger value="emails" className="gap-1.5">
          <Mail className="h-3.5 w-3.5" />
          Emails
        </TabsTrigger>
        <TabsTrigger value="form-leads" className="gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          Forms
        </TabsTrigger>
      </TabsList>

      <TabsContent value="leads" className="space-y-6">
    <div className="space-y-6">
      {/* Prospect Analytics */}
      <ProspectAnalyticsCards prospects={prospects} sourceType="enquiry" />
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalLeads}</p>
                <p className="text-xs text-muted-foreground">Total Leads</p>
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
                <p className="text-2xl font-bold">{pendingLeads}</p>
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
                <p className="text-2xl font-bold">{respondedLeads}</p>
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
                <p className="text-2xl font-bold">{convertedLeads}</p>
                <p className="text-xs text-muted-foreground">Converted</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions & Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search leads by customer, company, or product..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-[150px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  {LEAD_SOURCES.map((source) => (
                    <SelectItem key={source} value={source.toLowerCase()}>{source}</SelectItem>
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
              {canSeeAllLeads && (
                <Select value={salesPersonFilter} onValueChange={setSalesPersonFilter}>
                  <SelectTrigger className="w-[150px]">
                    <Users className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Sales Person" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sales</SelectItem>
                    {salesPersons.map((person) => (
                      <SelectItem key={person} value={person}>{person}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <DateRangeFilter
                startDate={dateStart}
                endDate={dateEnd}
                onStartDateChange={setDateStart}
                onEndDateChange={setDateEnd}
                onClear={() => { setDateStart(undefined); setDateEnd(undefined); }}
              />
              <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Button>
              <Button onClick={() => { setEditingLead(null); setFormDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Add Lead
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Leads Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Leads ({leads.length})
          </CardTitle>
          <CardDescription>
            View and manage enquiries from different lead sources
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : leads.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No leads found</h3>
              <p className="text-muted-foreground mb-4">
                Add a new lead or import from Excel
              </p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Import
                </Button>
                <Button onClick={() => { setEditingLead(null); setFormDialogOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Lead
                </Button>
              </div>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                     <TableRow className="bg-muted/50">
                      <TableHead className="w-[70px]">P / ⚠</TableHead>
                      <TableHead className="w-[180px]">Customer</TableHead>
                      <TableHead className="w-[180px]">Product</TableHead>
                      <TableHead className="w-[60px]">Qty</TableHead>
                      <TableHead className="w-[100px]">Source</TableHead>
                      {canSeeAllLeads && <TableHead className="w-[120px]">Sales Person</TableHead>}
                      <TableHead className="w-[80px]">Urgency</TableHead>
                      <TableHead className="w-[100px]">Status</TableHead>
                      <TableHead className="w-[100px]">Date</TableHead>
                      <TableHead className="w-[60px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map((lead) => (
                      <TableRow key={lead.id} className="hover:bg-muted/50">
                        <TableCell>
                          <div className="flex gap-1">
                            <ProspectButton
                              sourceType="enquiry"
                              sourceId={lead.id}
                              customerName={lead.customer_name}
                              company={lead.customer_company}
                              productName={lead.product_name}
                              notes={lead.notes}
                              isAlreadyProspect={prospectSourceIds.has(`enquiry:${lead.id}`)}
                            />
                            <AttentionButton
                              sourceType="enquiry"
                              sourceId={lead.id}
                              customerName={lead.customer_name}
                              company={lead.customer_company}
                              productName={lead.product_name}
                              notes={lead.notes}
                              isAlreadyAttention={attentionSourceIds.has(`enquiry:${lead.id}`)}
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{lead.customer_name}</p>
                            <p className="text-xs text-muted-foreground">{lead.customer_company}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{lead.product_name}</p>
                            <Badge variant="outline" className="text-xs mt-1">
                              {lead.product_category}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{lead.quantity}</span>
                        </TableCell>
                        <TableCell>
                          {getSourceBadge(extractLeadSource(lead.notes))}
                        </TableCell>
                        {canSeeAllLeads && (
                          <TableCell>
                            <span className="text-sm">{lead.sales_person_name}</span>
                          </TableCell>
                        )}
                        <TableCell>
                          <Badge className={`${getUrgencyColor(lead.urgency)} capitalize text-xs`}>
                            {lead.urgency}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${getStatusColor(lead.status)} capitalize text-xs`}>
                            {lead.status.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(lead.created_at), 'dd MMM')}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              setEditingLead(lead);
                              setFormDialogOpen(true);
                            }}
                            title="Edit Lead"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
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

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Import Leads
            </DialogTitle>
            <DialogDescription>
              Upload an Excel file to bulk import leads from various sources.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                Required columns: <strong>Customer Name</strong>, <strong>Product Name</strong>
              </p>
              <p className="text-sm text-muted-foreground">
                Recommended columns: Company, Product Code, Product Category, Quantity, Lead Source, Urgency, Timeline, Notes
              </p>
            </div>
            <Button variant="outline" onClick={downloadTemplate} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Download Template
            </Button>
            <div className="border-t pt-4">
              <input
                type="file"
                ref={fileInputRef}
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={importLoading}
                className="w-full"
              >
                {importLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Select Excel File
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lead Form Dialog (Add/Edit) */}
      <LeadFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        lead={editingLead}
        onSuccess={refetch}
      />
    </div>
      </TabsContent>

      {/* Interakt Tab */}
      <TabsContent value="interakt" className="space-y-6">
        <div className="space-y-6">
          {/* Prospect Analytics for Interakt */}
          <ProspectAnalyticsCards prospects={prospects} sourceType="interakt" />

          {/* Interakt Analytics Dashboard */}
          <InteraktAnalytics leads={interaktLeads} prospects={prospects} />

          {/* Interakt Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/20">
                    <MessageCircle className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{interaktLeads.length}</p>
                    <p className="text-xs text-muted-foreground">Total Interakt Leads</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/20">
                    <Users className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{interaktLeads.filter(l => l.status === 'new').length}</p>
                    <p className="text-xs text-muted-foreground">New</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sync Button */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Interakt Contact Sync</h3>
                  <p className="text-sm text-muted-foreground">Fetch latest contacts from Interakt and create leads</p>
                </div>
                <Button 
                  onClick={() => syncFromInterakt()} 
                  disabled={syncing}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {syncing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Sync from Interakt
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Interakt Leads Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-emerald-600" />
                Interakt Leads ({filteredInteraktLeads.length})
              </CardTitle>
              <CardDescription>
                Leads synced from Interakt WhatsApp platform
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filters */}
              <div className="flex flex-wrap gap-3 items-end">
                <div className="relative flex-1 min-w-[200px] max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search name, phone, city, product..."
                    value={interaktSearch}
                    onChange={(e) => setInteraktSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={interaktStatusFilter} onValueChange={setInteraktStatusFilter}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="contacted">Contacted</SelectItem>
                    <SelectItem value="qualified">Qualified</SelectItem>
                    <SelectItem value="converted">Converted</SelectItem>
                    <SelectItem value="lost">Lost</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={interaktDateFilter} onValueChange={(v) => { setInteraktDateFilter(v); if (v !== 'all') { setInteraktDateStart(undefined); setInteraktDateEnd(undefined); } }}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Date range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="this_week">This Week</SelectItem>
                    <SelectItem value="this_month">This Month</SelectItem>
                    <SelectItem value="last_month">Last Month</SelectItem>
                  </SelectContent>
                </Select>
                <DateRangeFilter
                  startDate={interaktDateStart}
                  endDate={interaktDateEnd}
                  onStartDateChange={(d) => { setInteraktDateStart(d); setInteraktDateFilter('all'); }}
                  onEndDateChange={(d) => { setInteraktDateEnd(d); setInteraktDateFilter('all'); }}
                  onClear={() => { setInteraktDateStart(undefined); setInteraktDateEnd(undefined); }}
                />
                {(interaktSearch || interaktStatusFilter !== 'all' || interaktDateFilter !== 'all' || interaktDateStart || interaktDateEnd) && (
                  <Button variant="ghost" size="sm" onClick={() => { setInteraktSearch(''); setInteraktStatusFilter('all'); setInteraktDateFilter('all'); setInteraktDateStart(undefined); setInteraktDateEnd(undefined); }}>
                    Clear filters
                  </Button>
                )}
              </div>

              {interaktLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredInteraktLeads.length === 0 ? (
                <div className="text-center py-12">
                  <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-medium mb-2">
                    {interaktLeads.length === 0 ? 'No Interakt leads yet' : 'No leads match filters'}
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    {interaktLeads.length === 0
                      ? 'Click "Sync from Interakt" to fetch your WhatsApp contacts'
                      : 'Try adjusting your search or filter criteria'}
                  </p>
                  {interaktLeads.length === 0 && (
                    <Button 
                      onClick={() => syncFromInterakt()} 
                      disabled={syncing}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Sync from Interakt
                    </Button>
                  )}
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="w-[70px]">P / ⚠</TableHead>
                          <TableHead className="w-[160px]">Customer Name</TableHead>
                          <TableHead className="w-[140px]">Phone Number</TableHead>
                          <TableHead className="w-[120px]">Company</TableHead>
                          <TableHead className="w-[100px]">City</TableHead>
                          <TableHead className="w-[120px]">Product</TableHead>
                          <TableHead className="w-[150px]">Email</TableHead>
                          <TableHead className="w-[80px]">Status</TableHead>
                          <TableHead className="w-[100px]">Created On</TableHead>
                          {canEditInteraktLeads && <TableHead className="w-[60px]">Action</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredInteraktLeads.map((lead) => (
                          <TableRow key={lead.id} className="hover:bg-muted/50">
                            <TableCell>
                              <div className="flex gap-1">
                                <ProspectButton
                                  sourceType="interakt"
                                  sourceId={lead.id}
                                  customerName={lead.customer_name}
                                  phoneNumber={lead.phone_number}
                                  email={lead.email}
                                  company={lead.company}
                                  city={lead.city}
                                  productName={lead.product_name}
                                  notes={lead.notes}
                                  isAlreadyProspect={prospectSourceIds.has(`interakt:${lead.id}`)}
                                />
                                <AttentionButton
                                  sourceType="interakt"
                                  sourceId={lead.id}
                                  customerName={lead.customer_name}
                                  phoneNumber={lead.phone_number}
                                  email={lead.email}
                                  company={lead.company}
                                  city={lead.city}
                                  productName={lead.product_name}
                                  notes={lead.notes}
                                  isAlreadyAttention={attentionSourceIds.has(`interakt:${lead.id}`)}
                                />
                                <EnquiryConvertButton
                                  sourceType="interakt"
                                  sourceId={lead.id}
                                  customerName={lead.customer_name}
                                  phoneNumber={lead.phone_number}
                                  email={lead.email}
                                  company={lead.company}
                                  city={lead.city}
                                  productName={lead.product_name}
                                  productCategory={lead.product_category}
                                  productCode={lead.product_code}
                                  quantity={lead.quantity}
                                  urgency={lead.urgency}
                                  requestedTimeline={lead.requested_timeline}
                                  purposeOfPurchase={lead.purpose_of_purchase}
                                  notes={lead.notes}
                                />
                              </div>
                            </TableCell>
                            <TableCell>
                              <p className="font-medium">{lead.customer_name}</p>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-sm font-mono">{lead.phone_number}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">{lead.company || '—'}</span>
                            </TableCell>
                            <TableCell>
                              {lead.city ? (
                                <div className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-sm">{lead.city}</span>
                                </div>
                              ) : (
                                <span className="text-sm text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">{lead.product_name || '—'}</span>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-muted-foreground">{lead.email || '—'}</span>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="capitalize text-xs">
                                {lead.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground">
                                {lead.interakt_created_at
                                  ? format(new Date(lead.interakt_created_at), 'dd/MM/yyyy')
                                  : '—'}
                              </span>
                            </TableCell>
                            {canEditInteraktLeads && (
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    setEditingInteraktLead(lead);
                                    setInteraktEditOpen(true);
                                  }}
                                  title="Edit Lead"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Interakt Edit Dialog */}
        <InteraktLeadEditDialog
          open={interaktEditOpen}
          onOpenChange={setInteraktEditOpen}
          lead={editingInteraktLead}
          onSave={async (data) => {
            await updateLead({ ...data, updated_by: user?.id || null });
          }}
          saving={updating}
        />
      </TabsContent>

      <TabsContent value="myoperator">
        <MyOperatorTabContent prospects={prospects} prospectSourceIds={prospectSourceIds} attentionSourceIds={attentionSourceIds} />
      </TabsContent>

      <TabsContent value="emails">
        <EmailLeadsPanel />
      </TabsContent>

      <TabsContent value="form-leads">
        <FormsLeadsPanel />
      </TabsContent>
    </Tabs>
  );
}
