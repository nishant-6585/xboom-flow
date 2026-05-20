import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useSparePartTransactions,
  type SparePart,
  type SparePartChangeReason,
  type SparePartChangeType,
} from "@/hooks/useSpareParts";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  part: SparePart | null;
}

export function AdjustQuantityDialog({ open, onOpenChange, part }: Props) {
  const { adjust } = useSparePartTransactions(part?.id);
  const [changeType, setChangeType] = useState<SparePartChangeType>("ADD");
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState<SparePartChangeReason>("PURCHASE");
  const [notes, setNotes] = useState("");

  if (!part) return null;

  const submit = async () => {
    await adjust.mutateAsync({
      part_id: part.id,
      change_type: changeType,
      quantity_change: Math.max(1, qty),
      reason,
      notes: notes.trim() || undefined,
    });
    onOpenChange(false);
    setQty(1);
    setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Adjust Stock — {part.part_name} ({part.quantity} on hand)
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Action</Label>
            <Select value={changeType} onValueChange={(v) => setChangeType(v as SparePartChangeType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ADD">+ Add Stock</SelectItem>
                <SelectItem value="REMOVE">− Remove Stock</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Quantity</Label>
            <Input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
          </div>
          <div className="col-span-2">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as SparePartChangeReason)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PURCHASE">Purchase</SelectItem>
                <SelectItem value="SALE">Sale</SelectItem>
                <SelectItem value="DAMAGE">Damage</SelectItem>
                <SelectItem value="MANUAL_ADJUSTMENT">Manual Adjustment</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={adjust.isPending || qty < 1}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}