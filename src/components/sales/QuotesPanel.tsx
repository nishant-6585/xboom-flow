import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useQuotes, Quote, QUOTE_STATUSES } from '@/hooks/useQuotes';
import { QuoteForm } from '@/components/billing/QuoteForm';
import { QuoteCard } from '@/components/billing/QuoteCard';
import { QuoteDetailDialog } from '@/components/billing/QuoteDetailDialog';
import { QuotesTable } from '@/components/billing/QuotesTable';
import { QuoteConversionStats } from '@/components/billing/QuoteConversionStats';
import { Plus, Search, FileText, Loader2, Filter, LayoutGrid, List } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export function QuotesPanel() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const { quotes, loading: quotesLoading, createQuote, updateQuote, updateQuoteStatus, fetchQuoteWithItems } = useQuotes();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [editQuoteData, setEditQuoteData] = useState<Quote | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');

  const canCreate = role === 'admin' || role === 'sales' || role === 'sales_manager' || role === 'supply_chain';

  const handleCreateQuote = async (data: Parameters<typeof createQuote>[0]) => {
    const success = await createQuote(data);
    if (success) setCreateDialogOpen(false);
    return success;
  };

  const handleViewQuote = (quote: Quote) => {
    setSelectedQuote(quote);
    setDetailDialogOpen(true);
  };

  const handleEditQuote = async (quote: Quote) => {
    const fullQuote = await fetchQuoteWithItems(quote.id);
    if (fullQuote) {
      setEditQuoteData(fullQuote);
      setEditDialogOpen(true);
    }
  };

  const handleUpdateQuote = async (data: Parameters<typeof createQuote>[0]) => {
    if (!editQuoteData) return false;
    const success = await updateQuote(editQuoteData.id, data, editQuoteData);
    if (success) {
      setEditDialogOpen(false);
      setEditQuoteData(null);
    }
    return success;
  };

  const handleConvertToOrder = async (quote: Quote) => {
    try {
      const fullQuote = await fetchQuoteWithItems(quote.id);
      if (!fullQuote) {
        toast.error('Failed to load quote details');
        return;
      }
      const orderData = {
        customer_name: fullQuote.customer_name,
        customer_company: fullQuote.customer_company || '',
        customer_email: fullQuote.customer_email || '',
        shipping_address: fullQuote.customer_address || '',
        items: fullQuote.items?.map(item => ({
          product_name: item.product_name,
          product_code: item.product_code || '',
          product_category: 'Consumer Drones',
          quantity: item.quantity,
          unit_price: item.unit_price,
          sales_gst_percent: item.gst_percent,
          sales_gst_amount: item.gst_amount,
        })) || [],
        quote_id: quote.id,
        quote_number: quote.quote_number,
      };
      sessionStorage.setItem('quoteToOrder', JSON.stringify(orderData));
      await updateQuoteStatus(quote.id, 'converted');
      toast.success('Redirecting to create order from quote...');
      navigate('/orders?from=quote');
    } catch (error) {
      console.error('Error converting quote to order:', error);
      toast.error('Failed to convert quote to order');
    }
  };

  const handleConvertToInvoice = async () => {
    toast.info('Convert this quote into an order — the Proforma/Invoice will be generated from the Order details.');
  };

  const filteredQuotes = quotes.filter(quote => {
    const matchesSearch =
      quote.quote_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      quote.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (quote.customer_company?.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || quote.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Quotes</h2>
          <p className="text-sm text-muted-foreground">Create quotations for prospects and convert won quotes into orders.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Quote
          </Button>
        )}
      </div>

      {!quotesLoading && quotes.length > 0 && (
        <QuoteConversionStats quotes={quotes} />
      )}

      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search quotes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {QUOTE_STATUSES.map(status => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ToggleGroup
                type="single"
                value={viewMode}
                onValueChange={(value) => value && setViewMode(value as 'grid' | 'list')}
                className="border rounded-md"
              >
                <ToggleGroupItem value="list" aria-label="List view" className="px-3">
                  <List className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="grid" aria-label="Grid view" className="px-3">
                  <LayoutGrid className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </CardContent>
      </Card>

      {quotesLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredQuotes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No quotes found</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Create your first quote to get started'}
            </p>
            {canCreate && !searchQuery && statusFilter === 'all' && (
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Quote
              </Button>
            )}
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredQuotes.map(quote => (
            <QuoteCard
              key={quote.id}
              quote={quote}
              onView={handleViewQuote}
              onEdit={handleEditQuote}
            />
          ))}
        </div>
      ) : (
        <QuotesTable
          quotes={filteredQuotes}
          onView={handleViewQuote}
          onEdit={handleEditQuote}
          onConvertToOrder={handleConvertToOrder}
          onConvertToInvoice={handleConvertToInvoice}
        />
      )}

      {/* Create Quote Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Create New Quote
            </DialogTitle>
            <DialogDescription>
              Create a quotation for your customer with product details and pricing
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[75vh] pr-4">
            <QuoteForm
              onSubmit={handleCreateQuote}
              onCancel={() => setCreateDialogOpen(false)}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Quote Detail Dialog */}
      <QuoteDetailDialog
        quote={selectedQuote}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        onEdit={handleEditQuote}
      />

      {/* Edit Quote Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) setEditQuoteData(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Edit Quote - {editQuoteData?.quote_number}
            </DialogTitle>
            <DialogDescription>
              Update the quotation details and pricing
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[75vh] pr-4">
            {editQuoteData && (
              <QuoteForm
                onSubmit={handleUpdateQuote}
                onCancel={() => { setEditDialogOpen(false); setEditQuoteData(null); }}
                initialData={{
                  customer_name: editQuoteData.customer_name,
                  customer_company: editQuoteData.customer_company || '',
                  customer_email: editQuoteData.customer_email || '',
                  customer_phone: editQuoteData.customer_phone || '',
                  customer_address: editQuoteData.customer_address || '',
                  customer_gst: editQuoteData.customer_gst || '',
                  customer_state: editQuoteData.customer_state || '',
                  discount_amount: editQuoteData.discount_amount,
                  discount_percent: editQuoteData.discount_percent,
                  valid_until: editQuoteData.valid_until || '',
                  notes: editQuoteData.notes || '',
                  terms_and_conditions: editQuoteData.terms_and_conditions || '',
                  items: editQuoteData.items || [],
                }}
              />
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}