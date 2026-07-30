import { Badge } from "@/components/ui/badge";
import {
  Phone, MessageCircle, Mail, Globe, FileText, Users,
  UserCheck, Repeat, Megaphone, ShoppingBag, HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SourceMeta = {
  label: string;
  icon: typeof Phone;
  className: string;
};

/**
 * Canonical source keys. We normalize any incoming free-text source
 * (prospect.source_type, prospect/pipeline/order.lead_source, order.source)
 * onto one of these.
 */
const SOURCE_CONFIG: Record<string, SourceMeta> = {
  call:        { label: "Call",      icon: Phone,         className: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30" },
  myoperator:  { label: "MyOp",      icon: Phone,         className: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30" },
  chat:        { label: "Chat",      icon: MessageCircle, className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
  whatsapp:    { label: "WhatsApp",  icon: MessageCircle, className: "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30" },
  interakt:    { label: "Interakt",  icon: MessageCircle, className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
  email:       { label: "Email",     icon: Mail,          className: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30" },
  website:     { label: "Website",   icon: Globe,         className: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30" },
  website_form:{ label: "Web Form",  icon: FileText,      className: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30" },
  form_lead:   { label: "Form Lead", icon: FileText,      className: "bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/30" },
  qform:       { label: "QForm",     icon: FileText,      className: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30" },
  enquiry:     { label: "Enquiry",   icon: HelpCircle,    className: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30" },
  lead:        { label: "Lead",      icon: UserCheck,     className: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30" },
  referral:    { label: "Referral",  icon: Users,         className: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30" },
  repeated:    { label: "Repeat",    icon: Repeat,        className: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  walk_in:     { label: "Walk-in",   icon: Users,         className: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30" },
  google_ads:  { label: "Google Ads",icon: Megaphone,     className: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30" },
  shopify:     { label: "Shopify",   icon: ShoppingBag,   className: "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30" },
  manual:      { label: "Manual",    icon: UserCheck,     className: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30" },
};

const UNKNOWN: SourceMeta = {
  label: "Unknown",
  icon: HelpCircle,
  className: "bg-muted text-muted-foreground border-border",
};

/** Canonical lead-source options for dropdowns (same list used by lead badges). */
export const LEAD_SOURCE_OPTIONS: { value: string; label: string }[] =
  Object.entries(SOURCE_CONFIG).map(([value, meta]) => ({ value, label: meta.label }));

/** Normalize free-text source values to a canonical key. */
export function normalizeSource(raw?: string | null): string | null {
  if (!raw) return null;
  const s = raw.toString().trim().toLowerCase().replace(/[-\s]+/g, "_");
  if (!s) return null;
  // Strip integration prefixes like "shopify:#1234"
  if (s.startsWith("shopify")) return "shopify";
  if (s.startsWith("website_form") || s === "webform") return "website_form";
  if (s === "myop") return "myoperator";
  if (s === "whats_app" || s === "whatsapp") return "whatsapp";
  if (s === "walkin") return "walk_in";
  return s;
}

export function getSourceMeta(raw?: string | null): SourceMeta {
  const key = normalizeSource(raw);
  if (!key) return UNKNOWN;
  return SOURCE_CONFIG[key] ?? {
    label: key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    icon: HelpCircle,
    className: "bg-muted text-foreground border-border",
  };
}

interface LeadSourceBadgeProps {
  source?: string | null;
  /** Optional secondary source label (e.g. show source_type AND lead_source). */
  size?: "xs" | "sm" | "md";
  showIcon?: boolean;
  className?: string;
  /** Fallback label when source is missing. Defaults to a muted "—" badge. */
  fallback?: "hide" | "show";
}

export function LeadSourceBadge({
  source,
  size = "sm",
  showIcon = true,
  className,
  fallback = "show",
}: LeadSourceBadgeProps) {
  const meta = getSourceMeta(source);
  const isUnknown = !normalizeSource(source);
  if (isUnknown && fallback === "hide") return null;

  const Icon = meta.icon;
  const sizeClass =
    size === "xs" ? "text-[9px] px-1.5 py-0 gap-1 h-4"
    : size === "md" ? "text-xs px-2 py-1 gap-1.5"
    : "text-[10px] px-1.5 py-0.5 gap-1 h-5";
  const iconClass = size === "md" ? "h-3.5 w-3.5" : "h-3 w-3";

  return (
    <Badge
      variant="outline"
      className={cn("font-medium border", meta.className, sizeClass, className)}
      title={`Source: ${source ?? "Unknown"}`}
    >
      {showIcon && <Icon className={iconClass} />}
      <span className="whitespace-nowrap">{meta.label}</span>
    </Badge>
  );
}

export default LeadSourceBadge;