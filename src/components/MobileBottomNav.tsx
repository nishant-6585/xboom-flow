import { Link, useLocation } from 'react-router-dom';
import { Home, ListTodo, Zap, MoreHorizontal, Calendar, LogOut, Package, FileSpreadsheet, ShoppingCart, Warehouse, Building2, IndianRupee, Shield, ClipboardList, Wrench, GraduationCap, Receipt, BookCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Badge } from '@/components/ui/badge';
import { useTasks } from '@/hooks/useTasks';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function MobileBottomNav() {
  const location = useLocation();
  const { role, roles, signOut, profile } = useAuth();
  const { taskCounts } = useTasks();
  const [moreOpen, setMoreOpen] = useState(false);

  if (!profile) return null;

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { path: "/", label: "Home", icon: Home },
    { path: "/tasks", label: "Tasks", icon: ListTodo, badge: taskCounts?.new_tasks || 0 },
    { path: "/sales", label: "Sales", icon: Zap, roles: ["sales", "sales_manager", "supply_chain", "admin"] },
    { path: "/meetings", label: "Meetings", icon: Calendar },
  ];

  const hasNavAccess = (itemRoles?: string[]) => !itemRoles || itemRoles.some((itemRole) => itemRole === role || roles.includes(itemRole as any));

  const moreItems = [
    { path: "/orders", label: "Orders", icon: Package, roles: ["sales", "sales_manager", "supply_chain", "admin", "finance", "it", "marketing", "hr"] },
    { path: "/pricelist", label: "Pricelist", icon: FileSpreadsheet, roles: ["sales", "supply_chain", "admin"] },
    { path: "/procurement", label: "Procurement", icon: ShoppingCart, roles: ["admin", "supply_chain", "finance"] },
    { path: "/inventory", label: "Inventory", icon: Warehouse, roles: ["sales", "supply_chain", "admin"] },
    { path: "/repairs", label: "Repairs", icon: Wrench, roles: ["sales", "supply_chain", "admin", "finance", "it", "marketing", "hr"] },
    { path: "/suppliers", label: "Suppliers", icon: Building2, roles: ["admin", "supply_chain", "finance"] },
    { path: "/finance", label: "Finance", icon: IndianRupee, roles: ["admin", "finance"] },
    // Forms hidden from mobile nav (route + page preserved).
    // { path: "/forms", label: "Forms", icon: ClipboardList, roles: ["sales", "supply_chain", "admin", "finance", "it", "marketing", "hr"] },
    { path: "/tally", label: "Tally", icon: BookCheck, roles: ["admin", "finance"] },
    { path: "/admin", label: "Admin", icon: Shield, roles: ["admin"] },
  ].filter(item => hasNavAccess(item.roles));

  const filteredNavItems = navItems.filter(item => hasNavAccess(item.roles));

  const handleMoreItemClick = () => {
    setMoreOpen(false);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-background border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {filteredNavItems.slice(0, 4).map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex flex-col items-center justify-center flex-1 py-2 px-1 relative transition-colors ${
              isActive(item.path)
                ? "text-primary"
                : "text-muted-foreground"
            }`}
          >
            <div className="relative">
              <item.icon className={`w-5 h-5 ${isActive(item.path) ? 'text-primary' : ''}`} />
              {item.badge && item.badge > 0 && (
                <Badge 
                  variant="destructive" 
                  className="absolute -top-2 -right-2 h-4 min-w-[16px] px-1 text-[10px] flex items-center justify-center"
                >
                  {item.badge > 99 ? '99+' : item.badge}
                </Badge>
              )}
            </div>
            <span className={`text-[10px] mt-1 font-medium ${isActive(item.path) ? 'text-primary' : ''}`}>
              {item.label}
            </span>
            {isActive(item.path) && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
            )}
          </Link>
        ))}

        {/* More Menu - Using Drawer for better mobile UX */}
        <Drawer open={moreOpen} onOpenChange={setMoreOpen}>
          <DrawerTrigger asChild>
            <button className="flex flex-col items-center justify-center flex-1 py-2 px-1 text-muted-foreground">
              <MoreHorizontal className="w-5 h-5" />
              <span className="text-[10px] mt-1 font-medium">More</span>
            </button>
          </DrawerTrigger>
          <DrawerContent className="max-h-[85vh]">
            <DrawerHeader className="pb-2">
              <DrawerTitle>More Options</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-6 space-y-1">
              {moreItems.map((item) => (
                <Link 
                  key={item.path}
                  to={item.path} 
                  onClick={handleMoreItemClick}
                  className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg transition-colors ${
                    isActive(item.path) 
                      ? 'bg-primary text-primary-foreground' 
                      : 'hover:bg-muted'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              ))}
              <div className="border-t border-border my-3" />
              <Button
                variant="ghost"
                className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 px-4 py-3 h-auto"
                onClick={() => {
                  setMoreOpen(false);
                  signOut();
                }}
              >
                <LogOut className="w-5 h-5 mr-3" />
                <span className="font-medium">Sign Out</span>
              </Button>
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    </nav>
  );
}
