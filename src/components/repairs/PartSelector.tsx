import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Package, AlertTriangle } from "lucide-react";
import { useSpareParts, type SparePart } from "@/hooks/useSpareParts";
import type { ComponentReplaced } from "@/hooks/useRepairs";
import { cn } from "@/lib/utils";

interface PartSelectorProps {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  onSelect: (component: ComponentReplaced) => void;
}

function statusBadge(s: SparePart["stock_status"]) {
  if (s === "IN_STOCK")
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">In stock</Badge>;
  if (s === "LOW_STOCK")
    return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Low stock</Badge>;
  return <Badge variant="destructive">Sold out</Badge>;
}

export function PartSelector({ open, onOpenChange, onSelect }: PartSelectorProps) {
  const { list } = useSpareParts();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SparePart | null>(null);
  const [qty, setQty] = useState<number>(1);

  const parts = list.data ?? [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return parts;
    return parts.filter(
      (p) =>
        p.part_name.toLowerCase().includes(term) ||
        (p.part_code ?? "").toLowerCase().includes(term) ||
        (p.category ?? "").toLowerCase().includes(term),
    );
  }, [parts, search]);

  const reset = () => {
    setSelected(null);
    setQty(1);
    setSearch("");
  };

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const handleConfirm = () => {
    if (!selected) return;
    const q = Math.max(1, Math.min(qty || 1, selected.quantity));
    const cost_per_unit = Number(selected.cost_price) || 0;
    const component: ComponentReplaced = {
      name: selected.part_name,
      part_id: selected.id,
      part_code: selected.part_code ?? null,
      quantity: q,
      cost_per_unit,
      cost: cost_per_unit * q,
    };
    onSelect(component);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-4 w-4" /> Add part from inventory
          </DialogTitle>
        </DialogHeader>

        {!selected ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search by name, code, or category…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            <ScrollArea className="h-80 border rounded-md">
              {list.isLoading ? (
                <div className="p-4 text-sm text-muted-foreground">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No parts found.</div>
              ) : (
                <div className="divide-y">
                  {filtered.map((p) => {
                    const disabled = p.stock_status === "SOLD_OUT";
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => setSelected(p)}
                        className={cn(
                          "w-full text-left p-3 hover:bg-muted transition-colors flex items-center gap-3",
                          disabled && "opacity-50 cursor-not-allowed hover:bg-transparent",
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{p.part_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {p.part_code ?? "—"}
                            {p.category ? ` · ${p.category}` : ""}
                          </div>
                        </div>
                        <div className="text-right text-sm">
                          <div>Stock: {p.quantity}</div>
                          <div className="text-xs text-muted-foreground">
                            Cost ₹{Number(p.cost_price).toLocaleString("en-IN")}
                          </div>
                        </div>
                        <div>{statusBadge(p.stock_status)}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 rounded-md border bg-muted/50">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{selected.part_name}</div>
                  <div className="text-xs text-muted-foreground">{selected.part_code ?? "—"}</div>
                </div>
                {statusBadge(selected.stock_status)}
              </div>
              <div className="text-sm mt-2 text-muted-foreground">
                Available: {selected.quantity} · Cost/unit: ₹
                {Number(selected.cost_price).toLocaleString("en-IN")}
              </div>
            </div>

            {selected.stock_status === "LOW_STOCK" && (
              <div className="flex items-start gap-2 text-sm p-2 rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-900 text-yellow-900 dark:text-yellow-200">
                <AlertTriangle className="h-4 w-4 mt-0.5" />
                <span>This part is low on stock. Consider reordering soon.</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="qty">Quantity</Label>
              <Input
                id="qty"
                type="number"
                min={1}
                max={selected.quantity}
                step={1}
                value={qty}
                onChange={(e) => setQty(parseInt(e.target.value || "1", 10))}
              />
              <div className="text-xs text-muted-foreground">
                Total cost: ₹
                {(Math.max(1, Math.min(qty || 1, selected.quantity)) * Number(selected.cost_price)).toLocaleString(
                  "en-IN",
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {selected && (
            <Button variant="outline" onClick={() => setSelected(null)}>
              Back
            </Button>
          )}
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selected}>
            Add to repair
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}