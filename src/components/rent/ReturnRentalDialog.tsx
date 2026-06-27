import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RentalRecord, useRentals } from "@/hooks/useRentals";

interface Props {
  rental: RentalRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReturnRentalDialog({ rental, open, onOpenChange }: Props) {
  const { returnRental } = useRentals();
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (rental) {
      setDate(new Date().toISOString().split("T")[0]);
      setNotes(rental.notes ?? "");
    }
  }, [rental]);

  if (!rental) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    returnRental.mutate(
      { id: rental.id, actual_return_date: date, notes },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mark Rental as Returned</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
            <p><strong>{rental.drone?.drone_model}</strong> — {rental.drone?.serial_number}</p>
            <p>Renter: {rental.renter_name}</p>
          </div>
          <div className="space-y-2">
            <Label>Return Date *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <Button type="submit" className="w-full" disabled={returnRental.isPending}>
            {returnRental.isPending ? "Saving..." : "Confirm Return"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
