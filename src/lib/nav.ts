import {
  Home, Zap, Package, FileSpreadsheet, ShoppingCart, Warehouse, Puzzle, Building2,
  IndianRupee, BookCheck, Shield, ListTodo, Ticket, MessageSquare, Users, CalendarDays,
  Receipt, Wrench, RotateCcw, Plane, Cpu,
  Contact, BarChart3, Target, TrendingUp, FileText, AlertTriangle, CalendarCheck, Star,
  Phone, CalendarOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  roles: string[];
}

const ALL = ["sales", "sales_manager", "supply_chain", "admin", "finance", "it", "marketing", "hr"];

export const mainNavItems: NavItem[] = [
  { path: "/", label: "Dashboard", icon: Home, roles: ALL },
  { path: "/sales", label: "Sales", icon: Zap, roles: ["sales", "sales_manager", "supply_chain", "admin"] },
  { path: "/orders", label: "Orders", icon: Package, roles: ALL },
  { path: "/pricelist", label: "Pricelist", icon: FileSpreadsheet, roles: ["sales", "sales_manager", "supply_chain", "admin"] },
  { path: "/procurement", label: "Procurement", icon: ShoppingCart, roles: ["admin", "supply_chain", "finance"] },
  { path: "/inventory", label: "Inventory", icon: Warehouse, roles: ["sales", "sales_manager", "supply_chain", "admin"] },
  { path: "/spare-parts", label: "Spare Parts", icon: Puzzle, roles: ["admin", "supply_chain", "finance", "sales", "sales_manager"] },
  { path: "/suppliers", label: "Suppliers", icon: Building2, roles: ["admin", "supply_chain", "finance"] },
  { path: "/finance", label: "Finance", icon: IndianRupee, roles: ["admin", "finance"] },
  { path: "/tally", label: "Tally", icon: BookCheck, roles: ["admin", "finance"] },
  { path: "/admin", label: "Admin", icon: Shield, roles: ["admin", "finance"] },
];

export const secondaryNavItems: NavItem[] = [
  { path: "/tasks", label: "Tasks", icon: ListTodo, roles: ALL },
  { path: "/tickets", label: "Tickets", icon: Ticket, roles: ALL },
  { path: "/admin/portal-tickets", label: "Customer Tickets", icon: MessageSquare, roles: ["sales", "sales_manager", "supply_chain", "admin", "support"] },
  { path: "/hr", label: "HR", icon: Users, roles: ALL },
  { path: "/meetings", label: "Meetings", icon: CalendarDays, roles: ALL },
  { path: "/expenses", label: "Expenses", icon: Receipt, roles: ALL },
  { path: "/repairs", label: "Repairs", icon: Wrench, roles: ALL },
  { path: "/buyback", label: "Buyback", icon: RotateCcw, roles: ["sales", "sales_manager", "supply_chain", "admin", "finance"] },
  { path: "/rent", label: "Rent", icon: Plane, roles: ["sales", "sales_manager", "supply_chain", "admin", "finance"] },
  { path: "/drone-operations", label: "Demo & Trainings", icon: Cpu, roles: ALL },
  { path: "/kyc", label: "KYC", icon: Shield, roles: ["sales", "sales_manager", "admin", "finance"] },
];

const byPath = (path: string): NavItem => {
  const item = [...mainNavItems, ...secondaryNavItems].find((i) => i.path === path);
  if (!item) throw new Error(`Unknown nav path: ${path}`);
  return item;
};

export const navGroups: { label: string; items: NavItem[] }[] = [
  { label: "Overview", items: ["/", "/tasks", "/meetings"].map(byPath) },
  { label: "Sales", items: ["/sales", "/kyc"].map(byPath) },
  {
    label: "Operations",
    items: [
      "/orders", "/procurement", "/inventory", "/spare-parts", "/suppliers",
      "/repairs", "/buyback", "/rent", "/drone-operations",
    ].map(byPath),
  },
  {
    label: "Business",
    items: ["/pricelist", "/finance", "/tally", "/expenses", "/hr", "/tickets", "/admin/portal-tickets", "/admin"].map(byPath),
  },
];

export const getRoleLabel = (role: string | null) => {
  switch (role) {
    case "sales": return "Sales";
    case "sales_manager": return "Sales Manager";
    case "supply_chain": return "Supply Chain";
    case "finance": return "Finance";
    case "admin": return "Admin";
    case "it": return "IT";
    case "marketing": return "Marketing";
    case "hr": return "HR";
    case "support": return "Support";
    default: return "User";
  }
};

/** Sales page in-app tabs surfaced as sidebar children (deep-linked via ?tab=). */
export interface SalesTabItem {
  tab: string;
  label: string;
  icon: LucideIcon;
  roles: string[];
}

const SALES_BASE = ["sales", "sales_manager", "supply_chain", "admin"];
const MANAGERS = ["admin", "sales_manager"];

export const salesTabItems: SalesTabItem[] = [
  { tab: "my_leads", label: "My Leads", icon: Contact, roles: SALES_BASE },
  { tab: "manager", label: "Dashboard", icon: BarChart3, roles: MANAGERS },
  { tab: "leads", label: "Leads", icon: Users, roles: SALES_BASE },
  { tab: "prospects", label: "Prospects", icon: Target, roles: SALES_BASE },
  { tab: "pipeline", label: "Pipeline", icon: TrendingUp, roles: SALES_BASE },
  { tab: "quotes", label: "Quotes", icon: FileText, roles: SALES_BASE },
  { tab: "untouched", label: "Untouched", icon: AlertTriangle, roles: SALES_BASE },
  { tab: "followups", label: "Follow-ups", icon: CalendarCheck, roles: SALES_BASE },
  { tab: "mega_deals", label: "Mega Deals", icon: Star, roles: SALES_BASE },
  { tab: "companies", label: "Companies", icon: Building2, roles: SALES_BASE },
  { tab: "outbound", label: "Outbound", icon: Phone, roles: SALES_BASE },
  { tab: "enquiries", label: "Enquiries", icon: Package, roles: MANAGERS },
  { tab: "tasks", label: "Tasks", icon: ListTodo, roles: SALES_BASE },
  { tab: "source_performance", label: "Source Tracker", icon: BarChart3, roles: MANAGERS },
  { tab: "availability", label: "Availability", icon: CalendarOff, roles: MANAGERS },
];
