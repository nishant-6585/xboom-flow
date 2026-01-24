import { useState, useEffect } from 'react';
import { useEditHistory, EditHistoryRecord } from '@/hooks/useEditHistory';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface EditHistoryPanelProps {
  tableName: string;
  recordId: string;
}

const fieldLabels: Record<string, string> = {
  supplier_name: 'Supplier',
  supplier_contact: 'Supplier Contact',
  procurement_rate: 'Procurement Rate',
  procurement_date: 'Procurement Date',
  procurement_currency: 'Currency',
  supplier_payment_terms: 'Supplier Payment Terms',
  supplier_payment_due_date: 'Supplier Payment Due Date',
  status: 'Status',
  payment_status: 'Payment Status',
  internal_notes: 'Internal Notes',
  sales_notes: 'Sales Notes',
  customer_notes: 'Customer Notes',
  shipping_address: 'Shipping Address',
  selling_price: 'Selling Price',
  total_sales_amount: 'Total Sales Amount',
  amount_paid: 'Amount Paid',
  payment_terms: 'Payment Terms',
  payment_due_date: 'Payment Due Date',
  committed_timeline: 'Committed Timeline',
  estimated_delivery: 'Estimated Delivery',
  actual_delivery: 'Actual Delivery',
  tracking_number: 'Tracking Number',
  tracking_url: 'Tracking URL',
  priority: 'Priority',
  order_outcome: 'Order Outcome',
  order_type: 'Order Type',
  customer_type: 'Customer Type',
  is_rto: 'RTO Status',
  cancellation_reason: 'Cancellation Reason',
  discount_amount: 'Discount Amount',
  order_date: 'Order Date',
};

export function EditHistoryPanel({ tableName, recordId }: EditHistoryPanelProps) {
  const { fetchHistory } = useEditHistory();
  const [history, setHistory] = useState<EditHistoryRecord[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && recordId) {
      setLoading(true);
      fetchHistory(tableName, recordId).then((data) => {
        setHistory(data);
        setLoading(false);
      });
    }
  }, [isOpen, tableName, recordId, fetchHistory]);

  const formatValue = (value: string | null): string => {
    if (value === null || value === '' || value === 'null') return '(empty)';
    return value;
  };

  const getFieldLabel = (field: string): string => {
    return fieldLabels[field] || field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground">
          <span className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Edit History
            {history.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {history.length}
              </Badge>
            )}
          </span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 border rounded-lg bg-muted/30">
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Loading history...
            </div>
          ) : history.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No edit history available
            </div>
          ) : (
            <ScrollArea className="h-[200px]">
              <div className="p-2 space-y-2">
                {history.map((record) => (
                  <div
                    key={record.id}
                    className="p-2 rounded bg-background border text-xs"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-primary">
                        {record.edited_by_name}
                      </span>
                      <span className="text-muted-foreground">
                        {format(new Date(record.edited_at), 'dd MMM yyyy, HH:mm')}
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      Changed <span className="font-medium text-foreground">{getFieldLabel(record.field_name)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <span className="line-through text-red-500/70">{formatValue(record.old_value)}</span>
                      <span>→</span>
                      <span className="text-green-600">{formatValue(record.new_value)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
