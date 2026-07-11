import { useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { ADMIN_TABS, ungroupedAdminTabs } from "./adminTabsConfig";
import PortalTabsMenu from "./PortalTabsMenu";

interface Props {
  active: string;
}

export default function AdminTabsNav({ active }: Props) {
  const navigate = useNavigate();
  const { roles } = useAuth();
  const isFinanceOnly =
    Array.isArray(roles) && roles.length > 0 && roles.every((r) => r === "finance");

  const visible = ungroupedAdminTabs(isFinanceOnly);

  return (
    <div className="container mx-auto px-4 pt-4">
      <Tabs value={active} onValueChange={(v) => {
        const t = ADMIN_TABS.find((x) => x.value === v);
        if (t) navigate(t.to);
      }}>
        <TabsList className="h-auto flex-wrap justify-start">
          {visible.map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger key={t.value} value={t.value} className="flex items-center gap-2">
                <Icon className="w-4 h-4" />
                {t.label}
              </TabsTrigger>
            );
          })}
          <PortalTabsMenu isFinanceOnly={isFinanceOnly} />
        </TabsList>
      </Tabs>
    </div>
  );
}