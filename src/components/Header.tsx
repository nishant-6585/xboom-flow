import { useState } from "react";
import { LogOut, Shield, Package, Building2, Menu, Home, ShoppingCart, Warehouse, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation } from "react-router-dom";
import logoFull from "@/assets/logo-full.jpeg";
import { NotificationPanel } from "@/components/NotificationPanel";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

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
      case "admin":
        return "Finance & Admin";
      default:
        return "User";
    }
  };

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { path: "/", label: "Dashboard", icon: Home, roles: ["sales", "supply_chain", "admin"] },
    { path: "/orders", label: "Orders", icon: Package, roles: ["sales", "supply_chain", "admin"] },
    { path: "/pricelist", label: "Pricelist", icon: FileSpreadsheet, roles: ["sales", "supply_chain", "admin"] },
    { path: "/procurement", label: "Procurement", icon: ShoppingCart, roles: ["admin", "supply_chain"] },
    { path: "/inventory", label: "Inventory", icon: Warehouse, roles: ["sales", "supply_chain", "admin"] },
    { path: "/suppliers", label: "Suppliers", icon: Building2, roles: ["admin", "supply_chain"] },
    { path: "/admin", label: "Admin", icon: Shield, roles: ["admin"] },
  ];

  const filteredNavItems = navItems.filter((item) => 
    item.roles.includes(role || "")
  );

  return (
    <header className="sticky top-0 z-50 glass border-b border-border">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Mobile Menu Trigger */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="sm:hidden">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64">
              <SheetHeader className="mb-6">
                <SheetTitle className="flex items-center gap-2">
                  <img src={logoFull} alt="Xboom Logo" className="h-8 w-auto" />
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-2">
                {filteredNavItems.map((item) => (
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
              <div className="absolute bottom-6 left-4 right-4">
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
            <img src={logoFull} alt="Xboom Logo" className="h-10 w-auto" />
            <span className="text-muted-foreground font-normal hidden sm:inline">| OS</span>
          </Link>
        </div>

        {/* Desktop Navigation */}
        <div className="hidden sm:flex items-center gap-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link to="/orders">
                <Button variant="ghost" size="sm" className="gap-2">
                  <Package className="w-4 h-4" />
                  <span>Orders</span>
                </Button>
              </Link>
            </TooltipTrigger>
            <TooltipContent className="sm:hidden">
              <p>Orders</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Link to="/pricelist">
                <Button variant="ghost" size="sm" className="gap-2">
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Pricelist</span>
                </Button>
              </Link>
            </TooltipTrigger>
            <TooltipContent className="sm:hidden">
              <p>Pricelist</p>
            </TooltipContent>
          </Tooltip>

          {(role === "admin" || role === "supply_chain") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link to="/procurement">
                  <Button variant="ghost" size="sm" className="gap-2">
                    <ShoppingCart className="w-4 h-4" />
                    <span>Procurement</span>
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent className="sm:hidden">
                <p>Procurement</p>
              </TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Link to="/inventory">
                <Button variant="ghost" size="sm" className="gap-2">
                  <Warehouse className="w-4 h-4" />
                  <span>Inventory</span>
                </Button>
              </Link>
            </TooltipTrigger>
            <TooltipContent className="sm:hidden">
              <p>Inventory</p>
            </TooltipContent>
          </Tooltip>

          {(role === "admin" || role === "supply_chain") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link to="/suppliers">
                  <Button variant="ghost" size="sm" className="gap-2">
                    <Building2 className="w-4 h-4" />
                    <span>Suppliers</span>
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent className="sm:hidden">
                <p>Suppliers</p>
              </TooltipContent>
            </Tooltip>
          )}

          {role === "admin" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link to="/admin">
                  <Button variant="ghost" size="sm" className="gap-2">
                    <Shield className="w-4 h-4" />
                    <span>Admin</span>
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent className="sm:hidden">
                <p>Admin</p>
              </TooltipContent>
            </Tooltip>
          )}

          {(role === 'admin' || role === 'supply_chain') && (
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
            <DropdownMenuContent align="end" className="w-56 bg-popover">
              <DropdownMenuLabel>
                <div>
                  <p className="font-medium">{profile?.name}</p>
                  <p className="text-xs text-muted-foreground">{profile?.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Mobile: Only show notification + avatar */}
        <div className="flex sm:hidden items-center gap-2">
          {(role === 'admin' || role === 'supply_chain') && (
            <NotificationPanel />
          )}
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium text-primary">
            {profile?.name ? getInitials(profile.name) : "U"}
          </div>
        </div>
      </div>
    </header>
  );
}
