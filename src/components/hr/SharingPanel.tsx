import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShareRule, EmployeeOption } from "@/hooks/useHRDocuments";
import {
  Globe,
  Building2,
  User,
  Plus,
  X,
  Search,
  Lock,
  Users,
} from "lucide-react";

interface SharingPanelProps {
  shares: Omit<ShareRule, "id" | "created_by" | "created_at">[];
  onChange: (shares: Omit<ShareRule, "id" | "created_by" | "created_at">[]) => void;
  employees: EmployeeOption[];
  departments: string[];
}

export function SharingPanel({
  shares,
  onChange,
  employees,
  departments,
}: SharingPanelProps) {
  const [addMode, setAddMode] = useState<"all" | "department" | "individual" | null>(null);
  const [deptSearch, setDeptSearch] = useState("");
  const [empSearch, setEmpSearch] = useState("");
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [selectedEmps, setSelectedEmps] = useState<string[]>([]);

  const isSharedWithAll = shares.some((s) => s.share_type === "all");
  const sharedDepts = shares.filter((s) => s.share_type === "department").map((s) => s.department!);
  const sharedEmpIds = shares.filter((s) => s.share_type === "individual").map((s) => s.employee_id!);

  const filteredDepts = useMemo(() => {
    return departments.filter(
      (d) =>
        d.toLowerCase().includes(deptSearch.toLowerCase()) &&
        !sharedDepts.includes(d)
    );
  }, [departments, deptSearch, sharedDepts]);

  const filteredEmps = useMemo(() => {
    return employees.filter(
      (e) =>
        (e.name.toLowerCase().includes(empSearch.toLowerCase()) ||
          e.department.toLowerCase().includes(empSearch.toLowerCase())) &&
        !sharedEmpIds.includes(e.id)
    );
  }, [employees, empSearch, sharedEmpIds]);

  const handleShareAll = () => {
    if (isSharedWithAll) {
      onChange(shares.filter((s) => s.share_type !== "all"));
    } else {
      onChange([...shares, { share_type: "all", department: null, employee_id: null }]);
    }
  };

  const handleAddDepts = () => {
    const newShares = selectedDepts.map((dept) => ({
      share_type: "department" as const,
      department: dept,
      employee_id: null,
    }));
    // Remove "All Employees" if it was selected
    const filteredShares = shares.filter((s) => s.share_type !== "all");
    onChange([...filteredShares, ...newShares]);
    setSelectedDepts([]);
    setAddMode(null);
    setDeptSearch("");
  };

  const handleAddEmps = () => {
    const newShares = selectedEmps.map((empId) => ({
      share_type: "individual" as const,
      department: null,
      employee_id: empId,
    }));
    // Remove "All Employees" if it was selected
    const filteredShares = shares.filter((s) => s.share_type !== "all");
    onChange([...filteredShares, ...newShares]);
    setSelectedEmps([]);
    setAddMode(null);
    setEmpSearch("");
  };

  const removeShare = (index: number) => {
    onChange(shares.filter((_, i) => i !== index));
  };

  const getEmployeeName = (empId: string) => {
    return employees.find((e) => e.id === empId)?.name || "Unknown";
  };

  const getEmployeeDept = (empId: string) => {
    return employees.find((e) => e.id === empId)?.department || "";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium flex items-center gap-1.5">
          <Users className="h-4 w-4" />
          Sharing Settings
        </label>
        {shares.length === 0 && (
          <Badge variant="outline" className="text-xs gap-1">
            <Lock className="h-3 w-3" />
            Private
          </Badge>
        )}
      </div>

      {/* Quick toggle: All Employees */}
      <div
        className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={handleShareAll}
      >
        <Checkbox checked={isSharedWithAll} onCheckedChange={handleShareAll} />
        <Globe className="h-4 w-4 text-green-600" />
        <div className="flex-1">
          <p className="text-sm font-medium">All Employees</p>
          <p className="text-xs text-muted-foreground">Visible to entire organization</p>
        </div>
      </div>

      {/* Current shares list */}
      {shares.filter((s) => s.share_type !== "all").length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Shared with</p>
          <div className="space-y-1">
            {shares.map((share, idx) => {
              if (share.share_type === "all") return null;
              return (
                <div key={idx} className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-sm">
                  {share.share_type === "department" ? (
                    <>
                      <Building2 className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                      <span className="flex-1">{share.department} Department</span>
                    </>
                  ) : (
                    <>
                      <User className="h-3.5 w-3.5 text-purple-600 flex-shrink-0" />
                      <span className="flex-1">
                        {getEmployeeName(share.employee_id!)}
                        <span className="text-muted-foreground ml-1 text-xs">
                          ({getEmployeeDept(share.employee_id!)})
                        </span>
                      </span>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => removeShare(idx)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add buttons */}
      {!addMode && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-xs"
            onClick={() => setAddMode("department")}
          >
            <Building2 className="h-3.5 w-3.5" />
            Add Departments
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-xs"
            onClick={() => setAddMode("individual")}
          >
            <User className="h-3.5 w-3.5" />
            Add Employees
          </Button>
        </div>
      )}

      {/* Department picker */}
      {addMode === "department" && (
        <div className="border rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Select Departments</p>
            <Button variant="ghost" size="sm" onClick={() => { setAddMode(null); setSelectedDepts([]); setDeptSearch(""); }}>
              Cancel
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search departments..."
              value={deptSearch}
              onChange={(e) => setDeptSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
          <ScrollArea className="h-40">
            <div className="space-y-1">
              {filteredDepts.map((dept) => (
                <div
                  key={dept}
                  className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer"
                  onClick={() => {
                    setSelectedDepts((prev) =>
                      prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept]
                    );
                  }}
                >
                  <Checkbox checked={selectedDepts.includes(dept)} />
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm">{dept}</span>
                </div>
              ))}
              {filteredDepts.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No departments available</p>
              )}
            </div>
          </ScrollArea>
          {selectedDepts.length > 0 && (
            <Button size="sm" className="w-full" onClick={handleAddDepts}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add {selectedDepts.length} Department{selectedDepts.length > 1 ? "s" : ""}
            </Button>
          )}
        </div>
      )}

      {/* Employee picker */}
      {addMode === "individual" && (
        <div className="border rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Select Employees</p>
            <Button variant="ghost" size="sm" onClick={() => { setAddMode(null); setSelectedEmps([]); setEmpSearch(""); }}>
              Cancel
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search employees..."
              value={empSearch}
              onChange={(e) => setEmpSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
          <ScrollArea className="h-40">
            <div className="space-y-1">
              {filteredEmps.map((emp) => (
                <div
                  key={emp.id}
                  className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer"
                  onClick={() => {
                    setSelectedEmps((prev) =>
                      prev.includes(emp.id) ? prev.filter((id) => id !== emp.id) : [...prev, emp.id]
                    );
                  }}
                >
                  <Checkbox checked={selectedEmps.includes(emp.id)} />
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm">{emp.name}</span>
                    <span className="text-xs text-muted-foreground ml-1.5">({emp.department})</span>
                  </div>
                </div>
              ))}
              {filteredEmps.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No employees available</p>
              )}
            </div>
          </ScrollArea>
          {selectedEmps.length > 0 && (
            <Button size="sm" className="w-full" onClick={handleAddEmps}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add {selectedEmps.length} Employee{selectedEmps.length > 1 ? "s" : ""}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// Utility to get a human-readable visibility label from shares
export function getVisibilityLabel(
  shares: Omit<ShareRule, "id" | "created_by" | "created_at">[],
  visibility: string
): string {
  if (visibility === "private" || shares.length === 0) return "Private";
  if (shares.some((s) => s.share_type === "all")) return "All Employees";
  const depts = shares.filter((s) => s.share_type === "department").map((s) => s.department);
  const empCount = shares.filter((s) => s.share_type === "individual").length;
  const parts: string[] = [];
  if (depts.length > 0) parts.push(depts.join(", "));
  if (empCount > 0) parts.push(`${empCount} employee${empCount > 1 ? "s" : ""}`);
  return parts.join(" + ");
}
