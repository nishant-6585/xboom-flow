import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Loader2, Search, Users, User, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { GroupedTraining } from "@/hooks/useEmployeeTrainings";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: GroupedTraining | null;
  onAddEmployees: (trainingId: string, employeeIds: string[], dueDate: string) => Promise<void>;
}

export function AddEmployeesToTrainingDialog({ open, onOpenChange, group, onAddEmployees }: Props) {
  const { user, profile } = useAuth();
  const [employees, setEmployees] = useState<{ id: string; name: string; department: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"team" | "employee">("team");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingEmps, setLoadingEmps] = useState(false);

  const alreadyAssignedIds = useMemo(
    () => new Set(group?.assignments.map(a => a.employee_id) || []),
    [group?.assignments]
  );

  useEffect(() => {
    if (open && group) {
      setSelectedIds([]);
      setSelectedTeams([]);
      setSearch("");
      setDueDate(group.due_date?.split("T")[0] || "");
      setLoadingEmps(true);
      supabase
        .from("employees")
        .select("id, name, department")
        .eq("is_active", true)
        .order("name")
        .then(({ data }) => {
          setEmployees(data || []);
          setLoadingEmps(false);
        });
    }
  }, [open, group?.training_id]);

  const teams = useMemo(() => {
    const deptMap = new Map<string, { name: string; count: number; availableCount: number }>();
    employees.forEach(e => {
      const dept = e.department || "General";
      const entry = deptMap.get(dept) || { name: dept, count: 0, availableCount: 0 };
      entry.count++;
      if (!alreadyAssignedIds.has(e.id)) entry.availableCount++;
      deptMap.set(dept, entry);
    });
    return Array.from(deptMap.values())
      .filter(t => t.availableCount > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees, alreadyAssignedIds]);

  const availableEmployees = useMemo(() => {
    return employees
      .filter(e => !alreadyAssignedIds.has(e.id))
      .filter(e =>
        !search ||
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        (e.department || "").toLowerCase().includes(search.toLowerCase())
      );
  }, [employees, alreadyAssignedIds, search]);

  const getTeamEmployees = (team: string) =>
    employees.filter(e => (e.department || "General") === team && !alreadyAssignedIds.has(e.id));

  const toggleTeam = (teamName: string) => {
    const teamEmpIds = getTeamEmployees(teamName).map(e => e.id);
    const isSelected = selectedTeams.includes(teamName);
    if (isSelected) {
      setSelectedTeams(prev => prev.filter(t => t !== teamName));
      setSelectedIds(prev => prev.filter(id => !teamEmpIds.includes(id)));
    } else {
      setSelectedTeams(prev => [...prev, teamName]);
      setSelectedIds(prev => [...new Set([...prev, ...teamEmpIds])]);
    }
  };

  const toggleEmployee = (empId: string) => {
    setSelectedIds(prev =>
      prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]
    );
    // Sync team checkbox
    const emp = employees.find(e => e.id === empId);
    if (emp) {
      const dept = emp.department || "General";
      const teamEmpIds = getTeamEmployees(dept).map(e => e.id);
      const updatedSelection = selectedIds.includes(empId)
        ? selectedIds.filter(id => id !== empId)
        : [...selectedIds, empId];
      const allSelected = teamEmpIds.every(id => updatedSelection.includes(id));
      if (allSelected && !selectedTeams.includes(dept)) {
        setSelectedTeams(prev => [...prev, dept]);
      } else if (!allSelected && selectedTeams.includes(dept)) {
        setSelectedTeams(prev => prev.filter(t => t !== dept));
      }
    }
  };

  const handleSubmit = async () => {
    if (!group || selectedIds.length === 0 || !dueDate) return;
    setSaving(true);
    try {
      await onAddEmployees(group.training_id, selectedIds, dueDate);
      onOpenChange(false);
    } catch {
      // error handled upstream
    } finally {
      setSaving(false);
    }
  };

  if (!group) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Add Employees to Training
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
            {group.training_title}
          </p>
        </DialogHeader>

        <div className="space-y-4 flex-1 flex flex-col min-h-0">
          {/* Due date override */}
          <div>
            <Label>Due Date</Label>
            <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>

          {/* Tab toggle */}
          <Tabs value={tab} onValueChange={v => { setTab(v as "team" | "employee"); setSearch(""); }}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="team" className="gap-2"><Users className="h-4 w-4" /> Team</TabsTrigger>
              <TabsTrigger value="employee" className="gap-2"><User className="h-4 w-4" /> Employee</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Search */}
          {tab === "employee" && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search employees..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          )}

          {/* List */}
          <ScrollArea className="flex-1 min-h-[200px] max-h-[40vh] border rounded-md">
            {loadingEmps ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : tab === "team" ? (
              <div className="p-3 space-y-2">
                {teams.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">All employees are already assigned.</p>
                ) : teams.map(t => {
                  const teamEmpIds = getTeamEmployees(t.name).map(e => e.id);
                  const allSelected = teamEmpIds.length > 0 && teamEmpIds.every(id => selectedIds.includes(id));
                  const someSelected = teamEmpIds.some(id => selectedIds.includes(id));

                  return (
                    <div key={t.name} className="flex items-center gap-3 py-2 px-2 rounded hover:bg-accent/50 cursor-pointer" onClick={() => toggleTeam(t.name)}>
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={() => toggleTeam(t.name)}
                        onClick={e => e.stopPropagation()}
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium">{t.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          ({t.availableCount} available)
                        </span>
                      </div>
                      {someSelected && (
                        <Badge variant="secondary" className="text-xs">
                          {teamEmpIds.filter(id => selectedIds.includes(id)).length} selected
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-3 space-y-1">
                {availableEmployees.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {search ? "No matching employees found." : "All employees are already assigned."}
                  </p>
                ) : availableEmployees.map(e => (
                  <div key={e.id} className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-accent/50 cursor-pointer" onClick={() => toggleEmployee(e.id)}>
                    <Checkbox
                      checked={selectedIds.includes(e.id)}
                      onCheckedChange={() => toggleEmployee(e.id)}
                      onClick={ev => ev.stopPropagation()}
                    />
                    <div className="flex-1">
                      <span className="text-sm">{e.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">({e.department || "General"})</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Selection summary */}
          {selectedIds.length > 0 && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{selectedIds.length}</span> employee{selectedIds.length > 1 ? "s" : ""} selected
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving || selectedIds.length === 0 || !dueDate}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <UserPlus className="h-4 w-4 mr-2" />
              Add {selectedIds.length > 0 ? `${selectedIds.length} Employee${selectedIds.length > 1 ? "s" : ""}` : "Employees"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
