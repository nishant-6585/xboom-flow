import { Card, CardContent } from "@/components/ui/card";
import { SalarySheetEntry, calculateEarnings, calculateTotalDeductions, calculateNetPay } from "@/hooks/useSalarySheets";
import { Users, TrendingUp, TrendingDown, Banknote } from "lucide-react";

interface Props {
  entries: SalarySheetEntry[];
}

export function PayrollSummaryPanel({ entries }: Props) {
  if (entries.length === 0) return null;

  const totalEarnings = entries.reduce((s, e) => s + calculateEarnings(e), 0);
  const totalDeductions = entries.reduce((s, e) => s + calculateTotalDeductions(e), 0);
  const totalNetPay = entries.reduce((s, e) => s + calculateNetPay(e), 0);

  const fmt = (v: number) => v.toLocaleString("en-IN", { minimumFractionDigits: 2 });

  const stats = [
    { label: "Total Employees", value: String(entries.length), icon: Users, color: "text-primary" },
    { label: "Total Earnings", value: `₹${fmt(totalEarnings)}`, icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400" },
    { label: "Total Deductions", value: `₹${fmt(totalDeductions)}`, icon: TrendingDown, color: "text-red-600 dark:text-red-400" },
    { label: "Total Net Pay", value: `₹${fmt(totalNetPay)}`, icon: Banknote, color: "text-primary font-bold" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map(s => (
        <Card key={s.label}>
          <CardContent className="p-4 flex flex-col items-center text-center">
            <s.icon className={`h-5 w-5 mb-1 ${s.color}`} />
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-sm font-semibold ${s.color}`}>{s.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
