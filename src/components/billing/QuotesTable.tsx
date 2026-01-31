import { Quote, QUOTE_STATUSES } from '@/hooks/useQuotes';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';

interface QuotesTableProps {
  quotes: Quote[];
  onView: (quote: Quote) => void;
}

export function QuotesTable({ quotes, onView }: QuotesTableProps) {
  const getStatusConfig = (status: string) => {
    return QUOTE_STATUSES.find(s => s.value === status) || QUOTE_STATUSES[0];
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Quote No</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Company</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Converted</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {quotes.map((quote) => {
            const statusConfig = getStatusConfig(quote.status);
            const isConverted = quote.status === 'converted';
            const isLost = quote.status === 'rejected' || quote.status === 'expired';
            
            return (
              <TableRow key={quote.id}>
                <TableCell className="font-medium">{quote.quote_number}</TableCell>
                <TableCell>{quote.customer_name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {quote.customer_company || '-'}
                </TableCell>
                <TableCell className="text-right font-medium">
                  ₹{quote.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell>
                  <Badge className={`${statusConfig.color} text-white`}>
                    {statusConfig.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  {isConverted ? (
                    <div className="flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-sm">Yes</span>
                    </div>
                  ) : isLost ? (
                    <div className="flex items-center gap-1 text-red-500">
                      <XCircle className="h-4 w-4" />
                      <span className="text-sm">No</span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Pending</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(quote.created_at), 'dd MMM yyyy')}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onView(quote)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
