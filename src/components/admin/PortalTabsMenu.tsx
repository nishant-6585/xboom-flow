import { useLocation, useNavigate } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PORTAL_GROUP, portalAdminTabs } from "./adminTabsConfig";

interface Props {
  isFinanceOnly: boolean;
}

/**
 * A single trigger styled to match TabsTrigger that expands into a dropdown
 * listing every /admin/portal-* route. Kept out of the Radix Tabs value cycle
 * so it doesn't hide the currently-inline tab content.
 */
export default function PortalTabsMenu({ isFinanceOnly }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const tabs = portalAdminTabs(isFinanceOnly);
  if (tabs.length === 0) return null;

  const activeTab = tabs.find((t) => location.pathname.startsWith(t.to.split("?")[0]));
  const isActive = Boolean(activeTab);
  const Icon = PORTAL_GROUP.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium ring-offset-background transition-all duration-200 gap-2",
          "text-muted-foreground hover:text-foreground hover:bg-background/60",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          isActive && "bg-primary text-primary-foreground shadow-md hover:bg-primary hover:text-primary-foreground",
        )}
      >
        <Icon className="w-4 h-4" />
        {activeTab?.label ?? PORTAL_GROUP.label}
        <ChevronDown className="w-3.5 h-3.5 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[200px]">
        {tabs.map((t) => {
          const TabIcon = t.icon;
          return (
            <DropdownMenuItem
              key={t.value}
              onSelect={() => navigate(t.to)}
              className="flex items-center gap-2"
            >
              <TabIcon className="w-4 h-4" />
              {t.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}