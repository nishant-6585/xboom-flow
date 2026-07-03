import { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Package, FileText, MessageSquare, FileQuestion, Settings, LogOut, ShieldCheck, ShoppingBag } from "lucide-react";
import { usePortalAuth } from "@/portal/hooks/usePortalAuth";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/portal/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/portal/purchases", label: "My Purchases", icon: ShoppingBag },
  { to: "/portal/orders", label: "Orders", icon: Package },
  { to: "/portal/kyc", label: "KYC Verification", icon: ShieldCheck },
  { to: "/portal/documents", label: "Documents", icon: FileText },
  { to: "/portal/rfqs", label: "Quotes & RFQs", icon: FileQuestion },
  { to: "/portal/tickets", label: "Support", icon: MessageSquare },
  { to: "/portal/settings", label: "Settings", icon: Settings },
];

export function PortalLayout({ children }: { children: ReactNode }) {
  const { contact, account, signOut } = usePortalAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/portal/login", { replace: true });
  };

  return (
    <div className="portal-scope min-h-[100dvh] bg-background text-foreground">
      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] min-h-[100dvh]">
        {/* Sidebar */}
        <aside
          className="hidden md:flex flex-col p-5 border-r"
          style={{
            background: "hsl(var(--portal-navy))",
            color: "hsl(var(--primary-foreground))",
            borderColor: "hsl(var(--portal-navy-soft))",
          }}
        >
          <div className="mb-8">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold tracking-tight">x</span>
              <span className="text-2xl font-bold tracking-tight" style={{ color: "hsl(var(--portal-gold))" }}>
                boom
              </span>
            </div>
            <div
              className="text-[10px] uppercase tracking-[1.2px] mt-0.5"
              style={{ color: "rgba(255,255,255,0.65)" }}
            >
              Customer Portal
            </div>
          </div>

          <nav className="space-y-1 flex-1">
            {NAV.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                      isActive ? "bg-white/10 text-white" : "text-white/80 hover:bg-white/5 hover:text-white"
                    }`
                  }
                >
                  <Icon className="h-4 w-4" style={{ color: "hsl(var(--portal-gold))" }} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>

          <div className="pt-4 border-t" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
            <div className="text-xs text-white/70 mb-1">{account?.company_name}</div>
            <div className="text-sm font-medium mb-3 truncate">{contact?.full_name}</div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 text-xs text-white/70 hover:text-white"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="bg-background">
          {/* Mobile top bar */}
          <header
            className="md:hidden flex items-center justify-between px-4 py-3 border-b"
            style={{ background: "hsl(var(--portal-navy))", color: "white", borderColor: "hsl(var(--portal-navy-soft))" }}
          >
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold">x</span>
              <span className="text-lg font-bold" style={{ color: "hsl(var(--portal-gold))" }}>
                boom
              </span>
              <span className="text-[10px] uppercase tracking-wider ml-2 text-white/70">Portal</span>
            </div>
            <Button size="sm" variant="ghost" onClick={handleSignOut} className="text-white hover:text-white">
              <LogOut className="h-4 w-4" />
            </Button>
          </header>

          <div className="px-4 md:px-8 py-6 md:py-8 max-w-6xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
