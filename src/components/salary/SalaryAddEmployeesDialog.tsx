import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Employee {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sheetId: string;
  existingEmployeeIds: string[];
  onAdd: (employees: Employee[]) => Promise<void>;
}

export function SalaryAddEmployeesDialog({ open, onOpenChange, sheetId, existingEmployeeIds, onAdd }: Props) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from("employees")
      .select("id, name")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => {
        const available = (data || []).filter((e: any) => !existingEmployeeIds.includes(e.id));
        setEmployees(available as Employee[]);
        setSelected(new Set(available.map((e: any) => e.id)));
        setLoading(false);
      });
  }, [open, existingEmployeeIds]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const selectAll = () => {
    if (selected.size === employees.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(employees.map((e) => e.id)));
    }
  };

  const handleAdd = async () => {
    const toAdd = employees.filter((e) => selected.has(e.id));
    if (toAdd.length === 0) return;
    setAdding(true);
    await onAdd(toAdd);
    setAdding(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Employees to Sheet</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : employees.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">All active employees are already in this sheet.</p>
        ) : (
          <>
            <div className="flex items-center gap-2 pb-2 border-b">
              <Checkbox
                checked={selected.size === employees.length}
                onCheckedChange={selectAll}
              />
              <span className="text-sm font-medium">
                Select All ({selected.size}/{employees.length})
              </span>
            </div>
            <ScrollArea className="max-h-64">
              <div className="space-y-2">
                {employees.map((emp) => (
                  <label key={emp.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer">
                    <Checkbox
                      checked={selected.has(emp.id)}
                      onCheckedChange={() => toggle(emp.id)}
                    />
                    <span className="text-sm">{emp.name}</span>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleAdd} disabled={adding || selected.size === 0}>
            {adding ? "Adding..." : `Add ${selected.size} Employees`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
