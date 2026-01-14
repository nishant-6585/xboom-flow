import { Link, useLocation } from 'react-router-dom';
import { Home, ListTodo, Zap, Package, MoreHorizontal, Calendar } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';
import { useTasks } from '@/hooks/useTasks';

export function MobileBottomNav() {
  const location = useLocation();
  const { role, signOut, profile } = useAuth();
  const { taskCounts } = useTasks();

  if (!profile) return null;

  const isActive = (path: string) => location.pathname === path;

  // Core navigation items (max 4 + More)
  const navItems = [
    { path: "/", label: "Home", icon: Home },
    { path: "/tasks", label: "Tasks", icon: ListTodo, badge: taskCounts?.new_tasks || 0 },
    { path: "/sales", label: "Sales", icon: Zap, roles: ["sales", "supply_chain", "admin"] },
    { path: "/meetings", label: "Meetings", icon: Calendar },
  ];

  // More menu items based on role
  const moreItems = [
    { path: "/orders", label: "Orders", roles: ["sales", "supply_chain", "admin", "finance"] },
    { path: "/pricelist", label: "Pricelist", roles: ["sales", "supply_chain", "admin"] },
    { path: "/procurement", label: "Procurement", roles: ["admin", "supply_chain", "finance"] },
    { path: "/inventory", label: "Inventory", roles: ["sales", "supply_chain", "admin"] },
    { path: "/suppliers", label: "Suppliers", roles: ["admin", "supply_chain", "finance"] },
    { path: "/finance", label: "Finance", roles: ["admin", "finance"] },
    { path: "/admin", label: "Admin", roles: ["admin"] },
  ].filter(item => !item.roles || item.roles.includes(role || ""));

  const filteredNavItems = navItems.filter(item => 
    !item.roles || item.roles.includes(role || "")
  );

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

        {/* More Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex flex-col items-center justify-center flex-1 py-2 px-1 text-muted-foreground">
              <MoreHorizontal className="w-5 h-5" />
              <span className="text-[10px] mt-1 font-medium">More</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-48 mb-2">
            {moreItems.map((item) => (
              <DropdownMenuItem key={item.path} asChild>
                <Link 
                  to={item.path} 
                  className={`w-full ${isActive(item.path) ? 'text-primary font-medium' : ''}`}
                >
                  {item.label}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="text-destructive">
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
