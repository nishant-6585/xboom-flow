import {
  Home, Zap, Package, FileSpreadsheet, ShoppingCart, Warehouse, Puzzle, Building2,
  IndianRupee, BookCheck, Shield, ListTodo, Ticket, MessageSquare, Users, CalendarDays,
  Receipt, Wrench, RotateCcw, Plane, Cpu,
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
