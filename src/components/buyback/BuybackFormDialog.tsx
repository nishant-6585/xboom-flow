import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useBuybackDrones } from "@/hooks/useBuybackDrones";

const categories = ["Mini", "Air", "Mavic", "FPV", "Enterprise", "Other"];
const conditions = ["New", "Used", "Repaired"];

export function BuybackFormDialog() {
  const [open, setOpen] = useState(false);
  const { addDrone } = useBuybackDrones();
  const [form, setForm] = useState({
    drone_category: "",
    drone_model: "",
    serial_number: "",
    condition: "",
    buyback_price: "",
    seller_name: "",
    seller_contact: "",
    buyback_date: new Date().toISOString().split("T")[0],
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.drone_category || !form.drone_model || !form.serial_number || !form.condition || !form.buyback_price || !form.seller_name || !form.seller_contact) {
      return;
    }
    addDrone.mutate(
      { ...form, buyback_price: parseFloat(form.buyback_price) },
      {
        onSuccess: () => {
          setOpen(false);
          setForm({
            drone_category: "",
            drone_model: "",
            serial_number: "",
            condition: "",
            buyback_price: "",
            seller_name: "",
            seller_contact: "",
            buyback_date: new Date().toISOString().split("T")[0],
          });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="w-4 h-4 mr-2" />Add Buyback</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Drone Buyback</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select value={form.drone_category} onValueChange={(v) => setForm({ ...form, drone_category: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Condition *</Label>
              <Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {conditions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Drone Model *</Label>
            <Input value={form.drone_model} onChange={(e) => setForm({ ...form, drone_model: e.target.value })} placeholder="e.g. DJI Mini 4 Pro" required />
          </div>
          <div className="space-y-2">
            <Label>Serial Number *</Label>
            <Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} placeholder="Unique serial number" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Buyback Price (₹) *</Label>
              <Input type="number" value={form.buyback_price} onChange={(e) => setForm({ ...form, buyback_price: e.target.value })} placeholder="0" required />
            </div>
            <div className="space-y-2">
              <Label>Buyback Date *</Label>
              <Input type="date" value={form.buyback_date} onChange={(e) => setForm({ ...form, buyback_date: e.target.value })} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Seller Name *</Label>
            <Input value={form.seller_name} onChange={(e) => setForm({ ...form, seller_name: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label>Seller Contact *</Label>
            <Input value={form.seller_contact} onChange={(e) => setForm({ ...form, seller_contact: e.target.value })} required />
          </div>
          <Button type="submit" className="w-full" disabled={addDrone.isPending}>
            {addDrone.isPending ? "Adding..." : "Add to Stock"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
