import { Link, useLocation } from "react-router-dom";
import { LogOut, Search } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { navGroups, getRoleLabel, type NavItem } from "@/lib/nav";
import logoIcon from "@/assets/xboom-logo-icon.jpeg";

const getInitials = (name: string) =>
  name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

function AvatarBubble({ size = "w-8 h-8", textSize = "text-xs" }: { size?: string; textSize?: string }) {
  const { profile } = useAuth();
  const hasPhoto = !!profile?.avatar_url;
  return (
    <div
      className={cn(
        size,
        "rounded-full overflow-hidden shadow-sm flex items-center justify-center flex-shrink-0",
        hasPhoto
          ? "bg-muted"
          : "bg-gradient-to-br from-primary to-primary-glow text-primary-foreground font-semibold"
      )}
    >
      {hasPhoto ? (
        <img src={profile!.avatar_url as string} alt={profile?.name || "Profile"} className="w-full h-full object-cover" />
      ) : (
        <span className={textSize}>{profile?.name ? getInitials(profile.name) : "U"}</span>
      )}
    </div>
  );
}

interface AppSidebarProps {
  /** Optional counts keyed by route path, rendered on the right of an item. */
  counts?: Record<string, number>;
}

export function AppSidebar({ counts }: AppSidebarProps) {
  const { profile, role, roles, signOut } = useAuth();
  const location = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();

  const hasNavAccess = (itemRoles: string[]) =>
    itemRoles.some((itemRole) => itemRole === role || roles.includes(itemRole as any));

  const isActive = (path: string) => location.pathname === path;

  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  const renderItem = (item: NavItem) => {
    const active = isActive(item.path);
    const count = counts?.[item.path];
    return (
      <SidebarMenuItem key={item.path}>
        <SidebarMenuButton
          asChild
          isActive={active}
          className={cn(
            "relative rounded-md h-9 gap-2.5",
            active
              ? "bg-sidebar-accent text-foreground font-semibold"
              : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          )}
        >
          <Link to={item.path} onClick={closeOnMobile}>
            {active && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-primary" aria-hidden />
            )}
            <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
            <span className="text-sm truncate">{item.label}</span>
            {typeof count === "number" && count > 0 && (
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">{count}</span>
            )}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="gap-3 p-3">
        <Link to="/" onClick={closeOnMobile} className="flex items-center gap-2.5">
          <img src={logoIcon} alt="Xboom" className="w-[30px] h-[30px] rounded-md object-cover" />
          <span className="font-display font-semibold text-[17px] tracking-tight text-foreground">
            Xboom <span className="text-primary">Flow</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
          className="flex items-center gap-2 w-full px-2.5 py-2 bg-muted/40 border border-border rounded-lg text-muted-foreground text-sm hover:text-foreground transition-colors"
        >
          <Search className="w-4 h-4" />
          <span>Search</span>
          <kbd className="ml-auto inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            <span className="text-xs">⌘</span>K
          </kbd>
        </button>
      </SidebarHeader>

      <SidebarContent className="px-1.5">
        {navGroups.map((group) => {
          const items = group.items.filter((item) => hasNavAccess(item.roles));
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={group.label} className="py-1">
              <SidebarGroupLabel className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground h-6">
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>{items.map(renderItem)}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="p-3 gap-2 border-t border-sidebar-border">
        <Link
          to="/profile"
          onClick={closeOnMobile}
          className="flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-sidebar-accent transition-colors"
        >
          <AvatarBubble />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate leading-tight">{profile?.name || "User"}</p>
            <p className="text-[11px] text-muted-foreground">{getRoleLabel(role)}</p>
          </div>
        </Link>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={signOut}
              className="h-9 gap-2.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="w-[18px] h-[18px]" />
              <span className="text-sm">Sign Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
