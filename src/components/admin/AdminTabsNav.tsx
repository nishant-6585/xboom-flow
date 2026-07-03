import { useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import {
  BarChart3, CreditCard, Receipt, Users, MessageSquare, ClipboardList,
  Bell, KeyRound, Activity, Building2, CalendarClock, CalendarDays,
  History, UserCog, Shield, Briefcase, FileQuestion, Package, ToggleLeft, Mail,
} from "lucide-react";

type TabDef = {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Absolute path; in-Admin tabs use /admin?tab=<value> */
  to: string;
  financeOk?: boolean;
};

const TABS: TabDef[] = [
  { value: "analytics", label: "Analytics", icon: BarChart3, to: "/admin?tab=analytics" },
  { value: "payments", label: "Payment Reminders", icon: CreditCard, to: "/admin?tab=payments" },
  { value: "approvals", label: "Payment Approvals", icon: Receipt, to: "/admin?tab=approvals", financeOk: true },
  { value: "users", label: "User Management", icon: Users, to: "/admin?tab=users" },
  { value: "integrations", label: "Integrations", icon: MessageSquare, to: "/admin?tab=integrations" },
  { value: "form-access", label: "Form Access", icon: ClipboardList, to: "/admin?tab=form-access" },
  { value: "notices", label: "Notices", icon: Bell, to: "/admin?tab=notices" },
  { value: "signature", label: "Signature", icon: KeyRound, to: "/admin?tab=signature" },
  { value: "activity", label: "Activity", icon: Activity, to: "/admin?tab=activity" },
  { value: "organization", label: "Organization", icon: Building2, to: "/admin?tab=organization" },
  { value: "attendance-policy", label: "Attendance Policy", icon: CalendarClock, to: "/admin?tab=attendance-policy" },
  { value: "holidays", label: "Holidays", icon: CalendarDays, to: "/admin?tab=holidays" },
  { value: "employee-activity", label: "Employee Activity", icon: History, to: "/admin?tab=employee-activity" },
  { value: "agent-mapping", label: "Agent Mapping", icon: UserCog, to: "/admin?tab=agent-mapping" },
  { value: "feature-flags", label: "Feature Flags", icon: ToggleLeft, to: "/admin?tab=feature-flags" },
  { value: "audit-logs", label: "Audit Logs", icon: Shield, to: "/admin/audit-logs" },
  { value: "company-cleanup", label: "Company Cleanup", icon: Building2, to: "/admin/company-cleanup" },
  { value: "portal-dashboard", label: "Portal Dashboard", icon: Activity, to: "/admin/portal-dashboard" },
  { value: "portal-customers", label: "Portal Customers", icon: Briefcase, to: "/admin/portal-customers" },
  { value: "portal-rfqs", label: "Portal RFQs", icon: FileQuestion, to: "/admin/portal-rfqs" },
  { value: "portal-orders", label: "Portal Orders", icon: Package, to: "/admin/portal-orders" },
  { value: "portal-dispatch", label: "Dispatch Queue", icon: Briefcase, to: "/admin/portal-dispatch" },
  { value: "portal-tickets", label: "Portal Tickets", icon: MessageSquare, to: "/admin/portal-tickets" },
  { value: "kyc-emails", label: "KYC Emails", icon: Mail, to: "/admin/kyc-emails", financeOk: true },
];

interface Props {
  active: string;
}

export default function AdminTabsNav({ active }: Props) {
  const navigate = useNavigate();
  const { roles } = useAuth();
  const isFinanceOnly =
    Array.isArray(roles) && roles.length > 0 && roles.every((r) => r === "finance");

  const visible = TABS.filter((t) => (isFinanceOnly ? t.financeOk : true));

  return (
    <div className="container mx-auto px-4 pt-4">
      <Tabs value={active} onValueChange={(v) => {
        const t = TABS.find((x) => x.value === v);
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
        </TabsList>
      </Tabs>
    </div>
  );
}