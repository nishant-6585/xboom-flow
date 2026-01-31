import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  EmployeeAsset,
  ASSET_TYPES,
  ASSET_STATUSES,
} from "@/hooks/useEmployeeAssets";
import {
  Smartphone,
  Laptop,
  Camera,
  Tablet,
  Headphones,
  Monitor,
  Keyboard,
  Mouse,
  CreditCard,
  Package,
  MoreVertical,
  Edit,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { format } from "date-fns";

interface AssetCardProps {
  asset: EmployeeAsset;
  onEdit: (asset: EmployeeAsset) => void;
  onDelete: (id: string) => void;
  onMarkReturned: (asset: EmployeeAsset) => void;
}

const getAssetIcon = (type: string) => {
  switch (type) {
    case "mobile_phone":
      return Smartphone;
    case "sim_card":
      return CreditCard;
    case "laptop":
      return Laptop;
    case "camera":
      return Camera;
    case "tablet":
      return Tablet;
    case "headset":
      return Headphones;
    case "monitor":
      return Monitor;
    case "keyboard":
      return Keyboard;
    case "mouse":
      return Mouse;
    default:
      return Package;
  }
};

export function AssetCard({ asset, onEdit, onDelete, onMarkReturned }: AssetCardProps) {
  const Icon = getAssetIcon(asset.asset_type);
  const typeLabel = ASSET_TYPES.find((t) => t.value === asset.asset_type)?.label || asset.asset_type;
  const statusInfo = ASSET_STATUSES.find((s) => s.value === asset.status);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium truncate">{asset.asset_name}</h4>
              <p className="text-sm text-muted-foreground">{typeLabel}</p>
              {asset.employees && (
                <p className="text-sm font-medium text-primary mt-1">
                  {asset.employees.name}
                </p>
              )}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(asset)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              {asset.status === "assigned" && (
                <DropdownMenuItem onClick={() => onMarkReturned(asset)}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Mark Returned
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => onDelete(asset.id)}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <Badge className={statusInfo?.color || "bg-gray-100"}>
              {statusInfo?.label || asset.status}
            </Badge>
            {asset.serial_number && (
              <span className="text-xs text-muted-foreground">
                S/N: {asset.serial_number}
              </span>
            )}
          </div>

          {(asset.brand || asset.model) && (
            <p className="text-xs text-muted-foreground">
              {[asset.brand, asset.model].filter(Boolean).join(" • ")}
            </p>
          )}

          {asset.phone_number && (
            <p className="text-xs text-muted-foreground">
              📞 {asset.phone_number}
            </p>
          )}

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
            <span>Assigned: {format(new Date(asset.assigned_date), "dd MMM yyyy")}</span>
            {asset.purchase_price && (
              <span>₹{asset.purchase_price.toLocaleString()}</span>
            )}
          </div>

          {asset.return_date && (
            <p className="text-xs text-muted-foreground">
              Returned: {format(new Date(asset.return_date), "dd MMM yyyy")}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
