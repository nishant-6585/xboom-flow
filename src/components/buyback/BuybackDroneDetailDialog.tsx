import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { BuybackDrone } from "@/hooks/useBuybackDrones";
import { format } from "date-fns";

interface Props {
  drone: BuybackDrone | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BuybackDroneDetailDialog({ drone, open, onOpenChange }: Props) {
  if (!drone) return null;

  const isSold = drone.stock_status === "Sold Out";

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

        <div className="space-y-4 text-sm">
          {/* Drone Info */}
          <div className="grid grid-cols-2 gap-3">
            <Detail label="Category" value={drone.drone_category} />
            <Detail label="Condition" value={drone.condition} />
            <Detail label="Serial Number" value={drone.serial_number} mono />
          </div>

          <Separator />

          {/* Buyback Details */}
          <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">Buyback Details</h4>
          <div className="grid grid-cols-2 gap-3">
            <Detail label="Buyback Price" value={`₹${drone.buyback_price.toLocaleString("en-IN")}`} />
            <Detail label="Buyback Date" value={format(new Date(drone.buyback_date), "dd MMM yyyy")} />
            <Detail label="Seller Name" value={drone.seller_name} />
            <Detail label="Seller Contact" value={drone.seller_contact} />
          </div>

          {/* Resale Details */}
          {isSold && (
            <>
              <Separator />
              <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">Resale Details</h4>
              <div className="grid grid-cols-2 gap-3">
                <Detail label="Selling Price" value={drone.selling_price ? `₹${drone.selling_price.toLocaleString("en-IN")}` : "—"} />
                <Detail label="Selling Date" value={drone.selling_date ? format(new Date(drone.selling_date), "dd MMM yyyy") : "—"} />
                <Detail label="Buyer Name" value={drone.buyer_name ?? "—"} />
                <Detail label="Buyer Contact" value={drone.buyer_contact ?? "—"} />
              </div>
            </>
          )}

          {/* Profit / Loss */}
          {drone.profit_loss !== null && (
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
