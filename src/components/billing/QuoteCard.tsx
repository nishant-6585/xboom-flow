import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Quote, QuoteStatus, QUOTE_STATUSES, useQuotes } from '@/hooks/useQuotes';
import { downloadQuotePdf } from '@/lib/quotePdfGenerator';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { 
  MoreVertical, 
  Download, 
  Eye, 
  Trash2, 
  User, 
  Building2, 
  Calendar,
  IndianRupee,
  Send,
  CheckCircle2,
  XCircle,
  ShoppingCart,
  FileText,
  Pencil,
  CreditCard,
  StickyNote,
  UserCheck
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { PAYMENT_TERMS_OPTIONS } from '@/hooks/useQuotes';

interface QuoteCardProps {
  quote: Quote;
  onView: (quote: Quote) => void;
  onEdit?: (quote: Quote) => void;
}

export function QuoteCard({ quote, onView, onEdit }: QuoteCardProps) {
  const navigate = useNavigate();
  const { role } = useAuth();
  const { fetchQuoteWithItems, updateQuoteStatus, deleteQuote, approveQuote } = useQuotes();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const statusConfig = QUOTE_STATUSES.find(s => s.value === quote.status);
  const isConverted = quote.status === 'converted';
  const isLost = quote.status === 'rejected' || quote.status === 'expired';
  const canConvert = !isConverted && !isLost;
  const canApprove = !quote.approved_by && (role === 'admin' || role === 'supply_chain');

  const handleDownloadPdf = async () => {
    setLoading(true);
    try {
      const fullQuote = await fetchQuoteWithItems(quote.id);
      if (fullQuote && fullQuote.items) {
        downloadQuotePdf(fullQuote, fullQuote.items);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: QuoteStatus) => {
    await updateQuoteStatus(quote.id, newStatus);
  };

  const handleConvertToOrder = async () => {
    setLoading(true);
    try {
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
    } finally {
      setLoading(false);
    }
  };

  const handleConvertToInvoice = () => {
    toast.info('Invoice generation feature is coming soon!');
  };

  const handleDelete = async () => {
    await deleteQuote(quote.id);
    setDeleteDialogOpen(false);
  };

  return (
    <>
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base font-semibold">{quote.quote_number}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {format(new Date(quote.created_at), 'dd MMM yyyy')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={`${statusConfig?.color} text-white`}>
                {statusConfig?.label}
              </Badge>
              {!isConverted && onEdit && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={() => onEdit(quote)}
                  title="Edit Quote"
                >
                  <Pencil className="h-4 w-4 text-muted-foreground hover:text-primary" />
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onView(quote)}>
                    <Eye className="h-4 w-4 mr-2" />
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDownloadPdf} disabled={loading}>
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleStatusChange('sent')}>
                    <Send className="h-4 w-4 mr-2" />
                    Mark as Sent
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleStatusChange('accepted')}>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Mark as Accepted
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleStatusChange('rejected')}>
                    <XCircle className="h-4 w-4 mr-2" />
                    Mark as Rejected
                  </DropdownMenuItem>
                  {canApprove && (
                    <DropdownMenuItem onClick={() => approveQuote(quote.id)} className="text-green-600">
                      <UserCheck className="h-4 w-4 mr-2" />
                      Approve Quote
                    </DropdownMenuItem>
                  )}
                  {canConvert && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={handleConvertToOrder} 
                        disabled={loading}
                        className="text-primary"
                      >
                        <ShoppingCart className="h-4 w-4 mr-2" />
                        Convert to Order
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={handleConvertToInvoice}
                        className="text-primary"
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Convert to Invoice
                      </DropdownMenuItem>
                    </>
                  )}
                  {role === 'admin' && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => setDeleteDialogOpen(true)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Customer Info */}
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{quote.customer_name}</span>
          </div>
          {quote.customer_company && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="h-4 w-4" />
              <span>{quote.customer_company}</span>
            </div>
          )}

          {/* Validity */}
          {quote.valid_until && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Valid until: {format(new Date(quote.valid_until), 'dd MMM yyyy')}</span>
            </div>
          )}

          {/* Payment Terms */}
          {quote.payment_terms && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CreditCard className="h-4 w-4" />
              <span>
                {quote.payment_terms === 'custom' 
                  ? quote.payment_terms_custom 
                  : PAYMENT_TERMS_OPTIONS.find(p => p.value === quote.payment_terms)?.label}
              </span>
            </div>
          )}

          {/* Internal Notes */}
          {quote.internal_notes && (
            <div className="flex items-start gap-2 text-sm bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded">
              <StickyNote className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
              <span className="text-yellow-800 dark:text-yellow-200 text-xs line-clamp-2">{quote.internal_notes}</span>
            </div>
          )}

          {/* Approved By */}
          {quote.approved_by_name && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <UserCheck className="h-4 w-4" />
              <span>Approved by: {quote.approved_by_name}</span>
            </div>
          )}

          {/* Amount */}
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-sm text-muted-foreground">Total Amount</span>
            <div className="flex items-center gap-1 font-bold text-lg">
              <IndianRupee className="h-4 w-4" />
              {quote.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>

          {/* Created By */}
          <div className="text-xs text-muted-foreground">
            Created by: {quote.created_by_name}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quote</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete quote {quote.quote_number}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
