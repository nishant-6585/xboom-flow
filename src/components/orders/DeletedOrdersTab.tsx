import { useState } from 'react';
import { format } from 'date-fns';
import { useDeletedOrders, useOrders, type Order } from '@/hooks/useOrders';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, RotateCcw, Trash2, Search, Trash } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export function DeletedOrdersTab() {
  const { role } = useAuth();
  const { deletedOrders, loading, refetch } = useDeletedOrders();
  const { restoreOrder, purgeOrder } = useOrders();
  const [search, setSearch] = useState('');
  const [pendingPurge, setPendingPurge] = useState<Order | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const isAdmin = role === 'admin';

  const term = search.trim().toLowerCase();
  const rows = deletedOrders.filter((o) => {
    if (!term) return true;
    return (
      (o.order_number || '').toLowerCase().includes(term) ||
      (o.product_name || '').toLowerCase().includes(term) ||
      (o.customer_name || '').toLowerCase().includes(term) ||
      (o.customer_company || '').toLowerCase().includes(term) ||
      ((o as any).delete_reason || '').toLowerCase().includes(term) ||
      ((o as any).deleted_by_name || '').toLowerCase().includes(term)
    );
  });

  const handleRestore = async (order: Order) => {
    setBusyId(order.id);
    await restoreOrder(order.id);
    setBusyId(null);
    refetch();
  };

  const handlePurge = async () => {
    if (!pendingPurge) return;
    setBusyId(pendingPurge.id);
    await purgeOrder(pendingPurge.id);
    setBusyId(null);
    setPendingPurge(null);
    refetch();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-muted-foreground" />
              Deleted Orders
              <Badge variant="secondary">{deletedOrders.length}</Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Soft-deleted orders are kept here. You can restore them anytime.
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search deleted orders..."
              className="pl-9"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading deleted orders...
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-12">
            No deleted orders.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Deleted By</TableHead>
                  <TableHead>Deleted On</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">{o.order_number || '—'}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{o.product_name || '—'}</TableCell>
                    <TableCell className="max-w-[180px] truncate">
                      {o.customer_name || '—'}
                      {o.customer_company ? (
                        <div className="text-xs text-muted-foreground truncate">{o.customer_company}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">{(o as any).deleted_by_name || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {(o as any).deleted_at
                        ? format(new Date((o as any).deleted_at), 'dd MMM yyyy, HH:mm')
                        : '—'}
                    </TableCell>
                    <TableCell className="max-w-[260px] text-sm">
                      <span className="line-clamp-2">{(o as any).delete_reason || '—'}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRestore(o)}
                          disabled={busyId === o.id}
                        >
                          {busyId === o.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                          <span className="ml-1">Restore</span>
                        </Button>
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setPendingPurge(o)}
                            disabled={busyId === o.id}
                          >
                            <Trash className="h-3.5 w-3.5" />
                            <span className="ml-1">Delete Permanently</span>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <AlertDialog open={!!pendingPurge} onOpenChange={(o) => !o && setPendingPurge(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete order?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove order{' '}
              <strong>{pendingPurge?.order_number}</strong> and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePurge}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}