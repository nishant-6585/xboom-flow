import { useState } from "react";
import { LogOut, Shield, Package, Building2, Menu, Home, ShoppingCart, Warehouse, FileSpreadsheet, Zap, IndianRupee, ListTodo, Users, CalendarDays, Receipt, ClipboardList, Wrench, GraduationCap, FileText, Ticket, BookCheck, RotateCcw, Activity, User, KeyRound, ShieldCheck, Settings, CalendarClock, ChevronRight, Cpu, Search, Puzzle, Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation, useNavigate } from "react-router-dom";
import logoFull from "@/assets/logo-full.jpeg";
import { NotificationPanel } from "@/components/NotificationPanel";

import { AttendanceWidget } from "@/components/attendance/AttendanceWidget";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PomodoroTimer } from "@/components/header/PomodoroTimer";
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
import { cn } from "@/lib/utils";

export function Header() {
  const { profile, role, roles, signOut } = useAuth();
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
      case "sales": return "Sales";
      case "supply_chain": return "Supply Chain";
      case "finance": return "Finance";
      case "admin": return "Admin";
      case "it": return "IT";
      case "marketing": return "Marketing";
      default: return "User";
    }
  };

  const isActive = (path: string) => location.pathname === path;

  const mainNavItems = [
    { path: "/", label: "Dashboard", icon: Home, roles: ["sales", "sales_manager", "supply_chain", "admin", "finance", "it", "marketing", "hr"] },
    { path: "/sales", label: "Sales", icon: Zap, roles: ["sales", "sales_manager", "supply_chain", "admin"] },
    { path: "/orders", label: "Orders", icon: Package, roles: ["sales", "sales_manager", "supply_chain", "admin", "finance", "it", "marketing", "hr"] },
    { path: "/pricelist", label: "Pricelist", icon: FileSpreadsheet, roles: ["sales", "sales_manager", "supply_chain", "admin"] },
    { path: "/procurement", label: "Procurement", icon: ShoppingCart, roles: ["admin", "supply_chain", "finance"] },
    { path: "/inventory", label: "Inventory", icon: Warehouse, roles: ["sales", "sales_manager", "supply_chain", "admin"] },
    { path: "/spare-parts", label: "Spare Parts", icon: Puzzle, roles: ["admin", "supply_chain", "finance", "sales", "sales_manager"] },
    { path: "/suppliers", label: "Suppliers", icon: Building2, roles: ["admin", "supply_chain", "finance"] },
    { path: "/finance", label: "Finance", icon: IndianRupee, roles: ["admin", "finance"] },
    { path: "/tally", label: "Tally", icon: BookCheck, roles: ["admin", "finance"] },
    { path: "/admin", label: "Admin", icon: Shield, roles: ["admin", "finance"] },
  ];

  const secondaryNavItems = [
    { path: "/tasks", label: "Tasks", icon: ListTodo, roles: ["sales", "sales_manager", "supply_chain", "admin", "finance", "it", "marketing", "hr"] },
    { path: "/tickets", label: "Tickets", icon: Ticket, roles: ["sales", "sales_manager", "supply_chain", "admin", "finance", "it", "marketing", "hr"] },
    { path: "/hr", label: "HR", icon: Users, roles: ["sales", "sales_manager", "supply_chain", "admin", "finance", "it", "marketing", "hr"] },
    { path: "/meetings", label: "Meetings", icon: CalendarDays, roles: ["sales", "sales_manager", "supply_chain", "admin", "finance", "it", "marketing", "hr"] },
    { path: "/expenses", label: "Expenses", icon: Receipt, roles: ["sales", "sales_manager", "supply_chain", "admin", "finance", "it", "marketing", "hr"] },
    { path: "/forms", label: "Forms", icon: ClipboardList, roles: ["sales", "sales_manager", "supply_chain", "admin", "finance", "it", "marketing", "hr"] },
    { path: "/repairs", label: "Repairs", icon: Wrench, roles: ["sales", "sales_manager", "supply_chain", "admin", "finance", "it", "marketing", "hr"] },
    { path: "/billing", label: "Billing", icon: FileText, roles: ["sales", "sales_manager", "supply_chain", "admin", "finance", "it", "marketing", "hr"] },
    { path: "/buyback", label: "Buyback", icon: RotateCcw, roles: ["sales", "sales_manager", "supply_chain", "admin", "finance"] },
    { path: "/rent", label: "Rent", icon: Plane, roles: ["sales", "sales_manager", "supply_chain", "admin", "finance"] },
    { path: "/daily-flow", label: "Daily Flow", icon: CalendarClock, roles: ["sales", "sales_manager", "supply_chain", "admin", "finance", "it", "marketing", "hr"] },
    { path: "/drone-operations", label: "Demo & Trainings", icon: Cpu, roles: ["sales", "sales_manager", "supply_chain", "admin", "finance", "it", "marketing", "hr"] },
  ];

  const hasNavAccess = (itemRoles: string[]) => itemRoles.some((itemRole) => itemRole === role || roles.includes(itemRole as any));

  const filteredMainNavItems = mainNavItems.filter((item) => hasNavAccess(item.roles));
  const filteredSecondaryNavItems = secondaryNavItems.filter((item) => hasNavAccess(item.roles));
  const allNavItems = [...mainNavItems, ...secondaryNavItems].filter((item) => hasNavAccess(item.roles));

  return (
    <>
      {/* Top Bar */}
      <header className="sticky top-0 z-50 glass-strong border-b border-border/60">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Mobile Menu */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="sm:hidden h-9 w-9">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 flex flex-col p-0">
                <SheetHeader className="p-4 pb-2 flex-shrink-0 border-b border-border/50">
                  <SheetTitle className="flex items-center gap-2.5">
                    <img src={logoFull} alt="Xboom Logo" className="h-8 w-auto rounded-md" />
                    <span className="font-display font-semibold text-lg">Xboom Flow</span>
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex-1 overflow-y-auto p-3 flex flex-col gap-0.5 scrollbar-thin">
                  {allNavItems.map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150",
                        isActive(item.path)
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-foreground/70 hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                      <span className="font-medium text-sm">{item.label}</span>
                      {isActive(item.path) && <ChevronRight className="w-4 h-4 ml-auto opacity-60" />}
                    </Link>
                  ))}
                </nav>
                <div className="flex-shrink-0 border-t border-border p-3 space-y-2">
                  <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/60">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center text-xs font-semibold text-primary-foreground">
                      {profile?.name ? getInitials(profile.name) : "U"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{profile?.name || "User"}</p>
                      <p className="text-xs text-muted-foreground">{getRoleLabel(role)}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => { setMobileMenuOpen(false); signOut(); }}
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </Button>
                </div>
              </SheetContent>
            </Sheet>

            <Link to="/" className="flex items-center gap-2.5 group">
              <img src={logoFull} alt="Xboom Logo" className="h-8 w-auto rounded-md transition-transform group-hover:scale-105" />
              <span className="font-display font-semibold text-lg text-foreground tracking-tight">
                Xboom <span className="text-primary">Flow</span>
              </span>
            </Link>
          </div>

          {/* Center - Pomodoro Timer */}
          <div className="hidden sm:flex flex-1 justify-center">
            <ErrorBoundary fallback={null}><PomodoroTimer /></ErrorBoundary>
          </div>

          {/* Right side */}
          <div className="hidden sm:flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground hover:text-foreground"
              onClick={() => window.dispatchEvent(new Event('open-command-palette'))}
            >
              <Search className="h-4 w-4" />
              <span className="text-xs hidden lg:inline">Search</span>
              <kbd className="hidden lg:inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                <span className="text-xs">⌘</span>K
              </kbd>
            </Button>
            <ErrorBoundary fallback={null}><AttendanceWidget /></ErrorBoundary>
            {(role === 'admin' || role === 'supply_chain' || role === 'finance' || role === 'it') && (
              <NotificationPanel />
            )}
            

            <div className="w-px h-6 bg-border/60 mx-1" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2.5 hover:opacity-90 transition-opacity rounded-lg px-2 py-1.5 hover:bg-muted/50">
                  <div className="text-right hidden lg:block">
                    <p className="text-sm font-medium leading-tight">{profile?.name || "User"}</p>
                    <p className="text-[11px] text-muted-foreground">{getRoleLabel(role)}</p>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center text-xs font-semibold text-primary-foreground shadow-sm">
                    {profile?.name ? getInitials(profile.name) : "U"}
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60 bg-popover">
                <DropdownMenuLabel>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center text-sm font-semibold text-primary-foreground">
                      {profile?.name ? getInitials(profile.name) : "U"}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{profile?.name}</p>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 mt-0.5">{getRoleLabel(role)}</Badge>
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
                    <DropdownMenuItem onClick={() => navigate("/admin/ai-automation")}>
                      <Zap className="w-4 h-4 mr-2" /> AI Automation
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

          {/* Mobile right */}
          <div className="flex sm:hidden items-center gap-2">
            {(role === 'admin' || role === 'supply_chain' || role === 'finance' || role === 'it') && (
              <NotificationPanel />
            )}
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center text-xs font-semibold text-primary-foreground">
              {profile?.name ? getInitials(profile.name) : "U"}
            </div>
          </div>
        </div>
      </header>

      {/* Primary Navigation */}
      <nav className="hidden sm:block sticky top-14 z-40 bg-background/80 backdrop-blur-lg border-b border-border/50">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-0.5 h-11 overflow-x-auto scrollbar-hide">
            {filteredMainNavItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-2 rounded-md text-sm font-medium transition-all duration-150 whitespace-nowrap relative",
                  isActive(item.path)
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* Secondary Navigation */}
      {filteredSecondaryNavItems.length > 0 && (
        <nav className="hidden sm:block sticky top-[6.25rem] z-40 bg-background/60 backdrop-blur-md border-b border-border/30">
          <div className="container mx-auto px-4">
            <div className="flex items-center gap-0.5 h-9 overflow-x-auto scrollbar-hide">
              {filteredSecondaryNavItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium transition-all duration-150 whitespace-nowrap",
                    isActive(item.path)
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  )}
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
