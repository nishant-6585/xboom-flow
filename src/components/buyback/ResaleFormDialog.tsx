import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingCart } from "lucide-react";
import { useBuybackDrones, BuybackDrone } from "@/hooks/useBuybackDrones";

interface Props {
  inStockDrones: BuybackDrone[];
}

export function ResaleFormDialog({ inStockDrones }: Props) {
  const [open, setOpen] = useState(false);
  const { sellDrone } = useBuybackDrones();
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState({
    selling_price: "",
    buyer_name: "",
    buyer_contact: "",
    selling_date: new Date().toISOString().split("T")[0],
  });

  const selected = inStockDrones.find((d) => d.id === selectedId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !form.selling_price || !form.buyer_name || !form.buyer_contact) return;
    sellDrone.mutate(
      { id: selectedId, ...form, selling_price: parseFloat(form.selling_price) },
      {
        onSuccess: () => {
          setOpen(false);
          setSelectedId("");
          setForm({ selling_price: "", buyer_name: "", buyer_contact: "", selling_date: new Date().toISOString().split("T")[0] });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={inStockDrones.length === 0}>
          <ShoppingCart className="w-4 h-4 mr-2" />Record Sale
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Drone Sale</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Select Drone (In Stock) *</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger><SelectValue placeholder="Select a drone" /></SelectTrigger>
              <SelectContent>
                {inStockDrones.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.drone_model} — {d.serial_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selected && (
            <div className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
              <p><strong>Category:</strong> {selected.drone_category} · <strong>Condition:</strong> {selected.condition}</p>
              <p><strong>Buyback Price:</strong> ₹{selected.buyback_price.toLocaleString("en-IN")}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Selling Price (₹) *</Label>
              <Input type="number" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Selling Date *</Label>
              <Input type="date" value={form.selling_date} onChange={(e) => setForm({ ...form, selling_date: e.target.value })} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Buyer Name *</Label>
            <Input value={form.buyer_name} onChange={(e) => setForm({ ...form, buyer_name: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label>Buyer Contact *</Label>
            <Input value={form.buyer_contact} onChange={(e) => setForm({ ...form, buyer_contact: e.target.value })} required />
          </div>
          <Button type="submit" className="w-full" disabled={sellDrone.isPending}>
            {sellDrone.isPending ? "Recording..." : "Mark as Sold"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
