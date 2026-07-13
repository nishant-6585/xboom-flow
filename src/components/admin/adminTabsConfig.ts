import {
  BarChart3, CreditCard, Receipt, Users, MessageSquare, ClipboardList,
  Bell, KeyRound, Activity, Building2, CalendarClock, CalendarDays,
  History, UserCog, Shield, Briefcase, FileQuestion, Package, ToggleLeft,
  Mail, Terminal, Copy, ShieldCheck, FileText,
} from "lucide-react";

export type AdminTabDef = {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Absolute route to navigate to when this tab is picked. */
  to: string;
  /** True when the tab renders inline inside the Admin page (activeTab === value). */
  inline?: boolean;
  /** True when a finance-only user (no admin role) may see this tab. */
  financeOk?: boolean;
  /** Optional group key. Tabs sharing a group are rendered inside a single dropdown trigger. */
  group?: "portal";
};

/**
 * Single source of truth for the admin navigation tabs.
 * Consumed by both src/pages/Admin.tsx (inline TabsList) and
 * src/components/admin/AdminTabsNav.tsx (top-nav on standalone admin pages).
 */
export const ADMIN_TABS: AdminTabDef[] = [
  { value: "analytics", label: "Analytics", icon: BarChart3, to: "/admin?tab=analytics", inline: true },
  { value: "payments", label: "Payment Reminders", icon: CreditCard, to: "/admin?tab=payments", inline: true },
  { value: "approvals", label: "Payment Approvals", icon: Receipt, to: "/admin?tab=approvals", inline: true, financeOk: true },
  { value: "users", label: "User Management", icon: Users, to: "/admin?tab=users", inline: true },
  { value: "integrations", label: "Integrations", icon: MessageSquare, to: "/admin?tab=integrations", inline: true },
  { value: "form-access", label: "Form Access", icon: ClipboardList, to: "/admin?tab=form-access", inline: true },
  { value: "notices", label: "Notices", icon: Bell, to: "/admin?tab=notices", inline: true },
  { value: "signature", label: "Signature", icon: KeyRound, to: "/admin?tab=signature", inline: true },
  { value: "activity", label: "Activity", icon: Activity, to: "/admin?tab=activity", inline: true },
  { value: "organization", label: "Organization", icon: Building2, to: "/admin?tab=organization", inline: true },
  { value: "attendance-policy", label: "Attendance Policy", icon: CalendarClock, to: "/admin?tab=attendance-policy", inline: true },
  { value: "holidays", label: "Holidays", icon: CalendarDays, to: "/admin?tab=holidays", inline: true },
  { value: "employee-activity", label: "Employee Activity", icon: History, to: "/admin?tab=employee-activity", inline: true },
  { value: "agent-mapping", label: "Agent Mapping", icon: UserCog, to: "/admin?tab=agent-mapping", inline: true },
  { value: "feature-flags", label: "Feature Flags", icon: ToggleLeft, to: "/admin?tab=feature-flags", inline: true },
  { value: "audit-logs", label: "Audit Logs", icon: Shield, to: "/admin/audit-logs" },
  { value: "company-cleanup", label: "Company Cleanup", icon: Building2, to: "/admin/company-cleanup" },
  { value: "portal-dashboard", label: "Portal Dashboard", icon: Activity, to: "/admin/portal-dashboard", group: "portal" },
  { value: "portal-customers", label: "Portal Customers", icon: Briefcase, to: "/admin/portal-customers", group: "portal" },
  { value: "portal-rfqs", label: "Portal RFQs", icon: FileQuestion, to: "/admin/portal-rfqs", group: "portal" },
  { value: "portal-orders", label: "Portal Orders", icon: Package, to: "/admin/portal-orders", group: "portal" },
  { value: "portal-dispatch", label: "Dispatch Queue", icon: Briefcase, to: "/admin/portal-dispatch", group: "portal" },
  { value: "portal-tickets", label: "Portal Tickets", icon: MessageSquare, to: "/admin/portal-tickets", group: "portal" },
  { value: "duplicate-orders", label: "Duplicate Orders", icon: Copy, to: "/admin/duplicate-orders" },
  { value: "false-positive-confirmations", label: "False-Positive Confirmations", icon: ShieldCheck, to: "/admin/false-positive-confirmations" },
  { value: "pricelist-category-import", label: "Pricelist Category Import", icon: FileText, to: "/admin/pricelist-category-import" },
  { value: "kyc-emails", label: "KYC Emails", icon: Mail, to: "/admin/kyc-emails", financeOk: true },
  { value: "dev-console", label: "Dev Console", icon: Terminal, to: "/admin/dev-console" },
];

export function filterAdminTabs(isFinanceOnly: boolean): AdminTabDef[] {
  return isFinanceOnly ? ADMIN_TABS.filter((t) => t.financeOk) : ADMIN_TABS;
}

export const PORTAL_GROUP = {
  value: "portal",
  label: "Customer Portal",
  icon: Briefcase,
} as const;

/**
 * Returns tabs with grouped ones removed, so callers can render a single
 * dropdown trigger (e.g. Customer Portal) in place of the individual entries.
 */
export function ungroupedAdminTabs(isFinanceOnly: boolean): AdminTabDef[] {
  return filterAdminTabs(isFinanceOnly).filter((t) => !t.group);
}

export function portalAdminTabs(isFinanceOnly: boolean): AdminTabDef[] {
  return filterAdminTabs(isFinanceOnly).filter((t) => t.group === "portal");
}