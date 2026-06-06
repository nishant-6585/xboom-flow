import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Plus, 
  Package, 
  TrendingUp, 
  FileText, 
  ShoppingCart,
  Users
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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

// Haptic feedback utility
const triggerHaptic = (style: 'light' | 'medium' | 'heavy' = 'light') => {
  if ('vibrate' in navigator) {
    const patterns = {
      light: [10],
      medium: [20],
      heavy: [30, 10, 30]
    };
    navigator.vibrate(patterns[style]);
  }
};

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

  const handleActionClick = useCallback((actionId: DialogType) => {
    triggerHaptic('medium');
    setIsOpen(false);
    setActiveDialog(actionId);
  }, []);

  const handleFabToggle = useCallback(() => {
    triggerHaptic(isOpen ? 'light' : 'medium');
    setIsOpen(!isOpen);
  }, [isOpen]);

  const handleBackdropClick = useCallback(() => {
    triggerHaptic('light');
    setIsOpen(false);
  }, []);

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
      {/* FAB Menu - Visible on all screen sizes */}
      <div className="fixed bottom-6 right-6 z-50">
        {/* Action buttons - appear when FAB is open */}
        <div 
          className={cn(
            "absolute bottom-16 right-0 flex flex-col-reverse gap-3",
            "transition-all duration-300 ease-out",
            isOpen 
              ? "opacity-100 translate-y-0 scale-100" 
              : "opacity-0 translate-y-4 scale-95 pointer-events-none"
          )}
        >
          {filteredActions.map((action, index) => (
            <div 
              key={action.id} 
              className={cn(
                "flex items-center gap-3",
                "transition-all duration-300 ease-out",
                isOpen && "animate-scale-in"
              )}
              style={{ 
                animationDelay: `${index * 60}ms`,
                animationFillMode: 'backwards'
              }}
            >
              <span 
                className={cn(
                  "text-sm font-medium bg-background/95 backdrop-blur-md",
                  "px-3 py-1.5 rounded-full shadow-lg border border-border/50",
                  "whitespace-nowrap transition-all duration-200",
                  "hover:bg-background hover:shadow-xl"
                )}
              >
                {action.label}
              </span>
              <Button
                size="icon"
                className={cn(
                  "h-12 w-12 rounded-full shadow-lg",
                  action.bg,
                  "transition-all duration-200 ease-out",
                  "hover:scale-110 hover:shadow-xl",
                  "active:scale-95 active:shadow-md"
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
          onClick={handleFabToggle}
          className={cn(
            "h-14 w-14 rounded-full shadow-xl",
            "transition-all duration-300 ease-out",
            "active:scale-90",
            isOpen 
              ? "bg-destructive hover:bg-destructive/90 rotate-45 shadow-destructive/25" 
              : "bg-primary hover:bg-primary/90 hover:shadow-primary/25 hover:shadow-2xl"
          )}
        >
          <Plus className={cn(
            "h-6 w-6 transition-transform duration-300",
            isOpen && "rotate-45"
          )} />
        </Button>

        {/* Backdrop */}
        {isOpen && (
          <div 
            className={cn(
              "fixed inset-0 -z-10",
              "bg-background/60 backdrop-blur-sm",
              "animate-fade-in"
            )}
            onClick={handleBackdropClick}
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
        <DialogContent className="max-w-[min(1200px,95vw)] w-[95vw] max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              Create New Order
            </DialogTitle>
            <DialogDescription>Add a new customer order</DialogDescription>
          </DialogHeader>
          <div className="max-h-[75vh] overflow-y-auto overflow-x-hidden pr-2 -mr-2">
            <OrderForm
              onSubmit={handleOrderSubmit}
              suppliers={suppliers}
              showProcurementRate={false}
              userRole={role as "sales" | "supply_chain" | "admin"}
              embedded
            />
          </div>
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
