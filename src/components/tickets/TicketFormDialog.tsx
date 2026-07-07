import { useRef, useState, type ChangeEvent } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useTickets, CreateTicketData, useTeamMembers } from "@/hooks/useTickets";

import { useOrgRoles } from "@/hooks/useOrgRolesAndDepartments";
import { useOrders } from "@/hooks/useOrders";
import { useEnquiries } from "@/hooks/useEnquiries";
import { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2,
  ChevronRight,
  ChevronLeft,
  Check,
  AlertCircle,
  User,
  Building2,
  Link2,
  Clock,
  Paperclip,
  Upload,
  X,
  FileText,
  Image as ImageIcon,
} from "lucide-react";

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

const priorities: { value: TicketPriority; label: string; sla: string }[] = [
  { value: "critical", label: "Critical", sla: "3h SLA" },
  { value: "high", label: "High", sla: "6h SLA" },
  { value: "medium", label: "Medium", sla: "24h SLA" },
  { value: "low", label: "Low", sla: "48h SLA" },
];

// departments are now fetched dynamically via useOrgRoles

const steps = [
  { id: 1, title: "Basic Info", description: "Subject & Description" },
  { id: 2, title: "Category & Priority", description: "Classification" },
  { id: 3, title: "Assignment", description: "Department & Person" },
  { id: 4, title: "Links & Files", description: "References & Attachments" },
];

export function TicketFormDialog({ open, onOpenChange }: TicketFormDialogProps) {
  const { createTicket } = useTickets();
  const { orders } = useOrders();
  const { enquiries } = useEnquiries();
  const { data: teamMembers = [] } = useTeamMembers();
  const { roles: orgRoles } = useOrgRoles();

  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<{
    subject: string;
    description: string;
    category: TicketCategory;
    priority: TicketPriority;
    assigned_department: AppRole;
    assigned_to: string;
    order_id: string;
    enquiry_id: string;
  }>({
    subject: "",
    description: "",
    category: "general_inquiry",
    priority: "medium",
    assigned_department: "admin",
    assigned_to: "",
    order_id: "",
    enquiry_id: "",
  });

  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const departmentMembers = teamMembers.filter(
    (m) => m.role === formData.assigned_department
  );

  const getAttachmentFileName = (path: string) => {
    const fullName = path.split("/").pop() || "attachment";
    const cleanedName = fullName.replace(/^\d+-[a-z0-9]+-/i, "");
    return decodeURIComponent(cleanedName);
  };

  const isImageAttachment = (path: string) => {
    const ext = path.split(".").pop()?.toLowerCase();
    return ["jpg", "jpeg", "png", "gif", "webp"].includes(ext || "");
  };

  const handleAttachmentUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingFiles(true);

    try {
      const { validateFile } = await import("@/lib/fileValidation");
      const uploadedPaths: string[] = [];

      // The storage RLS policy on `ticket-attachments` requires the FIRST
      // path segment to equal auth.uid() (matches the pattern used across
      // the app). Without this the INSERT fails silently for every user
      // that isn't service-role, which is why internal-staff ticket
      // attachments never uploaded.
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) {
        toast.error("Please sign in again to upload attachments");
        return;
      }

      for (const file of Array.from(files)) {
        const validation = validateFile(file, "documents");
        if (!validation.valid) {
          toast.error(validation.error || "Invalid file");
          continue;
        }

        const safeName = file.name.replace(/\s+/g, "-");
        const storagePath = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;

        const { error } = await supabase.storage
          .from("ticket-attachments")
          .upload(storagePath, file);

        if (error) throw error;
        uploadedPaths.push(storagePath);
      }

      if (uploadedPaths.length > 0) {
        setAttachmentUrls((prev) => [...prev, ...uploadedPaths]);
        toast.success(`${uploadedPaths.length} attachment(s) uploaded`);
      }
    } catch (error) {
      console.error("Failed to upload ticket attachment", error);
      toast.error("Failed to upload attachment");
    } finally {
      setUploadingFiles(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (path: string) => {
    setAttachmentUrls((prev) => prev.filter((item) => item !== path));
  };

  const handleSubmit = async () => {
    const member = formData.assigned_to
      ? teamMembers.find((m) => m.user_id === formData.assigned_to)
      : null;

    const data: CreateTicketData = {
      subject: formData.subject,
      description: formData.description,
      category: formData.category,
      priority: formData.priority,
      assigned_department: formData.assigned_department,
      order_id: formData.order_id || null,
      enquiry_id: formData.enquiry_id || null,
      attachment_urls: attachmentUrls,
      assigned_to: formData.assigned_to || null,
      assigned_to_name: member?.name || null,
    };

    const createdTicket = await createTicket.mutateAsync(data);
    
    
    handleClose();
  };

  const handleClose = () => {
    onOpenChange(false);
    setCurrentStep(1);
    setAttachmentUrls([]);
    setFormData({
      subject: "",
      description: "",
      category: "general_inquiry",
      priority: "medium",
      assigned_department: "admin",
      assigned_to: "",
      order_id: "",
      enquiry_id: "",
    });
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return formData.subject.trim() && formData.description.trim();
      case 2:
        return formData.category && formData.priority;
      case 3:
        return formData.assigned_department;
      case 4:
        return true;
      default:
        return false;
    }
  };

  const progress = (currentStep / steps.length) * 100;

  const getPriorityColor = (priority: TicketPriority) => {
    switch (priority) {
      case "critical":
        return "bg-destructive text-destructive-foreground";
      case "high":
        return "bg-orange-500 text-white";
      case "medium":
        return "bg-yellow-500 text-white";
      case "low":
        return "bg-green-500 text-white";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="text-xl font-semibold">Raise New Ticket</DialogTitle>
          <div className="pt-4 space-y-3">
            <Progress value={progress} className="h-2" />
            <div className="flex justify-between">
              {steps.map((step) => (
                <div
                  key={step.id}
                  className={`flex items-center gap-2 text-xs ${
                    currentStep >= step.id ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                      currentStep > step.id
                        ? "bg-primary text-primary-foreground"
                        : currentStep === step.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {currentStep > step.id ? <Check className="w-4 h-4" /> : step.id}
                  </div>
                  <span className="hidden sm:inline">{step.title}</span>
                </div>
              ))}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Basic Info */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="subject" className="text-base font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Subject *
                </Label>
                <Input
                  id="subject"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="Brief description of the issue"
                  className="text-base"
                />
                <p className="text-xs text-muted-foreground">
                  Provide a clear, concise summary of your request
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-base font-medium">
                  Description *
                </Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Provide detailed information about the issue..."
                  rows={6}
                  className="text-base resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Include all relevant details, steps to reproduce, and expected outcome
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Category & Priority */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="space-y-3">
                <Label className="text-base font-medium">Category *</Label>
                <div className="grid grid-cols-2 gap-2">
                  {categories.map((cat) => (
                    <Button
                      key={cat.value}
                      type="button"
                      variant={formData.category === cat.value ? "default" : "outline"}
                      className="justify-start h-auto py-3 px-4"
                      onClick={() => setFormData({ ...formData, category: cat.value })}
                    >
                      {cat.label}
                    </Button>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label className="text-base font-medium flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Priority *
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {priorities.map((pri) => (
                    <Button
                      key={pri.value}
                      type="button"
                      variant={formData.priority === pri.value ? "default" : "outline"}
                      className={`justify-between h-auto py-3 px-4 ${
                        formData.priority === pri.value ? getPriorityColor(pri.value) : ""
                      }`}
                      onClick={() => setFormData({ ...formData, priority: pri.value })}
                    >
                      <span>{pri.label}</span>
                      <Badge variant="secondary" className="ml-2 text-xs">
                        {pri.sla}
                      </Badge>
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Assignment */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="space-y-3">
                <Label className="text-base font-medium flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Assign to Department *
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {orgRoles
                    .filter((dept) => ["admin", "hr", "finance", "supply_chain", "sales_manager", "it", "marketing", "sales"].includes(dept.name))
                    .map((dept) => (
                    <Button
                      key={dept.name}
                      type="button"
                      variant={formData.assigned_department === dept.name ? "default" : "outline"}
                      className="justify-start h-auto py-4 px-4"
                      onClick={() => setFormData({ 
                        ...formData, 
                        assigned_department: dept.name as AppRole,
                        assigned_to: "" // Reset assigned person when department changes
                      })}
                    >
                      <Building2 className="w-4 h-4 mr-2" />
                      {dept.label}
                    </Button>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label className="text-base font-medium flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Assign to Person (Optional)
                </Label>
                <p className="text-xs text-muted-foreground mb-2">
                  You can directly assign to a team member or let the department handle the assignment
                </p>
                {departmentMembers.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                    <Button
                      type="button"
                      variant={!formData.assigned_to ? "default" : "outline"}
                      className="justify-start h-auto py-3 px-4"
                      onClick={() => setFormData({ ...formData, assigned_to: "" })}
                    >
                      <User className="w-4 h-4 mr-2 opacity-50" />
                      Let department assign
                    </Button>
                    {departmentMembers.map((member) => (
                      <Button
                        key={member.user_id}
                        type="button"
                        variant={formData.assigned_to === member.user_id ? "default" : "outline"}
                        className="justify-start h-auto py-3 px-4"
                        onClick={() => setFormData({ ...formData, assigned_to: member.user_id })}
                      >
                        <User className="w-4 h-4 mr-2" />
                        {member.name}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground p-4 bg-muted rounded-lg">
                    No team members found in this department
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Links */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  Optionally link this ticket to an existing order or enquiry for better context.
                </p>
              </div>

              <div className="space-y-3">
                <Label className="text-base font-medium flex items-center gap-2">
                  <Link2 className="w-4 h-4" />
                  Link to Order
                </Label>
                <Select
                  value={formData.order_id || "none"}
                  onValueChange={(value) => setFormData({ ...formData, order_id: value === "none" ? "" : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an order..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {orders.map((order) => (
                      <SelectItem key={order.id} value={order.id}>
                        {order.order_number} - {order.customer_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-base font-medium flex items-center gap-2">
                  <Link2 className="w-4 h-4" />
                  Link to Enquiry
                </Label>
                <Select
                  value={formData.enquiry_id || "none"}
                  onValueChange={(value) => setFormData({ ...formData, enquiry_id: value === "none" ? "" : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an enquiry..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {enquiries.map((enq) => (
                      <SelectItem key={enq.id} value={enq.id}>
                        {enq.customer_name} - {enq.product_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-base font-medium flex items-center gap-2">
                  <Paperclip className="w-4 h-4" />
                  Attachments
                </Label>

                <div className="flex flex-wrap gap-2">
                  {attachmentUrls.map((path, index) => (
                    <div key={`${path}-${index}`} className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
                      {isImageAttachment(path) ? <ImageIcon className="h-4 w-4 text-muted-foreground" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
                      <span className="max-w-[220px] truncate">{getAttachmentFileName(path)}</span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(path)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Remove attachment"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <div
                  className="rounded-lg border border-dashed p-4 text-center"
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                >
                  {uploadingFiles ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Uploading files...
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="mx-auto h-6 w-6 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Click to upload attachments</p>
                      <p className="text-xs text-muted-foreground">PDF, Word, Excel, Images (max 10MB each)</p>
                    </div>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp"
                  onChange={handleAttachmentUpload}
                  className="hidden"
                />
              </div>

              {/* Summary */}
              <Separator />
              <div className="space-y-3">
                <Label className="text-base font-medium">Summary</Label>
                <div className="p-4 bg-muted rounded-lg space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subject:</span>
                    <span className="font-medium truncate ml-4 max-w-[200px]">{formData.subject}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Category:</span>
                    <span className="font-medium">
                      {categories.find(c => c.value === formData.category)?.label}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Priority:</span>
                    <Badge className={getPriorityColor(formData.priority)}>
                      {priorities.find(p => p.value === formData.priority)?.label}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Department:</span>
                    <span className="font-medium">
                      {orgRoles.find(d => d.name === formData.assigned_department)?.label || formData.assigned_department}
                    </span>
                  </div>
                  {formData.assigned_to && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Assigned To:</span>
                      <span className="font-medium">
                        {teamMembers.find(m => m.user_id === formData.assigned_to)?.name}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between gap-2 p-6 border-t bg-muted/30">
          <Button
            type="button"
            variant="outline"
            onClick={() => currentStep > 1 ? setCurrentStep(currentStep - 1) : handleClose()}
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            {currentStep > 1 ? "Back" : "Cancel"}
          </Button>
          
          {currentStep < steps.length ? (
            <Button
              type="button"
              onClick={() => setCurrentStep(currentStep + 1)}
              disabled={!canProceed()}
            >
              Next
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={createTicket.isPending || !canProceed()}
            >
              {createTicket.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Ticket
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
