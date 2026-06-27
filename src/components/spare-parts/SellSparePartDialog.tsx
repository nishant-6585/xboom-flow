import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSpareParts, useSparePartSales } from "@/hooks/useSpareParts";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultPartId?: string | null;
}

export function SellSparePartDialog({ open, onOpenChange, defaultPartId }: Props) {
  const { list } = useSpareParts();
  const { create } = useSparePartSales();

  const parts = list.data ?? [];
  const [partId, setPartId] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [salePrice, setSalePrice] = useState<number>(0);
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [saleDate, setSaleDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    const initial = defaultPartId ?? "";
    setPartId(initial);
    setQuantity(1);
    setBuyerName("");
    setBuyerPhone("");
    setNotes("");
    setSaleDate(new Date().toISOString().slice(0, 10));
    const p = parts.find((x) => x.id === initial);
    setSalePrice(p ? Number(p.selling_price) : 0);
  }, [open, defaultPartId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = useMemo(() => parts.find((p) => p.id === partId) ?? null, [parts, partId]);

  const onPartChange = (id: string) => {
    setPartId(id);
    const p = parts.find((x) => x.id === id);
    if (p) setSalePrice(Number(p.selling_price));
  };

  const total = Number(quantity) * Number(salePrice);
  const insufficient = !!selected && Number(quantity) > selected.quantity;
  const valid =
    !!partId &&
    Number(quantity) > 0 &&
    Number(salePrice) >= 0 &&
    !insufficient;

  const submit = async () => {
    if (!valid) return;
    await create.mutateAsync({
      part_id: partId,
      quantity: Number(quantity),
      sale_price: Number(salePrice),
      buyer_name: buyerName.trim() || null,
      buyer_phone: buyerPhone.trim() || null,
      sale_date: saleDate,
      notes: notes.trim() || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sell Spare Part</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Label>Spare Part *</Label>
            <Select value={partId} onValueChange={onPartChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select a spare part" />
              </SelectTrigger>
              <SelectContent>
                {parts.map((p) => (
                  <SelectItem key={p.id} value={p.id} disabled={p.quantity <= 0}>
                    {p.part_name} {p.part_code ? `(${p.part_code})` : ""} — {p.quantity} in stock
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected && (
              <p className="text-xs text-muted-foreground mt-1">
                Available: {selected.quantity} · Listed price: ₹
                {Number(selected.selling_price).toLocaleString("en-IN")}
              </p>
            )}
          </div>
          <div>
            <Label>Quantity *</Label>
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
            />
            {insufficient && (
              <p className="text-xs text-destructive mt-1">Exceeds available stock</p>
            )}
          </div>
          <div>
            <Label>Sale Price per Unit (₹) *</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={salePrice}
              onChange={(e) => setSalePrice(Math.max(0, Number(e.target.value)))}
            />
          </div>
          <div>
            <Label>Buyer Name</Label>
            <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
          </div>
          <div>
            <Label>Buyer Phone</Label>
            <Input value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} />
          </div>
          <div>
            <Label>Sale Date *</Label>
            <Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
          </div>
          <div className="sm:col-span-2 rounded-md border bg-muted/30 p-3 text-sm">
            <span>
              Total: <strong>₹{total.toLocaleString("en-IN")}</strong>
            </span>
          </div>
          <div className="sm:col-span-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || create.isPending}>
            Record Sale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}