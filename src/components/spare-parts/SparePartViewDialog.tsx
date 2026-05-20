import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useSparePartTransactions, type SparePart } from "@/hooks/useSpareParts";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  part: SparePart | null;
  canSeePricing: boolean;
}

export function SparePartViewDialog({ open, onOpenChange, part, canSeePricing }: Props) {
  const { list } = useSparePartTransactions(part?.id);
  if (!part) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {part.part_name}{" "}
            <span className="text-muted-foreground text-sm font-normal">({part.part_code})</span>
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Detail label="Category" value={part.category || "—"} />
          <Detail label="Vendor" value={part.vendor_name || "—"} />
          <Detail label="Quantity" value={String(part.quantity)} />
          <Detail label="Min Threshold" value={String(part.minimum_stock_threshold)} />
          {canSeePricing && (
            <>
              <Detail label="Cost Price" value={`₹${Number(part.cost_price).toLocaleString("en-IN")}`} />
              <Detail label="Selling Price" value={`₹${Number(part.selling_price).toLocaleString("en-IN")}`} />
              <Detail label="Profit / Unit" value={`₹${Number(part.profit_per_unit).toLocaleString("en-IN")}`} />
              <Detail label="Margin" value={`${Number(part.profit_margin_percent).toFixed(1)}%`} />
            </>
          )}
          <Detail
            label="Last Purchase"
            value={part.last_purchase_date ? format(new Date(part.last_purchase_date), "dd MMM yyyy") : "—"}
          />
          <div>
            <div className="text-muted-foreground text-xs">Status</div>
            <StatusBadge status={part.stock_status} />
          </div>
          {part.remarks && (
            <div className="col-span-2">
              <div className="text-muted-foreground text-xs">Remarks</div>
              <div>{part.remarks}</div>
            </div>
          )}
        </div>

        <div className="mt-4">
          <h4 className="font-semibold mb-2">Stock Movement History</h4>
          {list.isLoading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : (list.data ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">No movements yet.</p>
          ) : (
            <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
              {list.data!.map((t) => (
                <div key={t.id} className="p-2 text-sm flex items-center justify-between">
                  <div>
                    <span className={t.change_type === "ADD" ? "text-success" : "text-destructive"}>
                      {t.change_type === "ADD" ? "+" : "−"}
                      {t.quantity_change}
                    </span>{" "}
                    <span className="text-muted-foreground">· {t.reason.replace("_", " ").toLowerCase()}</span>
                    {t.notes && <div className="text-xs text-muted-foreground">{t.notes}</div>}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(t.created_at), "dd MMM, HH:mm")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div>{value}</div>
    </div>
  );
}

export function StatusBadge({ status }: { status: SparePart["stock_status"] }) {
  if (status === "SOLD_OUT") return <Badge variant="destructive">Sold Out</Badge>;
  if (status === "LOW_STOCK") return <Badge variant="pending">Low Stock</Badge>;
  return <Badge variant="confirmed">In Stock</Badge>;
}