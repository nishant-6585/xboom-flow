import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Plus, 
  X,
  Package, 
  TrendingUp, 
  FileText, 
  ShoppingCart,
  Users
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { QueryForm } from "@/components/QueryForm";
import { PipelineForm } from "@/components/pipeline/PipelineForm";
import { OrderForm } from "@/components/OrderForm";
import { SupplierForm } from "@/components/SupplierForm";
import { ManualProcurementForm } from "@/components/procurement/ManualProcurementForm";
import { useEnquiries } from "@/hooks/useEnquiries";
import { useOrders } from "@/hooks/useOrders";
import { useSuppliers } from "@/hooks/useSuppliers";
import { usePipelineOrders } from "@/hooks/usePipelineOrders";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type DialogType = "enquiry" | "pipeline" | "order" | "supplier" | "procurement" | null;

interface QuickAction {
  id: DialogType;
  label: string;
  icon: typeof Plus;
  color: string;
  bg: string;
  roles: string[];
}

export function FloatingActionButton() {
  const { role, user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [activeDialog, setActiveDialog] = useState<DialogType>(null);
  
  const { createEnquiry } = useEnquiries();
  const { createOrder } = useOrders();
  const { suppliers, createSupplier } = useSuppliers();
  const { createPipelineOrder } = usePipelineOrders();

  const actions: QuickAction[] = [
    {
      id: "enquiry",
      label: "Enquiry",
      icon: FileText,
      color: "text-blue-500",
      bg: "bg-blue-500",
      roles: ["sales", "admin"],
    },
    {
      id: "pipeline",
      label: "Pipeline",
      icon: TrendingUp,
      color: "text-emerald-500",
      bg: "bg-emerald-500",
      roles: ["sales", "admin", "supply_chain"],
    },
    {
      id: "order",
      label: "Order",
      icon: Package,
      color: "text-primary",
      bg: "bg-primary",
      roles: ["sales", "admin"],
    },
    {
      id: "procurement",
      label: "Procurement",
      icon: ShoppingCart,
      color: "text-violet-500",
      bg: "bg-violet-500",
      roles: ["admin", "supply_chain"],
    },
    {
      id: "supplier",
      label: "Supplier",
      icon: Users,
      color: "text-amber-500",
      bg: "bg-amber-500",
      roles: ["admin", "supply_chain"],
    },
  ];

  const filteredActions = actions.filter((action) => 
    action.roles.includes(role || "")
  );

  const handleActionClick = (actionId: DialogType) => {
    setIsOpen(false);
    setActiveDialog(actionId);
  };

  const handleEnquirySubmit = async (data: Parameters<typeof createEnquiry>[0]) => {
    const success = await createEnquiry(data);
    if (success) {
      setActiveDialog(null);
      toast.success("Enquiry created successfully");
    }
    return success;
  };

  const handlePipelineSubmit = async (data: Parameters<typeof createPipelineOrder>[0]) => {
    const success = await createPipelineOrder(data);
    if (success) {
      setActiveDialog(null);
      toast.success("Pipeline lead created successfully");
    }
    return success;
  };

  const handleOrderSubmit = async (
    data: Parameters<typeof createOrder>[0],
    paymentFiles?: File[],
    orderItems?: any[],
    invoiceFile?: File,
    poFiles?: File[]
  ) => {
    const success = await createOrder(data, paymentFiles, orderItems, invoiceFile, poFiles);
    if (success) {
      setActiveDialog(null);
      toast.success("Order created successfully");
    }
    return success;
  };

  const handleSupplierSubmit = async (data: Parameters<typeof createSupplier>[0]) => {
    const success = await createSupplier(data);
    if (success) {
      setActiveDialog(null);
      toast.success("Supplier added successfully");
    }
    return success;
  };

  // Don't render if not logged in or no actions available
  if (!user || filteredActions.length === 0) return null;

  return (
    <>
      {/* FAB Menu - Only visible on mobile */}
      <div className="fixed bottom-6 right-6 z-50 md:hidden">
        {/* Action buttons - appear when FAB is open */}
        <div 
          className={cn(
            "absolute bottom-16 right-0 flex flex-col-reverse gap-3 transition-all duration-300",
            isOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
          )}
        >
          {filteredActions.map((action, index) => (
            <div 
              key={action.id} 
              className="flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <span className="text-sm font-medium bg-background/90 backdrop-blur px-3 py-1.5 rounded-full shadow-lg border border-border whitespace-nowrap">
                {action.label}
              </span>
              <Button
                size="icon"
                className={cn(
                  "h-12 w-12 rounded-full shadow-lg",
                  action.bg,
                  "hover:scale-110 transition-transform"
                )}
                onClick={() => handleActionClick(action.id)}
              >
                <action.icon className="h-5 w-5 text-white" />
              </Button>
            </div>
          ))}
        </div>

        {/* Main FAB button */}
        <Button
          size="icon"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "h-14 w-14 rounded-full shadow-xl transition-all duration-300",
            isOpen 
              ? "bg-destructive hover:bg-destructive/90 rotate-45" 
              : "bg-primary hover:bg-primary/90"
          )}
        >
          {isOpen ? (
            <X className="h-6 w-6" />
          ) : (
            <Plus className="h-6 w-6" />
          )}
        </Button>

        {/* Backdrop */}
        {isOpen && (
          <div 
            className="fixed inset-0 bg-background/60 backdrop-blur-sm -z-10"
            onClick={() => setIsOpen(false)}
          />
        )}
      </div>

      {/* Enquiry Dialog */}
      <Dialog open={activeDialog === "enquiry"} onOpenChange={(open) => !open && setActiveDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-500" />
              New Enquiry
            </DialogTitle>
            <DialogDescription>Log a new customer enquiry for products</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-4">
            <QueryForm onSubmit={handleEnquirySubmit} />
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Pipeline Dialog */}
      <Dialog open={activeDialog === "pipeline"} onOpenChange={(open) => !open && setActiveDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
              Add Pipeline Lead
            </DialogTitle>
            <DialogDescription>Create a new sales pipeline entry</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-4">
            <PipelineForm onSubmit={handlePipelineSubmit} />
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Order Dialog */}
      <Dialog open={activeDialog === "order"} onOpenChange={(open) => !open && setActiveDialog(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              Create New Order
            </DialogTitle>
            <DialogDescription>Add a new customer order</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[75vh] pr-4">
            <OrderForm 
              onSubmit={handleOrderSubmit}
              suppliers={suppliers}
              showProcurementRate={role === "admin" || role === "supply_chain"}
              userRole={role as "sales" | "supply_chain" | "admin"}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Supplier Dialog */}
      <Dialog open={activeDialog === "supplier"} onOpenChange={(open) => !open && setActiveDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-500" />
              Add New Supplier
            </DialogTitle>
            <DialogDescription>Register a new supplier in the system</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-4">
            <SupplierForm 
              onSubmit={handleSupplierSubmit}
              onCancel={() => setActiveDialog(null)}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Procurement Dialog */}
      <ManualProcurementForm 
        open={activeDialog === "procurement"} 
        onOpenChange={(open) => !open && setActiveDialog(null)}
      />
    </>
  );
}
