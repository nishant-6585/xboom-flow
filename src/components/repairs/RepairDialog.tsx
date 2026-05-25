import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Repair, RepairFormData, ISSUE_TYPES, PAYMENT_STATUSES, isInventoryLinkedComponent } from "@/hooks/useRepairs";
import { RepairForm } from "./RepairForm";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { Edit2, Trash2, Phone, Calendar, Clock, User, Wrench, IndianRupee, Link2 } from "lucide-react";

interface RepairDialogProps {
  repair: Repair | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (id: string, data: Partial<RepairFormData>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const paymentStatusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  partial: { label: "Partial", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  paid: { label: "Paid", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
};

export function RepairDialog({ repair, open, onOpenChange, onUpdate, onDelete }: RepairDialogProps) {
  const { role } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  if (!repair) return null;

  const issueTypeLabel = ISSUE_TYPES.find(t => t.value === repair.issue_type)?.label || repair.issue_type;
  const paymentConfig = paymentStatusConfig[repair.payment_status] || paymentStatusConfig.pending;

  const handleUpdate = async (data: RepairFormData) => {
    await onUpdate(repair.id, data);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    await onDelete(repair.id);
    setShowDeleteDialog(false);
    onOpenChange(false);
  };

  if (isEditing) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Edit Repair - {repair.repair_number}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-100px)] pr-4">
            <RepairForm
              initialData={{
                customer_name: repair.customer_name,
                model_name: repair.model_name,
                date_of_receipt: repair.date_of_receipt,
                contact_no: repair.contact_no,
                issue_details: repair.issue_details || "",
                issue_type: repair.issue_type,
                components_replaced: repair.components_replaced || [],
                inspection_charges: repair.inspection_charges,
                repair_cost_charged: repair.repair_cost_charged,
                date_completed: repair.date_completed,
                committed_date: repair.committed_date,
                payment_status: repair.payment_status,
                advance_amount: repair.advance_amount,
                total_quote_amount: repair.total_quote_amount,
                notes: repair.notes || "",
              }}
              onSubmit={handleUpdate}
              onCancel={() => setIsEditing(false)}
              isEditing
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DialogTitle>{repair.repair_number || "Repair Details"}</DialogTitle>
                <Badge className={paymentConfig.className}>{paymentConfig.label}</Badge>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                  <Edit2 className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                {role === "admin" && (
                  <Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)}>
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="max-h-[calc(90vh-120px)]">
            <div className="space-y-6 pr-4">
              {/* Customer Info */}
              <div>
                <h3 className="font-semibold text-lg mb-3">Customer Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">Customer</div>
                      <div className="font-medium">{repair.customer_name}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">Contact</div>
                      <div className="font-medium">{repair.contact_no}</div>
                    </div>
                  </div>
                  {repair.email && (
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm text-muted-foreground">Email</div>
                        <div className="font-medium break-all">{repair.email}</div>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">Model</div>
                      <div className="font-medium">{repair.model_name}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">Date of Receipt</div>
                      <div className="font-medium">{format(new Date(repair.date_of_receipt), "dd MMM yyyy")}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Customer-submitted intake form data */}
              {repair.intake_payload && Object.keys(repair.intake_payload).length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold text-lg mb-3">Customer Intake Form</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {Object.entries(repair.intake_payload)
                        .filter(([, v]) => v != null && v !== "")
                        .map(([key, value]) => {
                          const label = key
                            .replace(/_/g, " ")
                            .replace(/\b\w/g, c => c.toUpperCase());
                          const display =
                            typeof value === "object"
                              ? JSON.stringify(value)
                              : String(value);
                          return (
                            <div
                              key={key}
                              className="p-3 bg-muted/50 rounded-lg border border-border/40"
                            >
                              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                                {label}
                              </div>
                              <div className="font-medium mt-1 whitespace-pre-wrap break-words">
                                {display}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </>
              )}

              <Separator />

              {/* Issue Details */}
              <div>
                <h3 className="font-semibold text-lg mb-3">Issue Details</h3>
                <div className="space-y-3">
                  <div>
                    <div className="text-sm text-muted-foreground">Issue Type</div>
                    <Badge variant="outline">{issueTypeLabel}</Badge>
                  </div>
                  {repair.issue_details && (
                    <div>
                      <div className="text-sm text-muted-foreground">Details</div>
                      <p className="mt-1">{repair.issue_details}</p>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Components Replaced */}
              <div>
                <h3 className="font-semibold text-lg mb-3">Components Replaced</h3>
                {repair.components_replaced && repair.components_replaced.length > 0 ? (
                  <div className="space-y-2">
                    {(() => {
                      const linked = repair.components_replaced.filter(isInventoryLinkedComponent).length;
                      const manual = repair.components_replaced.length - linked;
                      return (
                        <div className="text-xs text-muted-foreground flex gap-3">
                          <span>From inventory: {linked}</span>
                          <span>Custom: {manual}</span>
                        </div>
                      );
                    })()}
                    {repair.components_replaced.map((comp, index) => (
                      <div key={index} className="flex justify-between items-center p-2 bg-muted rounded">
                        <div className="flex items-center gap-2 min-w-0">
                          {isInventoryLinkedComponent(comp) && (
                            <Link2 className="h-3.5 w-3.5 text-primary shrink-0" />
                          )}
                          <span className="truncate">{comp.name}</span>
                          {comp.part_code && (
                            <Badge variant="outline" className="text-xs font-mono">{comp.part_code}</Badge>
                          )}
                          {comp.quantity && comp.quantity > 1 && (
                            <Badge variant="secondary" className="text-xs">×{comp.quantity}</Badge>
                          )}
                        </div>
                        <span className="font-medium">₹{comp.cost.toLocaleString()}</span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center pt-2 border-t font-medium">
                      <span>Total Component Cost</span>
                      <span>₹{repair.total_component_cost?.toLocaleString() || 0}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No components replaced</p>
                )}
              </div>

              <Separator />

              {/* Charges & Profit */}
              <div>
                <h3 className="font-semibold text-lg mb-3">Charges & Profit</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <div className="text-sm text-muted-foreground">Inspection</div>
                    <div className="font-semibold text-lg">₹{repair.inspection_charges?.toLocaleString() || 0}</div>
                  </div>
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <div className="text-sm text-muted-foreground">Repair Cost</div>
                    <div className="font-semibold text-lg">₹{repair.repair_cost_charged?.toLocaleString() || 0}</div>
                  </div>
                  <div className={`p-3 rounded-lg text-center ${repair.profit >= 0 ? 'bg-green-100 dark:bg-green-900' : 'bg-red-100 dark:bg-red-900'}`}>
                    <div className="text-sm text-muted-foreground">Profit</div>
                    <div className={`font-semibold text-lg ${repair.profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      ₹{repair.profit?.toLocaleString() || 0}
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Payment Details */}
              <div>
                <h3 className="font-semibold text-lg mb-3">Payment Details</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <div className="text-sm text-muted-foreground">Quote Amount</div>
                    <div className="font-semibold">₹{repair.total_quote_amount?.toLocaleString() || 0}</div>
                  </div>
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <div className="text-sm text-muted-foreground">Advance</div>
                    <div className="font-semibold">₹{repair.advance_amount?.toLocaleString() || 0}</div>
                  </div>
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <div className="text-sm text-muted-foreground">Balance</div>
                    <div className="font-semibold">₹{repair.balance_amount?.toLocaleString() || 0}</div>
                  </div>
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <div className="text-sm text-muted-foreground">Status</div>
                    <Badge className={paymentConfig.className}>{paymentConfig.label}</Badge>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Timeline */}
              <div>
                <h3 className="font-semibold text-lg mb-3">Timeline</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">Committed Date</div>
                      <div className="font-medium">
                        {repair.committed_date ? format(new Date(repair.committed_date), "dd MMM yyyy") : "Not set"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">Completed Date</div>
                      <div className="font-medium">
                        {repair.date_completed ? format(new Date(repair.date_completed), "dd MMM yyyy") : "In progress"}
                      </div>
                    </div>
                  </div>
                  {repair.days_to_complete !== null && (
                    <div className="col-span-2">
                      <Badge variant="outline" className="text-sm">
                        Completed in {repair.days_to_complete} days
                      </Badge>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              {repair.notes && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold text-lg mb-3">Notes</h3>
                    <p className="text-muted-foreground">{repair.notes}</p>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Repair Job?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the repair job for {repair.customer_name}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
