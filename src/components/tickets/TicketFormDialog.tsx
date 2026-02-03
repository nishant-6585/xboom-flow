import { useState } from "react";
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
import { useTickets, CreateTicketData } from "@/hooks/useTickets";
import { useOrders } from "@/hooks/useOrders";
import { useEnquiries } from "@/hooks/useEnquiries";
import { Database } from "@/integrations/supabase/types";
import { Loader2 } from "lucide-react";

type TicketPriority = Database["public"]["Enums"]["ticket_priority"];
type TicketCategory = Database["public"]["Enums"]["ticket_category"];
type AppRole = Database["public"]["Enums"]["app_role"];

interface TicketFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const categories: { value: TicketCategory; label: string }[] = [
  { value: "general_inquiry", label: "General Inquiry" },
  { value: "order_issue", label: "Order Issue" },
  { value: "payment_issue", label: "Payment Issue" },
  { value: "delivery_issue", label: "Delivery Issue" },
  { value: "supplier_issue", label: "Supplier Issue" },
  { value: "procurement_request", label: "Procurement Request" },
  { value: "refund_request", label: "Refund Request" },
  { value: "technical_support", label: "Technical Support" },
  { value: "documentation", label: "Documentation" },
  { value: "other", label: "Other" },
];

const priorities: { value: TicketPriority; label: string }[] = [
  { value: "critical", label: "Critical (3h SLA)" },
  { value: "high", label: "High (6h SLA)" },
  { value: "medium", label: "Medium (24h SLA)" },
  { value: "low", label: "Low (48h SLA)" },
];

const departments: { value: AppRole; label: string }[] = [
  { value: "sales", label: "Sales" },
  { value: "supply_chain", label: "Supply Chain" },
  { value: "finance", label: "Finance" },
  { value: "admin", label: "Admin" },
];

export function TicketFormDialog({ open, onOpenChange }: TicketFormDialogProps) {
  const { createTicket } = useTickets();
  const { orders } = useOrders();
  const { enquiries } = useEnquiries();

  const [formData, setFormData] = useState<{
    subject: string;
    description: string;
    category: TicketCategory;
    priority: TicketPriority;
    assigned_department: AppRole;
    order_id: string;
    enquiry_id: string;
  }>({
    subject: "",
    description: "",
    category: "general_inquiry",
    priority: "medium",
    assigned_department: "admin",
    order_id: "",
    enquiry_id: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data: CreateTicketData = {
      subject: formData.subject,
      description: formData.description,
      category: formData.category,
      priority: formData.priority,
      assigned_department: formData.assigned_department,
      order_id: formData.order_id || null,
      enquiry_id: formData.enquiry_id || null,
    };

    await createTicket.mutateAsync(data);
    onOpenChange(false);
    setFormData({
      subject: "",
      description: "",
      category: "general_inquiry",
      priority: "medium",
      assigned_department: "admin",
      order_id: "",
      enquiry_id: "",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Raise New Ticket</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="subject">Subject *</Label>
            <Input
              id="subject"
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              placeholder="Brief description of the issue"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Provide detailed information about the issue..."
              rows={4}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select
                value={formData.category}
                onValueChange={(value: TicketCategory) =>
                  setFormData({ ...formData, category: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Priority *</Label>
              <Select
                value={formData.priority}
                onValueChange={(value: TicketPriority) =>
                  setFormData({ ...formData, priority: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorities.map((pri) => (
                    <SelectItem key={pri.value} value={pri.value}>
                      {pri.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Assign to Department *</Label>
            <Select
              value={formData.assigned_department}
              onValueChange={(value: AppRole) =>
                setFormData({ ...formData, assigned_department: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {departments.map((dept) => (
                  <SelectItem key={dept.value} value={dept.value}>
                    {dept.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Link to Order (Optional)</Label>
            <Select
              value={formData.order_id}
              onValueChange={(value) => setFormData({ ...formData, order_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an order..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {orders.map((order) => (
                  <SelectItem key={order.id} value={order.id}>
                    {order.order_number} - {order.customer_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Link to Enquiry (Optional)</Label>
            <Select
              value={formData.enquiry_id}
              onValueChange={(value) => setFormData({ ...formData, enquiry_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an enquiry..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {enquiries.map((enq) => (
                  <SelectItem key={enq.id} value={enq.id}>
                    {enq.customer_name} - {enq.product_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createTicket.isPending}>
              {createTicket.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Ticket
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
