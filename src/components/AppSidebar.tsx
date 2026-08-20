import { Link, useLocation, useSearchParams } from "react-router-dom";
import { LogOut, Search, ChevronDown } from "lucide-react";
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
import {
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { navGroups, getRoleLabel, salesTabItems, type NavItem } from "@/lib/nav";
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
  const [searchParams] = useSearchParams();
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

    if (item.path === "/sales") {
      const tabs = salesTabItems.filter((t) => hasNavAccess(t.roles));
      const defaultTab = role === "sales" ? "my_leads" : "manager";
      const currentTab = active ? searchParams.get("tab") ?? defaultTab : null;
      return (
        <Collapsible key={item.path} defaultOpen={active} className="group/collapsible">
          <SidebarMenuItem>
            <CollapsibleTrigger asChild>
              <SidebarMenuButton
                className={cn(
                  "relative rounded-lg h-[34px] px-[9px] gap-[9px] text-[13px] leading-none",
                  active
                    ? "bg-sidebar-accent text-foreground font-semibold [&>svg]:text-foreground"
                    : "text-muted-foreground font-normal hover:bg-sidebar-accent hover:text-foreground"
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-[14px] w-[2px] rounded-full bg-primary" aria-hidden />
                )}
                <item.icon className="w-4 h-4 shrink-0 stroke-[1.75] text-muted-foreground" />
                <span className="truncate">{item.label}</span>
                <ChevronDown className="ml-auto w-3.5 h-3.5 transition-transform group-data-[state=open]/collapsible:rotate-180" />
              </SidebarMenuButton>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenuSub className="mx-0 ml-[17px] gap-px border-l border-border px-0 py-0.5 pl-2">
                {tabs.map((t) => (
                  <SidebarMenuSubItem key={t.tab}>
                    <SidebarMenuSubButton
                      asChild
                      isActive={currentTab === t.tab}
                      className={cn(
                        "h-[30px] gap-2 rounded-md px-2 text-[12.5px] leading-none",
                        currentTab === t.tab
                          ? "bg-sidebar-accent text-foreground font-medium [&>svg]:text-foreground"
                          : "text-muted-foreground font-normal hover:text-foreground"
                      )}
                    >
                      <Link to={`/sales?tab=${t.tab}`} onClick={closeOnMobile}>
                        <t.icon className="w-[14px] h-[14px] shrink-0 stroke-[1.75] text-muted-foreground" />
                        <span className="truncate">{t.label}</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            </CollapsibleContent>
          </SidebarMenuItem>
        </Collapsible>
      );
    }

    return (
      <SidebarMenuItem key={item.path}>
        <SidebarMenuButton
          asChild
          isActive={active}
          className={cn(
            "relative rounded-lg h-[34px] px-[9px] gap-[9px] text-[13px] leading-none",
            active
              ? "bg-sidebar-accent text-foreground font-semibold [&>svg]:text-foreground"
              : "text-muted-foreground font-normal hover:bg-sidebar-accent hover:text-foreground"
          )}
        >
          <Link to={item.path} onClick={closeOnMobile}>
            {active && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 h-[14px] w-[2px] rounded-full bg-primary" aria-hidden />
            )}
            <item.icon className="w-4 h-4 shrink-0 stroke-[1.75] text-muted-foreground" />
            <span className="truncate">{item.label}</span>
            {typeof count === "number" && count > 0 && (
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">{count}</span>
            )}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="offcanvas" style={{ "--sidebar-width": "244px" } as React.CSSProperties}>
      <SidebarHeader className="gap-3 px-[18px] pt-5 pb-4">
        <div className="flex items-center gap-2">
          <Link to="/" onClick={closeOnMobile} className="flex items-center gap-2.5 min-w-0">
            <img src={logoIcon} alt="Xboom" className="w-[30px] h-[30px] rounded-md object-cover" />
            <span className="font-display font-semibold text-[17px] tracking-tight text-foreground truncate">
              Xboom <span className="text-primary">Flow</span>
            </span>
          </Link>
          <SidebarTrigger className="ml-auto h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" />
        </div>
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
        {navGroups.map((group, gi) => {
          const items = group.items.filter((item) => hasNavAccess(item.roles));
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={group.label} className={cn("py-0", gi > 0 && "mt-4")}>
              <SidebarGroupLabel className="h-auto px-[10px] pb-[7px] font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-px">{items.map(renderItem)}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="p-3 pb-16 gap-2 border-t border-sidebar-border">
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
              className="h-[34px] px-[9px] gap-[9px] rounded-lg text-[13px] leading-none text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="w-4 h-4 shrink-0 stroke-[1.75]" />
              <span>Sign Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
