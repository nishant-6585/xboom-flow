import { useState, useEffect } from 'react';
import { useEditHistory, EditHistoryRecord } from '@/hooks/useEditHistory';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';
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
  status: 'Order Status',
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
  customer_name: 'Customer Name',
  customer_company: 'Customer Company',
  lost_reason: 'Lost Reason',
  lost_reason_notes: 'Lost Reason Notes',
  is_refund_requested: 'Refund Requested',
  refund_reason: 'Refund Reason',
  refund_status: 'Refund Status',
  // Order item fields
  'order_item.product_name': 'Item Product Name',
  'order_item.quantity': 'Item Quantity',
  'order_item.unit_price': 'Item Unit Price',
  'order_item.status': 'Item Status',
  'order_item.notes': 'Item Notes',
  'order_item.procurement_rate': 'Item Procurement Rate',
  'order_item.product_category': 'Item Product Category',
};

// Group records by date+user for a cleaner activity log
interface GroupedEntry {
  editedBy: string;
  editedAt: string;
  changes: EditHistoryRecord[];
}

function groupByTimestamp(records: EditHistoryRecord[]): GroupedEntry[] {
  const groups: GroupedEntry[] = [];
  let current: GroupedEntry | null = null;

  for (const record of records) {
    // Group entries within 2 seconds of each other by the same user
    if (
      current &&
      current.editedBy === record.edited_by_name &&
      Math.abs(new Date(current.editedAt).getTime() - new Date(record.edited_at).getTime()) < 2000
    ) {
      current.changes.push(record);
    } else {
      current = {
        editedBy: record.edited_by_name,
        editedAt: record.edited_at,
        changes: [record],
      };
      groups.push(current);
    }
  }
  return groups;
}

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
    if (value === 'true') return 'Yes';
    if (value === 'false') return 'No';
    return value;
  };

  const truncateValue = (value: string, maxLen = 60): string => {
    if (value.length <= maxLen) return value;
    return value.substring(0, maxLen) + '…';
  };

  const getFieldLabel = (field: string): string => {
    return fieldLabels[field] || field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const grouped = groupByTimestamp(history);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground">
          <span className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Change History
            {history.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {grouped.length} update{grouped.length !== 1 ? 's' : ''}
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
          ) : grouped.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No change history available
            </div>
          ) : (
            <ScrollArea className="h-[320px]">
              <div className="p-3 space-y-3">
                {grouped.map((group, idx) => (
                  <div
                    key={idx}
                    className="relative pl-4 border-l-2 border-primary/30"
                  >
                    {/* Timestamp & author header */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-semibold text-primary">
                        {group.editedBy}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(group.editedAt), 'dd MMM yyyy – h:mm a')}
                      </span>
                    </div>

                    {/* Individual field changes */}
                    <div className="space-y-1">
                      {group.changes.map((record) => (
                        <div
                          key={record.id}
                          className="rounded bg-background border px-2.5 py-1.5 text-xs"
                        >
                          <span className="text-muted-foreground">changed </span>
                          <span className="font-medium text-foreground">{getFieldLabel(record.field_name)}</span>
                          <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <span className="line-through text-destructive/70">
                              {truncateValue(formatValue(record.old_value))}
                            </span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            <span className="text-green-600 dark:text-green-400 font-medium">
                              {truncateValue(formatValue(record.new_value))}
                            </span>
                          </div>
                        </div>
                      ))}
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
