import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, X, Link2, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PartSelector } from "./PartSelector";
import { 
  RepairFormData, 
  ComponentReplaced, 
  ISSUE_TYPES, 
  PAYMENT_STATUSES,
  RepairIssueType,
  RepairPaymentStatus,
  isInventoryLinkedComponent,
} from "@/hooks/useRepairs";
import { format } from "date-fns";

interface RepairFormProps {
  onSubmit: (data: RepairFormData) => Promise<void>;
  onCancel?: () => void;
  initialData?: Partial<RepairFormData>;
  isEditing?: boolean;
}

export function RepairForm({ onSubmit, onCancel, initialData, isEditing }: RepairFormProps) {
  const [formData, setFormData] = useState<RepairFormData>({
    customer_name: initialData?.customer_name || "",
    model_name: initialData?.model_name || "",
    date_of_receipt: initialData?.date_of_receipt || format(new Date(), "yyyy-MM-dd"),
    contact_no: initialData?.contact_no || "",
    issue_details: initialData?.issue_details || "",
    issue_type: initialData?.issue_type || "other",
    components_replaced: initialData?.components_replaced || [],
    inspection_charges: initialData?.inspection_charges || 0,
    repair_cost_charged: initialData?.repair_cost_charged || 0,
    date_completed: initialData?.date_completed || null,
    committed_date: initialData?.committed_date || null,
    payment_status: initialData?.payment_status || "pending",
    advance_amount: initialData?.advance_amount || 0,
    total_quote_amount: initialData?.total_quote_amount || 0,
    notes: initialData?.notes || "",
  });

  const [newComponent, setNewComponent] = useState<ComponentReplaced>({ name: "", cost: 0 });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [partSelectorOpen, setPartSelectorOpen] = useState(false);
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(null);

  const totalComponentCost = formData.components_replaced.reduce(
    (sum, comp) => sum + (comp.cost || 0),
    0
  );

  const calculatedProfit = 
    (formData.inspection_charges || 0) + 
    (formData.repair_cost_charged || 0) - 
    totalComponentCost;

  const balanceAmount = (formData.total_quote_amount || 0) - (formData.advance_amount || 0);

  const handleAddComponent = () => {
    if (newComponent.name.trim() && newComponent.cost > 0) {
      setFormData({
        ...formData,
        components_replaced: [...formData.components_replaced, { ...newComponent }],
      });
      setNewComponent({ name: "", cost: 0 });
    }
  };

  const handleRemoveComponent = (index: number) => {
    const comp = formData.components_replaced[index];
    if (comp && isInventoryLinkedComponent(comp)) {
      setPendingRemoveIndex(index);
      return;
    }
    setFormData({
      ...formData,
      components_replaced: formData.components_replaced.filter((_, i) => i !== index),
    });
  };

  const confirmRemoveLinked = () => {
    if (pendingRemoveIndex === null) return;
    setFormData({
      ...formData,
      components_replaced: formData.components_replaced.filter((_, i) => i !== pendingRemoveIndex),
    });
    setPendingRemoveIndex(null);
  };

  const handleAddFromInventory = (component: ComponentReplaced) => {
    setFormData({
      ...formData,
      components_replaced: [...formData.components_replaced, component],
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customer_name.trim() || !formData.model_name.trim() || !formData.contact_no.trim()) {
      return;
    }
    
    setIsSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Customer & Model Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Customer Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="customer_name">Customer Name *</Label>
            <Input
              id="customer_name"
              value={formData.customer_name}
              onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
              placeholder="Enter customer name"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact_no">Contact Number *</Label>
            <Input
              id="contact_no"
              value={formData.contact_no}
              onChange={(e) => setFormData({ ...formData, contact_no: e.target.value })}
              placeholder="Enter contact number"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="model_name">Model Name *</Label>
            <Input
              id="model_name"
              value={formData.model_name}
              onChange={(e) => setFormData({ ...formData, model_name: e.target.value })}
              placeholder="Enter drone model"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="date_of_receipt">Date of Receipt</Label>
            <Input
              id="date_of_receipt"
              type="date"
              value={formData.date_of_receipt}
              onChange={(e) => setFormData({ ...formData, date_of_receipt: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Issue Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Issue Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="issue_type">Issue Type</Label>
            <Select
              value={formData.issue_type}
              onValueChange={(value) => setFormData({ ...formData, issue_type: value as RepairIssueType })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select issue type" />
              </SelectTrigger>
              <SelectContent>
                {ISSUE_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="issue_details">Issue Details</Label>
            <Textarea
              id="issue_details"
              value={formData.issue_details}
              onChange={(e) => setFormData({ ...formData, issue_details: e.target.value })}
              placeholder="Describe the issue in detail"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Components Replaced */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Components Replaced</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {formData.components_replaced.length > 0 && (
            <div className="space-y-2">
              {formData.components_replaced.map((comp, index) => (
                <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {isInventoryLinkedComponent(comp) && (
                        <Link2 className="h-3.5 w-3.5 text-primary shrink-0" />
                      )}
                      <span className="truncate">{comp.name}</span>
                      {comp.part_code && (
                        <Badge variant="outline" className="text-xs font-mono">
                          {comp.part_code}
                        </Badge>
                      )}
                      {comp.quantity && comp.quantity > 1 && (
                        <Badge variant="secondary" className="text-xs">
                          Qty: {comp.quantity}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <span className="font-medium">₹{comp.cost.toLocaleString()}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleRemoveComponent(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div className="text-right font-medium text-sm pt-2 border-t">
                Total Component Cost: ₹{totalComponentCost.toLocaleString()}
              </div>
            </div>
          )}
          
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="default"
                onClick={() => setPartSelectorOpen(true)}
              >
                <Package className="h-4 w-4 mr-2" />
                Add from Inventory
              </Button>
              <p className="text-xs text-muted-foreground self-center">
                Auto-deducts spare-parts stock.
              </p>
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">Custom component name</Label>
                <Input
                  placeholder="e.g. Custom bracket, third-party part"
                  value={newComponent.name}
                  onChange={(e) => setNewComponent({ ...newComponent, name: e.target.value })}
                />
              </div>
              <div className="w-32">
                <Label className="text-xs text-muted-foreground">Cost (₹)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={newComponent.cost || ""}
                  onChange={(e) => setNewComponent({ ...newComponent, cost: Number(e.target.value) })}
                />
              </div>
              <Button type="button" variant="outline" onClick={handleAddComponent}>
                <Plus className="h-4 w-4 mr-1" /> Add Custom
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charges & Costs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Charges & Costs</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="inspection_charges">Inspection Charges (₹)</Label>
            <Input
              id="inspection_charges"
              type="number"
              value={formData.inspection_charges || ""}
              onChange={(e) => setFormData({ ...formData, inspection_charges: Number(e.target.value) })}
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="repair_cost_charged">Repair Cost Charged (₹)</Label>
            <Input
              id="repair_cost_charged"
              type="number"
              value={formData.repair_cost_charged || ""}
              onChange={(e) => setFormData({ ...formData, repair_cost_charged: Number(e.target.value) })}
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label>Calculated Profit (₹)</Label>
            <div className={`h-10 px-3 py-2 border rounded-md bg-muted font-medium ${calculatedProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ₹{calculatedProfit.toLocaleString()}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label htmlFor="total_quote_amount">Total Quote Amount (₹)</Label>
            <Input
              id="total_quote_amount"
              type="number"
              value={formData.total_quote_amount || ""}
              onChange={(e) => setFormData({ ...formData, total_quote_amount: Number(e.target.value) })}
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="advance_amount">Advance Received (₹)</Label>
            <Input
              id="advance_amount"
              type="number"
              value={formData.advance_amount || ""}
              onChange={(e) => setFormData({ ...formData, advance_amount: Number(e.target.value) })}
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label>Balance Amount (₹)</Label>
            <div className="h-10 px-3 py-2 border rounded-md bg-muted font-medium">
              ₹{balanceAmount.toLocaleString()}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment_status">Payment Status</Label>
            <Select
              value={formData.payment_status}
              onValueChange={(value) => setFormData({ ...formData, payment_status: value as RepairPaymentStatus })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_STATUSES.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="committed_date">Committed Completion Date</Label>
            <Input
              id="committed_date"
              type="date"
              value={formData.committed_date || ""}
              onChange={(e) => setFormData({ ...formData, committed_date: e.target.value || null })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="date_completed">Actual Completion Date</Label>
            <Input
              id="date_completed"
              type="date"
              value={formData.date_completed || ""}
              onChange={(e) => setFormData({ ...formData, date_completed: e.target.value || null })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Additional Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Any additional notes..."
            rows={3}
          />
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : isEditing ? "Update Repair" : "Create Repair Job"}
        </Button>
      </div>

      <PartSelector
        open={partSelectorOpen}
        onOpenChange={setPartSelectorOpen}
        onSelect={handleAddFromInventory}
      />

      <AlertDialog open={pendingRemoveIndex !== null} onOpenChange={(o) => !o && setPendingRemoveIndex(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove inventory-linked part?</AlertDialogTitle>
            <AlertDialogDescription>
              This part was deducted from Spare Parts inventory when it was added.
              Removing it here will <strong>not</strong> restore stock automatically.
              If the part wasn't actually used, please adjust the quantity manually
              in the Spare Parts module.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemoveLinked}>Remove anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
