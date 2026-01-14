import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

interface QuickAction {
  label: string;
  description: string;
  icon: typeof PlusCircle;
  href: string;
  color: string;
  bg: string;
  roles: string[];
}

export function QuickActions() {
  const { role } = useAuth();

  const actions: QuickAction[] = [
    {
      label: "New Enquiry",
      description: "Log a customer enquiry",
      icon: FileText,
      href: "/?tab=new",
      color: "text-blue-500",
      bg: "bg-blue-500/10 hover:bg-blue-500/20",
      roles: ["sales", "admin"],
    },
    {
      label: "Add Pipeline",
      description: "Create a new lead",
      icon: TrendingUp,
      href: "/sales?tab=pipeline&action=new",
      color: "text-emerald-500",
      bg: "bg-emerald-500/10 hover:bg-emerald-500/20",
      roles: ["sales", "admin", "supply_chain"],
    },
    {
      label: "Create Order",
      description: "Add a new order",
      icon: Package,
      href: "/orders?action=new",
      color: "text-primary",
      bg: "bg-primary/10 hover:bg-primary/20",
      roles: ["sales", "admin"],
    },
    {
      label: "Record Payment",
      description: "Log payment received",
      icon: IndianRupee,
      href: "/orders?tab=payments",
      color: "text-success",
      bg: "bg-success/10 hover:bg-success/20",
      roles: ["sales", "admin", "finance"],
    },
    {
      label: "Add Procurement",
      description: "Create procurement entry",
      icon: ShoppingCart,
      href: "/procurement?tab=inventory&action=new",
      color: "text-violet-500",
      bg: "bg-violet-500/10 hover:bg-violet-500/20",
      roles: ["admin", "supply_chain"],
    },
    {
      label: "Add Supplier",
      description: "Register new supplier",
      icon: Users,
      href: "/suppliers?action=new",
      color: "text-amber-500",
      bg: "bg-amber-500/10 hover:bg-amber-500/20",
      roles: ["admin", "supply_chain"],
    },
  ];

  const filteredActions = actions.filter((action) => 
    action.roles.includes(role || "")
  );

  if (filteredActions.length === 0) return null;

  return (
    <Card className="glass">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-5 h-5 text-warning" />
          <h3 className="font-semibold">Quick Actions</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {filteredActions.map((action) => (
            <Link key={action.label} to={action.href}>
              <Button
                variant="ghost"
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
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
