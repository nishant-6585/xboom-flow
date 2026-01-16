import { useMemo } from "react";
import { useExpenses } from "@/hooks/useExpenses";
import { useAllExpenseLinks } from "@/hooks/useExpenseLinks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Receipt, TrendingDown } from "lucide-react";
import { format, parseISO } from "date-fns";

interface OrderLinkedExpensesProps {
  orderId?: string;
  procurementId?: string;
}

export function OrderLinkedExpenses({ orderId, procurementId }: OrderLinkedExpensesProps) {
  const { expenses, loading: expensesLoading } = useExpenses();
  const { getExpensesForOrder, getExpensesForProcurement, loading: linksLoading } = useAllExpenseLinks();

  const linkedExpenseIds = useMemo(() => {
    if (orderId) {
      return getExpensesForOrder(orderId);
    }
    if (procurementId) {
      return getExpensesForProcurement(procurementId);
    }
    return [];
  }, [orderId, procurementId, getExpensesForOrder, getExpensesForProcurement]);

  const linkedExpenses = useMemo(() => {
    return expenses.filter(e => linkedExpenseIds.includes(e.id));
  }, [expenses, linkedExpenseIds]);

  const totalExpenses = useMemo(() => {
    return linkedExpenses.reduce((sum, e) => sum + e.amount, 0);
  }, [linkedExpenses]);

  if (expensesLoading || linksLoading) {
    return null;
  }

  if (linkedExpenses.length === 0) {
    return null;
  }

  return (
    <Card className="mt-4">
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Linked Expenses
          </span>
          <Badge variant="destructive" className="text-xs">
            <TrendingDown className="h-3 w-3 mr-1" />
            ₹{totalExpenses.toLocaleString()}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs">Description</TableHead>
                <TableHead className="text-xs text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linkedExpenses.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {format(parseISO(expense.expense_date), 'dd MMM')}
                  </TableCell>
                  <TableCell className="text-xs capitalize">{expense.expense_type.replace('_', ' ')}</TableCell>
                  <TableCell className="text-xs truncate max-w-[150px]">{expense.description || '-'}</TableCell>
                  <TableCell className="text-xs text-right font-medium text-red-600">
                    ₹{expense.amount.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// Summary component for analytics
export function ExpenseSummaryByOrders() {
  const { expenses, loading: expensesLoading } = useExpenses();
  const { allOrderLinks, allProcurementLinks, loading: linksLoading } = useAllExpenseLinks();

  const summary = useMemo(() => {
    const linkedToOrders = new Set(allOrderLinks.map(l => l.expense_id));
    const linkedToProcs = new Set(allProcurementLinks.map(l => l.expense_id));
    const allLinked = new Set([...linkedToOrders, ...linkedToProcs]);

    const linkedExpenses = expenses.filter(e => allLinked.has(e.id));
    const unlinkedExpenses = expenses.filter(e => !allLinked.has(e.id));

    return {
      totalLinked: linkedExpenses.reduce((sum, e) => sum + e.amount, 0),
      totalUnlinked: unlinkedExpenses.reduce((sum, e) => sum + e.amount, 0),
      linkedCount: linkedExpenses.length,
      unlinkedCount: unlinkedExpenses.length,
      linkedExpenses,
    };
  }, [expenses, allOrderLinks, allProcurementLinks]);

  if (expensesLoading || linksLoading) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Receipt className="h-4 w-4" />
          Fulfillment Expenses Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
            <p className="text-xs text-muted-foreground">Linked to Orders/Procurement</p>
            <p className="text-lg font-bold text-red-600">₹{summary.totalLinked.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{summary.linkedCount} expense(s)</p>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg border">
            <p className="text-xs text-muted-foreground">Unlinked Expenses</p>
            <p className="text-lg font-bold">₹{summary.totalUnlinked.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{summary.unlinkedCount} expense(s)</p>
          </div>
        </div>

        {summary.linkedExpenses.length > 0 && (
          <div className="rounded-md border overflow-x-auto max-h-48">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.linkedExpenses.slice(0, 10).map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {format(parseISO(expense.expense_date), 'dd MMM')}
                    </TableCell>
                    <TableCell className="text-xs capitalize">{expense.expense_type.replace('_', ' ')}</TableCell>
                    <TableCell className="text-xs text-right font-medium text-red-600">
                      ₹{expense.amount.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
