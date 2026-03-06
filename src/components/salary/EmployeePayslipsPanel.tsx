import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";

const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface Payslip {
  id: string;
  month: number;
  year: number;
  pdf_url: string;
  generated_at: string;
  generated_by_name: string | null;
}

export function EmployeePayslipsPanel() {
  const { user } = useAuth();
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState<string>("all");

  useEffect(() => {
    if (!user) return;

    const fetchPayslips = async () => {
      setLoading(true);
      // Get employee id for this user
      const { data: emp } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!emp) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("employee_payslips")
        .select("*")
        .eq("employee_id", emp.id)
        .order("year", { ascending: false })
        .order("month", { ascending: false });

      setPayslips((data as unknown as Payslip[]) || []);
      setLoading(false);
    };

    fetchPayslips();
  }, [user]);

  const years = [...new Set(payslips.map(p => p.year))].sort((a, b) => b - a);
  const filtered = yearFilter === "all" ? payslips : payslips.filter(p => String(p.year) === yearFilter);

  const handleDownload = async (payslip: Payslip) => {
    // Download via signed URL for private bucket
    const emp = payslips.length > 0 ? payslips[0] : null;
    if (!emp) return;

    // Try to get a download URL
    window.open(payslip.pdf_url, "_blank");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5" />
          My Payslips
        </CardTitle>
        {years.length > 1 && (
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Filter year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {years.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No payslips available yet.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Generated On</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{MONTH_NAMES[p.month]}</TableCell>
                  <TableCell>{p.year}</TableCell>
                  <TableCell>{format(new Date(p.generated_at), "dd MMM yyyy")}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => handleDownload(p)}>
                      <Download className="h-4 w-4 mr-1" /> Download
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
