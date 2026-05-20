import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSpareParts, type SparePart, type SparePartInput } from "@/hooks/useSpareParts";
import { useSuppliers } from "@/hooks/useSuppliers";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  part?: SparePart | null;
}

const empty: SparePartInput = {
  part_name: "",
  category: "",
  quantity: 0,
  minimum_stock_threshold: 5,
  cost_price: 0,
  selling_price: 0,
  vendor_name: "",
  vendor_id: null,
  last_purchase_date: null,
  remarks: "",
};

export function SparePartFormDialog({ open, onOpenChange, part }: Props) {
  const { create, update } = useSpareParts();
  const { suppliers } = useSuppliers();
  const [form, setForm] = useState<SparePartInput>(empty);

  useEffect(() => {
    if (part) {
      setForm({
        part_name: part.part_name,
        category: part.category,
        quantity: part.quantity,
        minimum_stock_threshold: part.minimum_stock_threshold,
        cost_price: Number(part.cost_price),
        selling_price: Number(part.selling_price),
        vendor_name: part.vendor_name,
        vendor_id: part.vendor_id,
        last_purchase_date: part.last_purchase_date,
        remarks: part.remarks,
      });
    } else {
      setForm(empty);
    }
  }, [part, open]);

  const profit = useMemo(() => {
    const p = Number(form.selling_price) - Number(form.cost_price);
    const m = Number(form.cost_price) > 0 ? (p / Number(form.cost_price)) * 100 : 0;
    return { p, m };
  }, [form.cost_price, form.selling_price]);

  const valid =
    form.part_name.trim().length > 0 &&
    Number(form.quantity) >= 0 &&
    Number(form.cost_price) >= 0 &&
    Number(form.selling_price) >= Number(form.cost_price) &&
    (form.vendor_name?.trim().length ?? 0) > 0;

  const submit = async () => {
    if (!valid) return;
    if (part) {
      await update.mutateAsync({ id: part.id, patch: form });
    } else {
      await create.mutateAsync(form);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{part ? "Edit Spare Part" : "Add Spare Part"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Label>Part Name *</Label>
            <Input value={form.part_name} onChange={(e) => setForm({ ...form, part_name: e.target.value })} />
          </div>
          <div>
            <Label>Category</Label>
            <Input value={form.category ?? ""} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </div>
          <div>
            <Label>Quantity *</Label>
            <Input
              type="number"
              min={0}
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: Math.max(0, Number(e.target.value)) })}
            />
          </div>
          <div>
            <Label>Minimum Stock Threshold</Label>
            <Input
              type="number"
              min={0}
              value={form.minimum_stock_threshold}
              onChange={(e) =>
                setForm({ ...form, minimum_stock_threshold: Math.max(0, Number(e.target.value)) })
              }
            />
          </div>
          <div>
            <Label>Cost Price (₹) *</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.cost_price}
              onChange={(e) => setForm({ ...form, cost_price: Math.max(0, Number(e.target.value)) })}
            />
          </div>
          <div>
            <Label>Selling Price (₹) *</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.selling_price}
              onChange={(e) => setForm({ ...form, selling_price: Math.max(0, Number(e.target.value)) })}
            />
          </div>
          <div>
            <Label>Vendor *</Label>
            <Select
              value={form.vendor_id ?? "__manual__"}
              onValueChange={(v) => {
                if (v === "__manual__") {
                  setForm({ ...form, vendor_id: null });
                } else {
                  const s = suppliers.find((x) => x.id === v);
                  setForm({ ...form, vendor_id: v, vendor_name: s?.name ?? form.vendor_name });
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select supplier or enter manually" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__manual__">Manual entry</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Vendor Name *</Label>
            <Input
              value={form.vendor_name ?? ""}
              onChange={(e) => setForm({ ...form, vendor_name: e.target.value })}
              disabled={!!form.vendor_id}
            />
          </div>
          <div>
            <Label>Last Purchase Date</Label>
            <Input
              type="date"
              value={form.last_purchase_date ?? ""}
              onChange={(e) => setForm({ ...form, last_purchase_date: e.target.value || null })}
            />
          </div>
          <div className="sm:col-span-2 rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <span>Cost: <strong>₹{Number(form.cost_price).toLocaleString("en-IN")}</strong></span>
              <span>Selling: <strong>₹{Number(form.selling_price).toLocaleString("en-IN")}</strong></span>
              <span>
                Profit:{" "}
                <strong className={profit.p < 0 ? "text-destructive" : "text-success"}>
                  ₹{profit.p.toLocaleString("en-IN")}
                </strong>
              </span>
              <span>
                Margin: <strong>{profit.m.toFixed(1)}%</strong>
              </span>
            </div>
            {Number(form.selling_price) < Number(form.cost_price) && (
              <p className="mt-1 text-destructive text-xs">Selling price must be ≥ cost price</p>
            )}
          </div>
          <div className="sm:col-span-2">
            <Label>Remarks</Label>
            <Textarea
              value={form.remarks ?? ""}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || create.isPending || update.isPending}>
            {part ? "Save Changes" : "Add Part"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}