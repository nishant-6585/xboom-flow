import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ASSET_TYPES,
  ASSET_STATUSES,
  AssetFormData,
  EmployeeAsset,
  AssetType,
  AssetStatus,
} from "@/hooks/useEmployeeAssets";

interface Employee {
  id: string;
  name: string;
  is_active?: boolean;
}

interface AssetFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: AssetFormData) => Promise<boolean>;
  employees: Employee[];
  editingAsset?: EmployeeAsset | null;
}

export function AssetFormDialog({
  open,
  onOpenChange,
  onSubmit,
  employees,
  editingAsset,
}: AssetFormDialogProps) {
  const [formData, setFormData] = useState<AssetFormData>({
    employee_id: "",
    asset_type: "mobile_phone",
    asset_name: "",
    assigned_date: new Date().toISOString().split("T")[0],
    status: "assigned",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editingAsset) {
      setFormData({
        employee_id: editingAsset.employee_id || "",
        asset_type: editingAsset.asset_type,
        asset_name: editingAsset.asset_name,
        brand: editingAsset.brand || undefined,
        model: editingAsset.model || undefined,
        serial_number: editingAsset.serial_number || undefined,
        imei_number: editingAsset.imei_number || undefined,
        sim_number: editingAsset.sim_number || undefined,
        phone_number: editingAsset.phone_number || undefined,
        purchase_date: editingAsset.purchase_date || undefined,
        purchase_price: editingAsset.purchase_price || undefined,
        assigned_date: editingAsset.assigned_date,
        status: editingAsset.status,
        condition_on_assign: editingAsset.condition_on_assign || undefined,
        notes: editingAsset.notes || undefined,
      });
    } else {
      setFormData({
        employee_id: "",
        asset_type: "mobile_phone",
        asset_name: "",
        assigned_date: new Date().toISOString().split("T")[0],
        status: "assigned",
      });
    }
  }, [editingAsset, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const success = await onSubmit(formData);
    setSubmitting(false);
    if (success) {
      onOpenChange(false);
    }
  };

  const showPhoneFields = formData.asset_type === "mobile_phone" || formData.asset_type === "sim_card";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingAsset ? "Edit Asset" : "Assign New Asset"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Assign To *</Label>
              <Select
                value={formData.employee_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, employee_id: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.name}{emp.is_active === false ? " (Offboarded)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Asset Type *</Label>
              <Select
                value={formData.asset_type}
                onValueChange={(value: AssetType) =>
                  setFormData({ ...formData, asset_type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Status *</Label>
              <Select
                value={formData.status}
                onValueChange={(value: AssetStatus) =>
                  setFormData({ ...formData, status: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_STATUSES.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2">
              <Label>Asset Name *</Label>
              <Input
                value={formData.asset_name}
                onChange={(e) =>
                  setFormData({ ...formData, asset_name: e.target.value })
                }
                placeholder="e.g., iPhone 15 Pro, Dell Latitude 5520"
                required
              />
            </div>

            <div>
              <Label>Brand</Label>
              <Input
                value={formData.brand || ""}
                onChange={(e) =>
                  setFormData({ ...formData, brand: e.target.value })
                }
                placeholder="e.g., Apple, Dell, Samsung"
              />
            </div>

            <div>
              <Label>Model</Label>
              <Input
                value={formData.model || ""}
                onChange={(e) =>
                  setFormData({ ...formData, model: e.target.value })
                }
                placeholder="Model number"
              />
            </div>

            <div>
              <Label>Serial Number</Label>
              <Input
                value={formData.serial_number || ""}
                onChange={(e) =>
                  setFormData({ ...formData, serial_number: e.target.value })
                }
                placeholder="Serial/Product number"
              />
            </div>

            {showPhoneFields && (
              <>
                <div>
                  <Label>IMEI Number</Label>
                  <Input
                    value={formData.imei_number || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, imei_number: e.target.value })
                    }
                    placeholder="IMEI number"
                  />
                </div>

                <div>
                  <Label>SIM Number</Label>
                  <Input
                    value={formData.sim_number || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, sim_number: e.target.value })
                    }
                    placeholder="SIM card number"
                  />
                </div>

                <div>
                  <Label>Phone Number</Label>
                  <Input
                    value={formData.phone_number || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, phone_number: e.target.value })
                    }
                    placeholder="+91 XXXXX XXXXX"
                  />
                </div>
              </>
            )}

            <div>
              <Label>Purchase Date</Label>
              <Input
                type="date"
                value={formData.purchase_date || ""}
                onChange={(e) =>
                  setFormData({ ...formData, purchase_date: e.target.value })
                }
              />
            </div>

            <div>
              <Label>Purchase Price (₹)</Label>
              <Input
                type="number"
                value={formData.purchase_price || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    purchase_price: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                placeholder="0.00"
              />
            </div>

            <div>
              <Label>Assigned Date *</Label>
              <Input
                type="date"
                value={formData.assigned_date}
                onChange={(e) =>
                  setFormData({ ...formData, assigned_date: e.target.value })
                }
                required
              />
            </div>

            <div className="col-span-2">
              <Label>Condition on Assign</Label>
              <Input
                value={formData.condition_on_assign || ""}
                onChange={(e) =>
                  setFormData({ ...formData, condition_on_assign: e.target.value })
                }
                placeholder="e.g., New, Good, Minor scratches"
              />
            </div>

            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes || ""}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                placeholder="Any additional notes..."
                rows={2}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !formData.employee_id}>
              {submitting ? "Saving..." : editingAsset ? "Update" : "Assign Asset"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
