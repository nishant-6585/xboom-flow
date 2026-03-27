import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEmailLeads, MAIL_SOURCES, EmailLead } from '@/hooks/useEmailLeads';
import { useProspects } from '@/hooks/useProspects';
import { useAuth } from '@/hooks/useAuth';
import { PRODUCT_CATEGORIES } from '@/hooks/useEnquiries';
import { Search, Plus, Mail, Loader2, Filter, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { ProspectButton } from './ProspectButton';
import { ProspectAnalyticsCards } from './ProspectAnalyticsCards';
import { EmailLeadFormDialog } from './EmailLeadFormDialog';
import { DateRangeFilter } from '@/components/DateRangeFilter';

export function EmailLeadsPanel() {
  const { leads, loading, refetch } = useEmailLeads();
  const { markAsProspect, markAsACategory } = useProspects();
  const { role } = useAuth();
  const [search, setSearch] = useState('');
  const [mailSourceFilter, setMailSourceFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editLead, setEditLead] = useState<EmailLead | null>(null);
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({ from: null, to: null });

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchesSearch = !search || 
        lead.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
        lead.email?.toLowerCase().includes(search.toLowerCase()) ||
        lead.phone_number?.toLowerCase().includes(search.toLowerCase()) ||
        lead.product_name?.toLowerCase().includes(search.toLowerCase()) ||
        lead.customer_company?.toLowerCase().includes(search.toLowerCase());
      const matchesMail = mailSourceFilter === 'all' || lead.mail_source === mailSourceFilter;
      const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
      const matchesDate = (!dateRange.from || new Date(lead.created_at) >= dateRange.from) &&
        (!dateRange.to || new Date(lead.created_at) <= dateRange.to);
      return matchesSearch && matchesMail && matchesStatus && matchesDate;
    });
  }, [leads, search, mailSourceFilter, statusFilter, dateRange]);

  const statusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30';
      case 'responded': return 'bg-green-500/10 text-green-600 border-green-500/30';
      case 'on_hold': return 'bg-muted text-muted-foreground';
      case 'moved_to_pipeline': return 'bg-blue-500/10 text-blue-600 border-blue-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const mailBadgeColor = (source: string) => {
    switch (source) {
      case 'hello@xboom.in': return 'bg-primary/10 text-primary border-primary/30';
      case 'contact@xboom.in': return 'bg-blue-500/10 text-blue-600 border-blue-500/30';
      case 'sales@xboom.in': return 'bg-green-500/10 text-green-600 border-green-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-6">
      <ProspectAnalyticsCards sourceType="email" />

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              Email Leads
              <Badge variant="secondary" className="ml-2">{filteredLeads.length}</Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="w-4 h-4 mr-1" /> Refresh
              </Button>
              <Button size="sm" onClick={() => { setEditLead(null); setFormOpen(true); }}>
                <Plus className="w-4 h-4 mr-1" /> Add Email Lead
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mt-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search leads..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={mailSourceFilter} onValueChange={setMailSourceFilter}>
              <SelectTrigger className="w-[200px]">
                <Filter className="w-4 h-4 mr-1" />
                <SelectValue placeholder="Mail Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {MAIL_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="responded">Responded</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
                <SelectItem value="moved_to_pipeline">Pipeline</SelectItem>
              </SelectContent>
            </Select>
            <DateRangeFilter dateRange={dateRange} onDateRangeChange={setDateRange} />
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Mail className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No email leads found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">P / A</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Mail Source</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <div className="flex gap-1">
                          <ProspectButton
                            type="prospect"
                            isActive={lead.is_prospect}
                            onClick={() => markAsProspect({
                              source_type: 'email',
                              source_id: lead.id,
                              customer_name: lead.customer_name,
                              customer_company: lead.customer_company || '',
                              phone_number: lead.phone_number || '',
                              email: lead.email || '',
                              city: lead.city || '',
                              product_name: lead.product_name || '',
                              product_category: lead.product_category || '',
                              quantity: lead.quantity || 1,
                              notes: lead.notes || '',
                            })}
                          />
                          <ProspectButton
                            type="a_category"
                            isActive={lead.is_a_category}
                            onClick={() => markAsACategory({
                              source_type: 'email',
                              source_id: lead.id,
                              customer_name: lead.customer_name,
                              customer_company: lead.customer_company || '',
                              phone_number: lead.phone_number || '',
                              email: lead.email || '',
                              city: lead.city || '',
                              product_name: lead.product_name || '',
                              product_category: lead.product_category || '',
                              quantity: lead.quantity || 1,
                              notes: lead.notes || '',
                            })}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{lead.customer_name}</TableCell>
                      <TableCell>{lead.customer_company || '-'}</TableCell>
                      <TableCell>{lead.email || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={mailBadgeColor(lead.mail_source)}>
                          {lead.mail_source}
                        </Badge>
                      </TableCell>
                      <TableCell>{lead.product_name || '-'}</TableCell>
                      <TableCell>{lead.product_category || '-'}</TableCell>
                      <TableCell>{lead.quantity || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColor(lead.status)}>
                          {lead.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(lead.created_at), 'dd MMM yyyy')}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => { setEditLead(lead); setFormOpen(true); }}>
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <EmailLeadFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        lead={editLead}
        onSuccess={() => { setFormOpen(false); refetch(); }}
      />
    </div>
  );
}
