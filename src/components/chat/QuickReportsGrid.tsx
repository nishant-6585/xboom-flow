import { useState } from 'react';
import {
  Users, Calendar, TrendingUp, TrendingDown, BarChart3, AlertTriangle,
  FileText, Zap, Phone, DollarSign, Target, Package, Truck,
  Wrench, BrainCircuit, PieChart, ShieldAlert, Activity,
  ChevronDown, ChevronUp, Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface QuickReport {
  icon: React.ElementType;
  label: string;
  prompt: string;
}

interface ReportCategory {
  title: string;
  emoji: string;
  reports: QuickReport[];
}

const HR_REPORTS: ReportCategory = {
  title: 'HR Reports',
  emoji: '👥',
  reports: [
    { icon: BarChart3, label: 'Leave Summary (30d)', prompt: 'Give me a leave summary for the last 30 days — total leaves, total days taken, breakdown by leave type (EL, Sick), and approval rate.' },
    { icon: Calendar, label: 'Upcoming Leaves (7d)', prompt: 'Show me all employees who have approved leaves in the next 7 days — include employee name, leave type, dates, and total days.' },
    { icon: AlertTriangle, label: 'High Leave Users', prompt: 'Show top 5 employees by total leave days taken in the last 90 days — include employee name, leave type breakdown, and total days.' },
    { icon: TrendingDown, label: 'Leave Trends', prompt: 'Show me monthly leave trends for the last 6 months — total leaves per month, by type (EL/Sick), and identify any spikes.' },
    { icon: FileText, label: 'Leave Balance Report', prompt: 'Show current leave balance for all employees — include employee name, EL balance, Sick leave balance, and total days used this year.' },
    { icon: ShieldAlert, label: 'Rejected Leaves', prompt: 'Show all rejected leave requests from the last 30 days — include employee name, leave type, requested dates, and rejection reason.' },
    { icon: Activity, label: 'Attendance vs Leave', prompt: 'Give me an attendance vs leave comparison for this month — total working days, average attendance %, total leave days, and highlight employees with low attendance.' },
  ],
};

const SALES_REPORTS: ReportCategory = {
  title: 'Sales Reports',
  emoji: '💰',
  reports: [
    { icon: Zap, label: 'Hot Leads', prompt: 'Show me all hot leads — include customer name, product, value, and days since last activity.' },
    { icon: Phone, label: 'Follow-ups Pending', prompt: 'Show all pending follow-ups — include customer name, last contact date, follow-up date, and salesperson.' },
    { icon: DollarSign, label: 'Sales This Month', prompt: 'Show me total orders for this month salesperson wise — include order count, total value, and comparison to last month.' },
    { icon: TrendingDown, label: 'Lost Deals Analysis', prompt: 'Analyze lost deals from the last 30 days — show count, total value lost, common reasons, and which stage they were lost at.' },
    { icon: Target, label: 'Top Salesperson', prompt: 'Show top performing salesperson this month — include orders won, total revenue, pipeline value, and conversion rate.' },
  ],
};

const OPS_REPORTS: ReportCategory = {
  title: 'Operations Reports',
  emoji: '📦',
  reports: [
    { icon: Package, label: 'Pending Orders', prompt: 'Show all pending orders — include order number, customer, product, quantity, and days since order.' },
    { icon: Truck, label: 'Delayed Deliveries', prompt: 'Show delayed deliveries — include order number, customer, expected date, actual status, and delay in days.' },
    { icon: AlertTriangle, label: 'Low Stock Alerts', prompt: 'Show low stock inventory items — include product name, current stock, reorder point, and days to stockout.' },
    { icon: PieChart, label: 'Inventory Summary', prompt: 'Give me an inventory summary — total SKUs, total stock value, low stock count, and top 5 fast-moving items.' },
    { icon: Wrench, label: 'Repair Status Report', prompt: 'Show repair status report — total repairs, by status (pending/in-progress/completed), average repair time, and overdue repairs.' },
  ],
};

const ADMIN_REPORTS: ReportCategory = {
  title: 'Management Reports',
  emoji: '📊',
  reports: [
    { icon: BarChart3, label: 'Business Overview', prompt: 'Give me a business overview — total orders, revenue, pipeline value, active leads, and key metrics for this month vs last month.' },
    { icon: DollarSign, label: 'Revenue Summary', prompt: 'Show revenue summary — total revenue this month, payment collection status, overdue amounts, and revenue by product category.' },
    { icon: TrendingDown, label: 'Expense Insights', prompt: 'Show expense insights — procurement costs, operational expenses, and cost trends for the last 3 months.' },
    { icon: TrendingUp, label: 'Growth Trends', prompt: 'Show growth trends — month-over-month order growth, lead growth, revenue growth, and customer acquisition rate.' },
    { icon: ShieldAlert, label: 'Risk Alerts', prompt: 'Show risk alerts — overdue payments, stalled deals, low stock items, attendance anomalies, and any operational issues that need attention.' },
  ],
};

const ROLE_CATEGORIES: Record<string, ReportCategory[]> = {
  hr: [HR_REPORTS, ADMIN_REPORTS],
  admin: [ADMIN_REPORTS, HR_REPORTS, SALES_REPORTS, OPS_REPORTS],
  sales: [SALES_REPORTS],
  sales_manager: [SALES_REPORTS, ADMIN_REPORTS],
  finance: [ADMIN_REPORTS, SALES_REPORTS],
  supply_chain: [OPS_REPORTS, ADMIN_REPORTS],
  it: [ADMIN_REPORTS],
  marketing: [SALES_REPORTS, ADMIN_REPORTS],
};

interface QuickReportsGridProps {
  roles: string[];
  onSelectPrompt: (prompt: string) => void;
  disabled?: boolean;
}

export function QuickReportsGrid({ roles, onSelectPrompt, disabled }: QuickReportsGridProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const primaryRole = ['admin', 'hr', 'finance', 'supply_chain', 'sales_manager', 'sales', 'it', 'marketing']
    .find(r => roles.includes(r)) || 'admin';

  const categories = ROLE_CATEGORIES[primaryRole] || [ADMIN_REPORTS];

  return (
    <div className="w-full max-w-[380px] space-y-2">
      <div className="flex items-center gap-1.5 mb-1">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <span className="text-[11px] font-semibold text-foreground tracking-wide">Quick Reports</span>
      </div>

      <ScrollArea className="max-h-[220px]">
        <div className="space-y-1.5 pr-2">
          {categories.map((cat) => {
            const isExpanded = expandedCategory === cat.title;
            const displayReports = isExpanded ? cat.reports : cat.reports.slice(0, 3);

            return (
              <div key={cat.title} className="rounded-xl border border-border/40 dark:border-border/30 overflow-hidden">
                <button
                  onClick={() => setExpandedCategory(isExpanded ? null : cat.title)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-1.5",
                    "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
                    "hover:bg-muted/50 transition-colors"
                  )}
                >
                  <span>{cat.emoji} {cat.title}</span>
                  {cat.reports.length > 3 && (
                    isExpanded
                      ? <ChevronUp className="w-3 h-3" />
                      : <ChevronDown className="w-3 h-3" />
                  )}
                </button>

                <div className="grid grid-cols-2 gap-1 px-1.5 pb-1.5">
                  {displayReports.map(({ icon: Icon, label, prompt }, i) => (
                    <button
                      key={i}
                      onClick={() => !disabled && onSelectPrompt(prompt)}
                      disabled={disabled}
                      className={cn(
                        "flex items-center gap-1.5 p-2 rounded-lg text-left",
                        "bg-card hover:bg-primary/5 dark:hover:bg-primary/10",
                        "border border-transparent hover:border-primary/20",
                        "transition-all duration-150 group cursor-pointer",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                    >
                      <div className="p-1 rounded-md bg-primary/10 group-hover:bg-primary/20 transition-colors shrink-0">
                        <Icon className="w-3 h-3 text-primary" />
                      </div>
                      <span className="text-[10px] font-medium text-foreground leading-tight line-clamp-2">{label}</span>
                    </button>
                  ))}
                </div>

                {!isExpanded && cat.reports.length > 3 && (
                  <button
                    onClick={() => setExpandedCategory(cat.title)}
                    className="w-full text-[9px] text-primary/70 hover:text-primary py-1 transition-colors"
                  >
                    +{cat.reports.length - 3} more reports
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
