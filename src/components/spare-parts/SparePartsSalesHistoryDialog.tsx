import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSparePartSales, useSpareParts } from "@/hooks/useSpareParts";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function SparePartsSalesHistoryDialog({ open, onOpenChange }: Props) {
  const { list: sales } = useSparePartSales();
  const { list: parts } = useSpareParts();

  const partMap = new Map((parts.data ?? []).map((p) => [p.id, p]));
  const rows = sales.data ?? [];
  const totalRevenue = rows.reduce((s, r) => s + Number(r.total_amount), 0);
  const totalUnits = rows.reduce((s, r) => s + Number(r.quantity), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Spare Parts Sales History</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Total Sales</div>
            <div className="text-lg font-semibold">{rows.length}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Units Sold</div>
            <div className="text-lg font-semibold">{totalUnits}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Total Revenue</div>
            <div className="text-lg font-semibold">₹{totalRevenue.toLocaleString("en-IN")}</div>
          </div>
        </div>
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Part</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                    No sales recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const p = partMap.get(r.part_id);
                  return (
                    <TableRow key={r.id}>
                      <TableCell>{format(new Date(r.sale_date), "dd MMM yyyy")}</TableCell>
                      <TableCell>
                        <div className="font-medium">{p?.part_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{p?.part_code}</div>
                      </TableCell>
                      <TableCell>{r.quantity}</TableCell>
                      <TableCell>₹{Number(r.sale_price).toLocaleString("en-IN")}</TableCell>
                      <TableCell>₹{Number(r.total_amount).toLocaleString("en-IN")}</TableCell>
                      <TableCell>
                        <div>{r.buyer_name || "—"}</div>
                        {r.buyer_phone && (
                          <div className="text-xs text-muted-foreground">{r.buyer_phone}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.notes || "—"}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}