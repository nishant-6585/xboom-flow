import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BuybackDrone, useBuybackDrones } from "@/hooks/useBuybackDrones";
import { format } from "date-fns";
import { Pencil, Save, X } from "lucide-react";

interface Props {
  drone: BuybackDrone | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const categories = ["Mini", "Air", "Mavic", "FPV", "Enterprise", "Other"];
const conditions = ["New", "Used", "Repaired"];

export function BuybackDroneDetailDialog({ drone, open, onOpenChange }: Props) {
  const { updateDrone } = useBuybackDrones();
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});

  useEffect(() => {
    if (drone) {
      setForm({
        drone_category: drone.drone_category,
        drone_model: drone.drone_model,
        serial_number: drone.serial_number,
        condition: drone.condition,
        buyback_price: drone.buyback_price,
        seller_name: drone.seller_name,
        seller_contact: drone.seller_contact,
        buyback_date: drone.buyback_date,
        selling_price: drone.selling_price,
        buyer_name: drone.buyer_name,
        buyer_contact: drone.buyer_contact,
        selling_date: drone.selling_date,
      });
      setIsEditing(false);
    }
  }, [drone]);

  if (!drone) return null;

  const isSold = drone.stock_status === "Sold Out";

  const handleSave = () => {
    updateDrone.mutate(
      { id: drone.id, ...form },
      { onSuccess: () => setIsEditing(false) }
    );
  };

  const updateField = (key: string, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {drone.drone_model}
            <Badge
              variant="outline"
              className={
                isSold
                  ? "bg-orange-500/10 text-orange-600 border-orange-500/20"
                  : "bg-green-500/10 text-green-600 border-green-500/20"
              }
            >
              {drone.stock_status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex justify-end -mt-2">
          {!isEditing ? (
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
            </Button>
          ) : (
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => { setIsEditing(false); setForm({ drone_category: drone.drone_category, drone_model: drone.drone_model, serial_number: drone.serial_number, condition: drone.condition, buyback_price: drone.buyback_price, seller_name: drone.seller_name, seller_contact: drone.seller_contact, buyback_date: drone.buyback_date, selling_price: drone.selling_price, buyer_name: drone.buyer_name, buyer_contact: drone.buyer_contact, selling_date: drone.selling_date }); }}>
                <X className="w-3.5 h-3.5 mr-1" /> Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={updateDrone.isPending}>
                <Save className="w-3.5 h-3.5 mr-1" /> Save
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-4 text-sm">
          {/* Drone Info */}
          <div className="grid grid-cols-2 gap-3">
            {isEditing ? (
              <>
                <EditField label="Category">
                  <Select value={form.drone_category} onValueChange={(v) => updateField("drone_category", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </EditField>
                <EditField label="Condition">
                  <Select value={form.condition} onValueChange={(v) => updateField("condition", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{conditions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </EditField>
                <EditField label="Model">
                  <Input value={form.drone_model} onChange={(e) => updateField("drone_model", e.target.value)} />
                </EditField>
                <EditField label="Serial Number">
                  <Input value={form.serial_number} onChange={(e) => updateField("serial_number", e.target.value)} className="font-mono text-xs" />
                </EditField>
              </>
            ) : (
              <>
                <Detail label="Category" value={drone.drone_category} />
                <Detail label="Condition" value={drone.condition} />
                <Detail label="Serial Number" value={drone.serial_number} mono />
              </>
            )}
          </div>

          <Separator />

          {/* Buyback Details */}
          <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">Buyback Details</h4>
          <div className="grid grid-cols-2 gap-3">
            {isEditing ? (
              <>
                <EditField label="Buyback Price (₹)">
                  <Input type="number" value={form.buyback_price} onChange={(e) => updateField("buyback_price", Number(e.target.value))} />
                </EditField>
                <EditField label="Buyback Date">
                  <Input type="date" value={form.buyback_date} onChange={(e) => updateField("buyback_date", e.target.value)} />
                </EditField>
                <EditField label="Seller Name">
                  <Input value={form.seller_name} onChange={(e) => updateField("seller_name", e.target.value)} />
                </EditField>
                <EditField label="Seller Contact">
                  <Input value={form.seller_contact} onChange={(e) => updateField("seller_contact", e.target.value)} />
                </EditField>
              </>
            ) : (
              <>
                <Detail label="Buyback Price" value={`₹${drone.buyback_price.toLocaleString("en-IN")}`} />
                <Detail label="Buyback Date" value={format(new Date(drone.buyback_date), "dd MMM yyyy")} />
                <Detail label="Seller Name" value={drone.seller_name} />
                <Detail label="Seller Contact" value={drone.seller_contact} />
              </>
            )}
          </div>

          {/* Resale Details */}
          {(isSold || isEditing) && (
            <>
              <Separator />
              <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">Resale Details</h4>
              <div className="grid grid-cols-2 gap-3">
                {isEditing ? (
                  <>
                    <EditField label="Selling Price (₹)">
                      <Input type="number" value={form.selling_price ?? ""} onChange={(e) => updateField("selling_price", e.target.value ? Number(e.target.value) : null)} />
                    </EditField>
                    <EditField label="Selling Date">
                      <Input type="date" value={form.selling_date ?? ""} onChange={(e) => updateField("selling_date", e.target.value || null)} />
                    </EditField>
                    <EditField label="Buyer Name">
                      <Input value={form.buyer_name ?? ""} onChange={(e) => updateField("buyer_name", e.target.value || null)} />
                    </EditField>
                    <EditField label="Buyer Contact">
                      <Input value={form.buyer_contact ?? ""} onChange={(e) => updateField("buyer_contact", e.target.value || null)} />
                    </EditField>
                  </>
                ) : (
                  <>
                    <Detail label="Selling Price" value={drone.selling_price ? `₹${drone.selling_price.toLocaleString("en-IN")}` : "—"} />
                    <Detail label="Selling Date" value={drone.selling_date ? format(new Date(drone.selling_date), "dd MMM yyyy") : "—"} />
                    <Detail label="Buyer Name" value={drone.buyer_name ?? "—"} />
                    <Detail label="Buyer Contact" value={drone.buyer_contact ?? "—"} />
                  </>
                )}
              </div>
            </>
          )}

          {/* Profit / Loss */}
          {drone.profit_loss !== null && !isEditing && (
            <>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="font-medium">Profit / Loss</span>
                <span className={`font-bold text-base ${drone.profit_loss >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {drone.profit_loss >= 0 ? "+" : ""}₹{drone.profit_loss.toLocaleString("en-IN")}
                </span>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`font-medium ${mono ? "font-mono text-xs" : ""}`}>{value}</p>
    </div>
  );
}

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs">{label}</p>
      {children}
    </div>
  );
}
