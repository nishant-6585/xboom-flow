import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarClock } from "lucide-react";
import { BuybackDrone } from "@/hooks/useBuybackDrones";
import { useRentals } from "@/hooks/useRentals";

interface Props {
  inStockDrones: BuybackDrone[];
}

export function RentDroneFormDialog({ inStockDrones }: Props) {
  const [open, setOpen] = useState(false);
  const { createRental } = useRentals();
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState({
    renter_name: "",
    renter_contact: "",
    rental_start_date: new Date().toISOString().split("T")[0],
    expected_return_date: "",
    rental_fee: "",
    security_deposit: "",
    notes: "",
  });

  const selected = inStockDrones.find((d) => d.id === selectedId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !form.renter_name || !form.renter_contact || !form.rental_fee) return;
    createRental.mutate(
      {
        drone_id: selectedId,
        renter_name: form.renter_name,
        renter_contact: form.renter_contact,
        rental_start_date: form.rental_start_date,
        expected_return_date: form.expected_return_date || null,
        rental_fee: parseFloat(form.rental_fee),
        security_deposit: form.security_deposit ? parseFloat(form.security_deposit) : 0,
        notes: form.notes || undefined,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setSelectedId("");
          setForm({
            renter_name: "",
            renter_contact: "",
            rental_start_date: new Date().toISOString().split("T")[0],
            expected_return_date: "",
            rental_fee: "",
            security_deposit: "",
            notes: "",
          });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={inStockDrones.length === 0}>
          <CalendarClock className="w-4 h-4 mr-2" />Put on Rent
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Put Drone on Rent</DialogTitle>
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
            </div>
          )}
          <div className="space-y-2">
            <Label>Renter Name *</Label>
            <Input value={form.renter_name} onChange={(e) => setForm({ ...form, renter_name: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label>Renter Contact *</Label>
            <Input value={form.renter_contact} onChange={(e) => setForm({ ...form, renter_contact: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date *</Label>
              <Input type="date" value={form.rental_start_date} onChange={(e) => setForm({ ...form, rental_start_date: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Expected Return</Label>
              <Input type="date" value={form.expected_return_date} onChange={(e) => setForm({ ...form, expected_return_date: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Rental Fee (₹) *</Label>
              <Input type="number" value={form.rental_fee} onChange={(e) => setForm({ ...form, rental_fee: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Security Deposit (₹)</Label>
              <Input type="number" value={form.security_deposit} onChange={(e) => setForm({ ...form, security_deposit: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
          <Button type="submit" className="w-full" disabled={createRental.isPending}>
            {createRental.isPending ? "Saving..." : "Put on Rent"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
