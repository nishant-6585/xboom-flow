import { useState } from "react";
import { LogOut, Shield, Package, Building2, Menu, Home, ShoppingCart, Warehouse, FileSpreadsheet, Zap, IndianRupee, ListTodo, Users, CalendarDays, Receipt, ClipboardList, Wrench, GraduationCap, FileText, Ticket, BookCheck, RotateCcw, Activity, User, KeyRound, ShieldCheck, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation, useNavigate } from "react-router-dom";
import logoFull from "@/assets/logo-full.jpeg";
import { NotificationPanel } from "@/components/NotificationPanel";
import { AttendanceWidget } from "@/components/attendance/AttendanceWidget";
import { useIsMobile } from "@/hooks/use-mobile";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function Header() {
  const { profile, role, signOut } = useAuth();
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleLabel = (role: string | null) => {
    switch (role) {
      case "sales":
        return "Sales";
      case "supply_chain":
        return "Supply Chain";
      case "finance":
        return "Finance";
      case "admin":
        return "Admin";
      case "it":
        return "IT";
      case "marketing":
        return "Marketing";
      default:
        return "User";
    }
  };

  const isActive = (path: string) => location.pathname === path;

  // Main navigation items
  const mainNavItems = [
    { path: "/", label: "Dashboard", icon: Home, roles: ["sales", "sales_manager", "supply_chain", "admin", "finance", "it", "marketing", "hr"] },
    { path: "/sales", label: "Sales", icon: Zap, roles: ["sales", "sales_manager", "supply_chain", "admin"] },
    { path: "/orders", label: "Orders", icon: Package, roles: ["sales", "sales_manager", "supply_chain", "admin", "finance", "it", "marketing", "hr"] },
    { path: "/pricelist", label: "Pricelist", icon: FileSpreadsheet, roles: ["sales", "sales_manager", "supply_chain", "admin"] },
    { path: "/procurement", label: "Procurement", icon: ShoppingCart, roles: ["admin", "supply_chain", "finance"] },
    { path: "/inventory", label: "Inventory", icon: Warehouse, roles: ["sales", "sales_manager", "supply_chain", "admin"] },
    { path: "/suppliers", label: "Suppliers", icon: Building2, roles: ["admin", "supply_chain", "finance"] },
    { path: "/finance", label: "Finance", icon: IndianRupee, roles: ["admin", "finance"] },
    { path: "/tally", label: "Tally", icon: BookCheck, roles: ["admin"] },
    { path: "/admin", label: "Admin", icon: Shield, roles: ["admin"] },
  ];

  // Secondary navigation items (Tasks, HR, Expenses, Forms, Repairs, Trainings, Tickets)
  const secondaryNavItems = [
    { path: "/tasks", label: "Tasks", icon: ListTodo, roles: ["sales", "sales_manager", "supply_chain", "admin", "finance", "it", "marketing", "hr"] },
    { path: "/tickets", label: "Tickets", icon: Ticket, roles: ["sales", "sales_manager", "supply_chain", "admin", "finance", "it", "marketing", "hr"] },
    { path: "/hr", label: "HR", icon: Users, roles: ["sales", "sales_manager", "supply_chain", "admin", "finance", "it", "marketing", "hr"] },
    { path: "/meetings", label: "Meetings", icon: CalendarDays, roles: ["sales", "sales_manager", "supply_chain", "admin", "finance", "it", "marketing", "hr"] },
    { path: "/expenses", label: "Expenses", icon: Receipt, roles: ["sales", "sales_manager", "supply_chain", "admin", "finance", "it", "marketing", "hr"] },
    { path: "/forms", label: "Forms", icon: ClipboardList, roles: ["sales", "sales_manager", "supply_chain", "admin", "finance", "it", "marketing", "hr"] },
    { path: "/repairs", label: "Repairs", icon: Wrench, roles: ["sales", "sales_manager", "supply_chain", "admin", "finance", "it", "marketing", "hr"] },
    { path: "/trainings", label: "Training", icon: GraduationCap, roles: ["sales", "sales_manager", "supply_chain", "admin", "finance", "it", "marketing", "hr"] },
    { path: "/billing", label: "Billing", icon: FileText, roles: ["sales", "sales_manager", "supply_chain", "admin", "finance", "it", "marketing", "hr"] },
    { path: "/buyback", label: "Buyback", icon: RotateCcw, roles: ["sales", "sales_manager", "supply_chain", "admin", "finance"] },
    { path: "/model-review", label: "Model Review", icon: Activity, roles: ["admin", "supply_chain", "finance"] },
  ];

  const filteredMainNavItems = mainNavItems.filter((item) => 
    item.roles.includes(role || "")
  );

  const filteredSecondaryNavItems = secondaryNavItems.filter((item) => 
    item.roles.includes(role || "")
  );

  // Combined for mobile menu
  const allNavItems = [...mainNavItems, ...secondaryNavItems].filter((item) => 
    item.roles.includes(role || "")
  );

  return (
    <>
      {/* Top Bar - Logo and App Name */}
      <header className="sticky top-0 z-50 glass border-b border-border">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Mobile Menu Trigger */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="sm:hidden">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 flex flex-col">
                <SheetHeader className="mb-4 flex-shrink-0">
                  <SheetTitle className="flex items-center gap-2">
                    <img src={logoFull} alt="Xboom Logo" className="h-8 w-auto" />
                    <span className="font-semibold text-lg">Xboom Flow</span>
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex-1 overflow-y-auto -mx-2 px-2 flex flex-col gap-1.5 pb-4">
                  {allNavItems.map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                        isActive(item.path)
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      }`}
                    >
                      <item.icon className="w-5 h-5" />
                      <span className="font-medium">{item.label}</span>
                    </Link>
                  ))}
                </nav>
                <div className="flex-shrink-0 border-t border-border pt-3">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium text-primary">
                      {profile?.name ? getInitials(profile.name) : "U"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{profile?.name || "User"}</p>
                      <p className="text-xs text-muted-foreground">{getRoleLabel(role)}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    className="w-full mt-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      signOut();
                    }}
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </Button>
                </div>
              </SheetContent>
            </Sheet>

            <Link to="/" className="flex items-center gap-3">
              <img src={logoFull} alt="Xboom Logo" className="h-9 w-auto" />
              <span className="font-semibold text-lg text-foreground">Xboom Flow</span>
            </Link>
          </div>

          {/* Right side - User info */}
          <div className="hidden sm:flex items-center gap-3">
            <AttendanceWidget />
            {(role === 'admin' || role === 'supply_chain' || role === 'finance' || role === 'it') && (
              <NotificationPanel />
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                  <div className="text-right">
                    <p className="text-sm font-medium">{profile?.name || "User"}</p>
                    <p className="text-xs text-muted-foreground">{getRoleLabel(role)}</p>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium text-primary">
                    {profile?.name ? getInitials(profile.name) : "U"}
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60 bg-popover">
                <DropdownMenuLabel>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium text-primary">
                      {profile?.name ? getInitials(profile.name) : "U"}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{profile?.name}</p>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{getRoleLabel(role)}</Badge>
                      </div>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal py-1">Personal</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => navigate("/profile")}>
                  <User className="w-4 h-4 mr-2" /> My Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/profile/security")}>
                  <ShieldCheck className="w-4 h-4 mr-2" /> Security Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/profile/change-password")}>
                  <KeyRound className="w-4 h-4 mr-2" /> Change Password
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/profile/preferences")}>
                  <Settings className="w-4 h-4 mr-2" /> Preferences
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/profile/activity")}>
                  <Activity className="w-4 h-4 mr-2" /> My Activity
                </DropdownMenuItem>
                {role === "admin" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal py-1">Admin</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => navigate("/admin")}>
                      <Shield className="w-4 h-4 mr-2" /> User Management
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/admin/audit-logs")}>
                      <ClipboardList className="w-4 h-4 mr-2" /> Audit Logs
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Mobile: notification + avatar (FAB handles attendance) */}
          <div className="flex sm:hidden items-center gap-2">
            {(role === 'admin' || role === 'supply_chain' || role === 'finance' || role === 'it') && (
              <NotificationPanel />
            )}
            <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium text-primary">
              {profile?.name ? getInitials(profile.name) : "U"}
            </div>

          </div>
        </div>
      </header>

      {/* Main Navigation Bar */}
      <nav className="hidden sm:block sticky top-14 z-40 bg-muted/50 border-b border-border">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-1 h-11 overflow-x-auto">
            {filteredMainNavItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive(item.path)
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* Secondary Navigation Bar - Tasks & HR */}
      {filteredSecondaryNavItems.length > 0 && (
        <nav className="hidden sm:block sticky top-[6.25rem] z-40 bg-background/80 backdrop-blur-sm border-b border-border/50">
          <div className="container mx-auto px-4">
            <div className="flex items-center gap-1 h-9 overflow-x-auto">
              {filteredSecondaryNavItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive(item.path)
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <item.icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </nav>
      )}
    </>
  );
}
