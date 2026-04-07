import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Briefcase, GraduationCap, FileText, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface EmploymentRecord {
  id: string;
  employee_id: string;
  employment_type: string;
  salary: number | null;
  stipend: number | null;
  effective_from: string;
  effective_to: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

interface Props {
  employeeId: string;
  employeeName: string;
  isHROrAdmin?: boolean;
}

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Briefcase; color: string }> = {
  INTERN: { label: "Intern", icon: GraduationCap, color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  FULL_TIME: { label: "Full-Time", icon: Briefcase, color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  CONTRACT: { label: "Contract", icon: FileText, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
};

export function EmploymentHistoryPanel({ employeeId, employeeName, isHROrAdmin }: Props) {
  const { user, profile } = useAuth();
  const [records, setRecords] = useState<EmploymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    employment_type: "FULL_TIME",
    salary: "",
    stipend: "",
    effective_from: "",
  });

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("employment_history" as any)
      .select("*")
      .eq("employee_id", employeeId)
      .order("effective_from", { ascending: false });

    if (!error && data) {
      setRecords(data as unknown as EmploymentRecord[]);
    }
    setLoading(false);
  }, [employeeId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleAdd = async () => {
    if (!form.effective_from) {
      toast.error("Effective date is required");
      return;
    }
    if (form.employment_type === "INTERN" && !form.stipend) {
      toast.error("Stipend is required for Intern type");
      return;
    }
    if (form.employment_type !== "INTERN" && !form.salary) {
      toast.error("Salary is required for this employment type");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("employment_history" as any).insert({
        employee_id: employeeId,
        employment_type: form.employment_type,
        salary: form.employment_type !== "INTERN" ? parseFloat(form.salary) : null,
        stipend: form.employment_type === "INTERN" ? parseFloat(form.stipend) : null,
        effective_from: form.effective_from,
        created_by: user?.id,
        created_by_name: profile?.name || "Unknown",
      } as any);

      if (error) throw error;

      toast.success("Employment transition recorded");
      setDialogOpen(false);
      setForm({ employment_type: "FULL_TIME", salary: "", stipend: "", effective_from: "" });
      await fetchHistory();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to add employment record");
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (val: number | null) => {
    if (!val) return "—";
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(val);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-primary">Employment History</h4>
        {isHROrAdmin && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDialogOpen(true)}>
            <Plus className="w-3.5 h-3.5" /> Add Transition
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : records.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">No employment history recorded yet.</p>
            {isHROrAdmin && (
              <p className="text-xs text-muted-foreground mt-1">
                Click "Add Transition" to record the first employment type.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

          <div className="space-y-3">
            {records.map((record, idx) => {
              const config = TYPE_CONFIG[record.employment_type] || TYPE_CONFIG.FULL_TIME;
              const Icon = config.icon;
              const isActive = !record.effective_to;

              return (
                <div key={record.id} className="relative pl-10">
                  {/* Timeline dot */}
                  <div className={`absolute left-2.5 top-3 w-3 h-3 rounded-full border-2 ${
                    isActive ? "bg-primary border-primary" : "bg-background border-muted-foreground/40"
                  }`} />

                  <Card className={isActive ? "border-primary/30" : ""}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <Badge className={`${config.color} gap-1`}>
                            <Icon className="w-3 h-3" />
                            {config.label}
                          </Badge>
                          {isActive && (
                            <Badge variant="default" className="text-[10px]">Current</Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {format(new Date(record.effective_from), "dd MMM yyyy")}
                          {record.effective_to ? (
                            <>
                              <ArrowRight className="w-3 h-3 inline mx-1" />
                              {format(new Date(record.effective_to), "dd MMM yyyy")}
                            </>
                          ) : (
                            <span className="text-primary ml-1">→ Present</span>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex gap-4 text-sm">
                        {record.salary != null && (
                          <span>Salary: <strong>{formatCurrency(record.salary)}</strong>/month</span>
                        )}
                        {record.stipend != null && (
                          <span>Stipend: <strong>{formatCurrency(record.stipend)}</strong>/month</span>
                        )}
                      </div>
                      {record.created_by_name && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Added by {record.created_by_name} on {format(new Date(record.created_at), "dd MMM yyyy")}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Transition Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Employment Transition — {employeeName}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Employment Type</Label>
              <Select value={form.employment_type} onValueChange={v => setForm(f => ({ ...f, employment_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INTERN">Intern</SelectItem>
                  <SelectItem value="FULL_TIME">Full-Time</SelectItem>
                  <SelectItem value="CONTRACT">Contract</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Effective From</Label>
              <Input
                type="date"
                value={form.effective_from}
                onChange={e => setForm(f => ({ ...f, effective_from: e.target.value }))}
              />
            </div>

            {form.employment_type === "INTERN" ? (
              <div className="space-y-1">
                <Label>Monthly Stipend (₹)</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.stipend}
                  onChange={e => setForm(f => ({ ...f, stipend: e.target.value }))}
                  placeholder="e.g. 10000"
                />
              </div>
            ) : (
              <div className="space-y-1">
                <Label>Monthly Salary (₹)</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.salary}
                  onChange={e => setForm(f => ({ ...f, salary: e.target.value }))}
                  placeholder="e.g. 25000"
                />
              </div>
            )}

            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              <strong>Note:</strong> Adding a new transition will automatically close the previous active employment record. Payroll will be pro-rated based on these dates.
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving}>
              {saving ? "Saving..." : "Add Transition"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
