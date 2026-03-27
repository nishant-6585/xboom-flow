import { AlertTriangle, TrendingUp, Clock, Package, Users, Calendar, DollarSign, Truck, useMemo } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

interface DailyBriefingWidgetProps {
  onPrompt: (prompt: string) => void;
}

interface BriefingItem {
  icon: React.ElementType;
  label: string;
  prompt: string;
  color: string;
}

const ROLE_BRIEFING_ITEMS: Record<string, BriefingItem[]> = {
  hr: [
    { icon: Users, label: 'Late check-ins today', prompt: 'Show me employees who checked in late today', color: 'text-destructive' },
    { icon: Calendar, label: 'Pending leave requests', prompt: 'Show all pending leave requests needing approval', color: 'text-orange-500' },
    { icon: Users, label: 'Employees on leave today', prompt: 'Who is on leave today?', color: 'text-amber-500' },
    { icon: Clock, label: 'Attendance anomalies', prompt: 'Show attendance anomalies — missing checkouts, frequent absences, and late patterns this week', color: 'text-primary' },
  ],
  sales: [
    { icon: TrendingUp, label: 'Hot leads to follow up', prompt: 'Show hot leads that need follow-up today', color: 'text-destructive' },
    { icon: AlertTriangle, label: 'Stalled deals', prompt: 'Show stalled pipeline deals with no activity in 7+ days', color: 'text-orange-500' },
    { icon: DollarSign, label: 'Deals closing this week', prompt: 'What deals are expected to close this week?', color: 'text-amber-500' },
    { icon: Clock, label: 'My pending tasks', prompt: 'What tasks and follow-ups are pending for me?', color: 'text-primary' },
  ],
  sales_manager: [
    { icon: TrendingUp, label: 'Team pipeline health', prompt: 'Show pipeline health — active deals, stalled deals, and conversion rate this month', color: 'text-destructive' },
    { icon: AlertTriangle, label: 'Overdue payments', prompt: 'Show all overdue payments with customer details', color: 'text-orange-500' },
    { icon: Users, label: 'Sales team performance', prompt: 'Show sales team performance breakdown this month — orders, pipeline value by salesperson', color: 'text-amber-500' },
    { icon: TrendingUp, label: 'Hot leads needing action', prompt: 'Show hot leads across the team that need immediate follow-up', color: 'text-primary' },
  ],
  finance: [
    { icon: AlertTriangle, label: 'Overdue payments', prompt: 'Show all overdue payments with amounts and aging', color: 'text-destructive' },
    { icon: DollarSign, label: 'Cashflow this week', prompt: 'Show expected payments and cashflow for this week', color: 'text-orange-500' },
    { icon: Clock, label: 'Pending expense approvals', prompt: 'Show pending expense approvals', color: 'text-amber-500' },
    { icon: AlertTriangle, label: 'High-risk customers', prompt: 'Show customers with multiple overdue payments — payment risk analysis', color: 'text-primary' },
  ],
  supply_chain: [
    { icon: Package, label: 'Low stock alerts', prompt: 'Show low stock inventory items needing reorder', color: 'text-destructive' },
    { icon: Truck, label: 'Delayed procurements', prompt: 'Show delayed procurement orders', color: 'text-orange-500' },
    { icon: Clock, label: 'Orders pending dispatch', prompt: 'Show orders pending dispatch or procurement planning', color: 'text-amber-500' },
    { icon: Package, label: 'Supplier performance', prompt: 'Show supplier reliability and delayed deliveries this month', color: 'text-primary' },
  ],
  admin: [
    { icon: AlertTriangle, label: 'Overdue payments', prompt: 'Show me all overdue payments with customer details and amounts', color: 'text-destructive' },
    { icon: TrendingUp, label: 'Hot leads needing follow-up', prompt: 'Show hot leads that need follow-up today', color: 'text-orange-500' },
    { icon: Clock, label: 'Pending approvals', prompt: 'What tasks and approvals are pending?', color: 'text-amber-500' },
    { icon: Package, label: 'Low stock alerts', prompt: 'Show me low stock inventory items', color: 'text-primary' },
  ],
};

// Default briefing for roles not explicitly listed
const DEFAULT_BRIEFING: BriefingItem[] = [
  { icon: Clock, label: 'My pending tasks', prompt: 'What tasks are assigned to me?', color: 'text-orange-500' },
  { icon: TrendingUp, label: 'Daily summary', prompt: 'Give me my daily briefing', color: 'text-primary' },
];

function getRoleBriefingTitle(roles: string[]): string {
  if (roles.includes('admin')) return 'Command Center';
  if (roles.includes('hr')) return 'People Pulse';
  if (roles.includes('finance')) return 'Cashflow Pulse';
  if (roles.includes('sales_manager')) return 'Revenue Pulse';
  if (roles.includes('sales')) return 'Deal Pulse';
  if (roles.includes('supply_chain')) return 'Supply Pulse';
  return 'Daily Briefing';
}

export function DailyBriefingWidget({ onPrompt }: DailyBriefingWidgetProps) {
  const { roles } = useAuth();

  // Pick the best matching role for briefing
  const primaryRole = ['admin', 'hr', 'finance', 'supply_chain', 'sales_manager', 'sales']
    .find(r => roles.includes(r as any)) || 'default';
  
  const items = ROLE_BRIEFING_ITEMS[primaryRole] || DEFAULT_BRIEFING;
  const title = getRoleBriefingTitle(roles);

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1 rounded-md bg-primary/15">
          <TrendingUp className="w-3.5 h-3.5 text-primary" />
        </div>
        <span className="text-xs font-semibold text-foreground">{title}</span>
      </div>
      <div className="space-y-1">
        {items.map(({ icon: Icon, label, prompt, color }) => (
          <button
            key={label}
            onClick={() => onPrompt(prompt)}
            className={cn(
              "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left",
              "hover:bg-background/60 transition-colors group"
            )}
          >
            <Icon className={cn("w-3.5 h-3.5 shrink-0", color)} />
            <span className="text-[11px] text-foreground/80 group-hover:text-foreground">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
