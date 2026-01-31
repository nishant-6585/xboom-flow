import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Quote, QuoteItem, QUOTE_STATUSES, useQuotes } from '@/hooks/useQuotes';
import { useEditHistory, EditHistoryRecord } from '@/hooks/useEditHistory';
import { downloadQuotePdf } from '@/lib/quotePdfGenerator';
import { format } from 'date-fns';
import { Download, User, Building2, Mail, Phone, MapPin, Calendar, Loader2, Pencil, History, ChevronDown, ChevronUp } from 'lucide-react';

interface QuoteDetailDialogProps {
  quote: Quote | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (quote: Quote) => void;
}

export function QuoteDetailDialog({ quote, open, onOpenChange, onEdit }: QuoteDetailDialogProps) {
  const { fetchQuoteWithItems } = useQuotes();
  const { fetchHistory } = useEditHistory();
  const [fullQuote, setFullQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [editHistory, setEditHistory] = useState<EditHistoryRecord[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (quote && open) {
      setLoading(true);
      Promise.all([
        fetchQuoteWithItems(quote.id),
        fetchHistory('quotes', quote.id)
      ]).then(([quoteData, historyData]) => {
        setFullQuote(quoteData);
        setEditHistory(historyData);
        setLoading(false);
      });
    }
  }, [quote, open]);

  const handleDownload = async () => {
    if (fullQuote && fullQuote.items) {
      await downloadQuotePdf(fullQuote, fullQuote.items);
    }
  };

  if (!quote) return null;

  const statusConfig = QUOTE_STATUSES.find(s => s.value === quote.status);
  const canEdit = quote.status !== 'converted';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl">{quote.quote_number}</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Created on {format(new Date(quote.created_at), 'dd MMM yyyy, hh:mm a')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={`${statusConfig?.color} text-white`}>
                {statusConfig?.label}
              </Badge>
              {canEdit && onEdit && (
                <Button variant="outline" onClick={() => { onOpenChange(false); onEdit(quote); }}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              )}
              <Button onClick={handleDownload} disabled={loading || !fullQuote?.items}>
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-6 pr-4">
              {/* Customer Details */}
              <div>
                <h3 className="font-semibold mb-3">Customer Details</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{quote.customer_name}</span>
                  </div>
                  {quote.customer_company && (
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span>{quote.customer_company}</span>
                    </div>
                  )}
                  {quote.customer_email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span>{quote.customer_email}</span>
                    </div>
                  )}
                  {quote.customer_phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{quote.customer_phone}</span>
                    </div>
                  )}
                  {quote.customer_address && (
                    <div className="flex items-start gap-2 col-span-2">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <span>{quote.customer_address}</span>
                    </div>
                  )}
                  {quote.customer_gst && (
                    <div className="text-muted-foreground">
                      GST: <span className="text-foreground font-mono">{quote.customer_gst}</span>
                    </div>
                  )}
                  {quote.valid_until && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>Valid until: {format(new Date(quote.valid_until), 'dd MMM yyyy')}</span>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Items Table */}
              <div>
                <h3 className="font-semibold mb-3">Items</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-center">GST %</TableHead>
                      <TableHead className="text-right">GST Amt</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fullQuote?.items?.map((item, index) => (
                      <TableRow key={item.id || index}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{item.product_name}</p>
                            {item.product_code && (
                              <p className="text-xs text-muted-foreground">{item.product_code}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{item.quantity}</TableCell>
                        <TableCell className="text-right">
                          ₹{item.unit_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-center">{item.gst_percent}%</TableCell>
                        <TableCell className="text-right">
                          ₹{item.gst_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          ₹{item.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Separator />

              {/* Summary */}
              <div className="flex justify-end">
                <div className="w-72 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>₹{quote.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total GST</span>
                    <span>₹{quote.total_gst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {quote.discount_amount > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Discount</span>
                      <span>-₹{quote.discount_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between text-lg font-bold">
                    <span>Grand Total</span>
                    <span className="text-primary">
                      ₹{quote.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Notes & Terms */}
              {(quote.notes || quote.terms_and_conditions) && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    {quote.notes && (
                      <div>
                        <h4 className="font-medium mb-1">Notes</h4>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{quote.notes}</p>
                      </div>
                    )}
                    {quote.terms_and_conditions && (
                      <div>
                        <h4 className="font-medium mb-1">Terms & Conditions</h4>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{quote.terms_and_conditions}</p>
                      </div>
                    )}
                  </div>
                  </>
                )}

                {/* Edit History */}
                {editHistory.length > 0 && (
                  <>
                    <Separator />
                    <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" className="w-full justify-between p-0 h-auto">
                          <div className="flex items-center gap-2">
                            <History className="h-4 w-4" />
                            <span className="font-semibold">Edit History ({editHistory.length})</span>
                          </div>
                          {historyOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-3">
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {editHistory.map((record) => (
                            <div key={record.id} className="text-xs p-2 bg-muted rounded">
                              <div className="flex items-center justify-between">
                                <span className="font-medium">{record.field_name}</span>
                                <span className="text-muted-foreground">
                                  {format(new Date(record.edited_at), 'dd MMM yyyy, hh:mm a')}
                                </span>
                              </div>
                              <div className="mt-1 text-muted-foreground">
                                <span className="line-through text-red-500">{record.old_value || '(empty)'}</span>
                                {' → '}
                                <span className="text-green-600">{record.new_value || '(empty)'}</span>
                              </div>
                              <div className="mt-1 text-muted-foreground">by {record.edited_by_name}</div>
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </>
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    );
  }
