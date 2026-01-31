import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Quote, QuoteStatus, QUOTE_STATUSES, useQuotes } from '@/hooks/useQuotes';
import { downloadQuotePdf } from '@/lib/quotePdfGenerator';
import { format } from 'date-fns';
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
  RefreshCw
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface QuoteCardProps {
  quote: Quote;
  onView: (quote: Quote) => void;
}

export function QuoteCard({ quote, onView }: QuoteCardProps) {
  const { role } = useAuth();
  const { fetchQuoteWithItems, updateQuoteStatus, deleteQuote } = useQuotes();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const statusConfig = QUOTE_STATUSES.find(s => s.value === quote.status);

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
                  <DropdownMenuItem onClick={() => handleStatusChange('converted')}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Convert to Order
                  </DropdownMenuItem>
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
