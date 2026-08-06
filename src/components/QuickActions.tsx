import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  PlusCircle, 
  Package, 
  TrendingUp, 
  IndianRupee, 
  FileText, 
  ShoppingCart,
  Users,
  Zap
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

type DialogType = "enquiry" | "pipeline" | "order" | "supplier" | "procurement" | null;

interface QuickAction {
  id: DialogType;
  label: string;
  description: string;
  icon: typeof PlusCircle;
  color: string;
  bg: string;
  roles: string[];
}

export function QuickActions() {
  const { role } = useAuth();
  const [activeDialog, setActiveDialog] = useState<DialogType>(null);
  
  const { createEnquiry } = useEnquiries();
  const { createOrder } = useOrders();
  const { suppliers, createSupplier } = useSuppliers();
  const { createPipelineOrder } = usePipelineOrders();

  const actions: QuickAction[] = [
    {
      id: "enquiry",
      label: "New Enquiry",
      description: "Log a customer enquiry",
      icon: FileText,
      color: "text-blue-500",
      bg: "bg-blue-500/10 hover:bg-blue-500/20",
      roles: ["sales", "admin"],
    },
    {
      id: "pipeline",
      label: "Add Pipeline",
      description: "Create a new lead",
      icon: TrendingUp,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10 hover:bg-emerald-500/20",
      roles: ["sales", "admin", "supply_chain"],
    },
    {
      id: "order",
      label: "Create Order",
      description: "Add a new order",
      icon: Package,
      color: "text-primary",
      bg: "bg-primary/10 hover:bg-primary/20",
      roles: ["sales", "admin"],
    },
    {
      id: "procurement",
      label: "Add Procurement",
      description: "Create procurement entry",
      icon: ShoppingCart,
      color: "text-violet-500",
      bg: "bg-violet-500/10 hover:bg-violet-500/20",
      roles: ["admin", "supply_chain"],
    },
    {
      id: "supplier",
      label: "Add Supplier",
      description: "Register new supplier",
      icon: Users,
      color: "text-amber-500",
      bg: "bg-amber-500/10 hover:bg-amber-500/20",
      roles: ["admin", "supply_chain"],
    },
  ];

  const filteredActions = actions.filter((action) => 
    action.roles.includes(role || "")
  );

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

  if (filteredActions.length === 0) return null;

  return (
    <>
      <Card className="glass">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-warning" />
            <h3 className="font-semibold">Quick Actions</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {filteredActions.map((action) => (
              <Button
                key={action.id}
                variant="ghost"
                onClick={() => setActiveDialog(action.id)}
                className={`w-full h-auto flex-col items-center gap-2 p-4 ${action.bg} border border-transparent hover:border-border transition-all`}
              >
                <action.icon className={`w-6 h-6 ${action.color}`} />
                <div className="text-center">
                  <p className="text-sm font-medium">{action.label}</p>
                  <p className="text-[10px] text-muted-foreground hidden sm:block">
                    {action.description}
                  </p>
                </div>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

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
        <DialogContent className="flex h-[90dvh] max-h-[90dvh] w-[95vw] max-w-[min(1200px,95vw)] flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              Create New Order
            </DialogTitle>
            <DialogDescription>Add a new customer order</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overscroll-contain overflow-y-auto overflow-x-hidden pr-2 -mr-2">
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
