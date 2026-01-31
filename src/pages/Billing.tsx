import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Plus, Search, FileText, Receipt, Loader2, Filter, LayoutGrid, List } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export default function Billing() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const { quotes, loading, createQuote, updateQuoteStatus, fetchQuoteWithItems } = useQuotes();
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const handleCreateQuote = async (data: Parameters<typeof createQuote>[0]) => {
    const success = await createQuote(data);
    if (success) {
      setCreateDialogOpen(false);
    }
    return success;
  };

  const handleViewQuote = (quote: Quote) => {
    setSelectedQuote(quote);
    setDetailDialogOpen(true);
  };

  const handleConvertToOrder = async (quote: Quote) => {
    try {
      // Fetch full quote with items
      const fullQuote = await fetchQuoteWithItems(quote.id);
      if (!fullQuote) {
        toast.error('Failed to load quote details');
        return;
      }

      // Store quote data in session storage for the orders page to pick up
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
      
      // Update quote status to converted
      await updateQuoteStatus(quote.id, 'converted');
      
      toast.success('Redirecting to create order from quote...');
      navigate('/orders?from=quote');
    } catch (error) {
      console.error('Error converting quote to order:', error);
      toast.error('Failed to convert quote to order');
    }
  };

  const handleConvertToInvoice = async (quote: Quote) => {
    // For now, show a message that invoices are coming soon
    toast.info('Invoice generation feature is coming soon!');
  };

  const filteredQuotes = quotes.filter(quote => {
    const matchesSearch = 
      quote.quote_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      quote.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (quote.customer_company?.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesStatus = statusFilter === 'all' || quote.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const canCreate = role === 'admin' || role === 'sales' || role === 'supply_chain';

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <Header />

      <main className="container mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Billing</h1>
            <p className="text-muted-foreground">Create and manage quotes & invoices</p>
          </div>
          {canCreate && (
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Quote
            </Button>
          )}
        </div>

        <Tabs defaultValue="quotes" className="space-y-6">
          <TabsList>
            <TabsTrigger value="quotes" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Quotes
            </TabsTrigger>
            <TabsTrigger value="invoices" className="flex items-center gap-2" disabled>
              <Receipt className="h-4 w-4" />
              Invoices (Coming Soon)
            </TabsTrigger>
          </TabsList>

          <TabsContent value="quotes" className="space-y-4">
            {/* Conversion Stats */}
            {!loading && quotes.length > 0 && (
              <QuoteConversionStats quotes={quotes} />
            )}

            {/* Filters */}
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
                      <ToggleGroupItem value="grid" aria-label="Grid view" className="px-3">
                        <LayoutGrid className="h-4 w-4" />
                      </ToggleGroupItem>
                      <ToggleGroupItem value="list" aria-label="List view" className="px-3">
                        <List className="h-4 w-4" />
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quotes Display */}
            {loading ? (
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
                  />
                ))}
              </div>
            ) : (
              <QuotesTable 
                quotes={filteredQuotes} 
                onView={handleViewQuote}
                onConvertToOrder={handleConvertToOrder}
                onConvertToInvoice={handleConvertToInvoice}
              />
            )}
          </TabsContent>

          <TabsContent value="invoices">
            <Card>
              <CardContent className="py-12 text-center">
                <Receipt className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Invoices Coming Soon</h3>
                <p className="text-muted-foreground">
                  Invoice generation feature is under development.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

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
      />

      <MobileBottomNav />
    </div>
  );
}
