import { useState } from "react";
import { useOrgSettings, OrgDepartment, OrgRole } from "@/hooks/useOrgSettings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Pencil, Trash2, Building2, ShieldCheck, Check, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const OrgSettingsPanel = () => {
  const {
    departments,
    roles,
    loading,
    addDepartment,
    updateDepartment,
    deleteDepartment,
    addRole,
    updateRole,
    deleteRole,
  } = useOrgSettings();

  const [newDeptName, setNewDeptName] = useState("");
  const [editingDept, setEditingDept] = useState<{ id: string; name: string } | null>(null);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleLabel, setNewRoleLabel] = useState("");
  const [editingRole, setEditingRole] = useState<{ id: string; label: string } | null>(null);
  const [addingDept, setAddingDept] = useState(false);
  const [addingRole, setAddingRole] = useState(false);

  const handleAddDepartment = async () => {
    if (!newDeptName.trim()) return;
    setAddingDept(true);
    const success = await addDepartment(newDeptName);
    if (success) setNewDeptName("");
    setAddingDept(false);
  };

  const handleUpdateDepartment = async () => {
    if (!editingDept) return;
    await updateDepartment(editingDept.id, editingDept.name);
    setEditingDept(null);
  };

  const handleAddRole = async () => {
    if (!newRoleName.trim() || !newRoleLabel.trim()) return;
    setAddingRole(true);
    const success = await addRole(newRoleName, newRoleLabel);
    if (success) {
      setNewRoleName("");
      setNewRoleLabel("");
    }
    setAddingRole(false);
  };

  const handleUpdateRole = async () => {
    if (!editingRole) return;
    await updateRole(editingRole.id, editingRole.label);
    setEditingRole(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Departments */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Departments
          </CardTitle>
          <CardDescription>Manage organizational departments</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add new */}
          <div className="flex gap-2">
            <Input
              placeholder="New department name"
              value={newDeptName}
              onChange={(e) => setNewDeptName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddDepartment()}
              maxLength={50}
            />
            <Button onClick={handleAddDepartment} disabled={addingDept || !newDeptName.trim()} size="sm">
              {addingDept ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </Button>
          </div>

          {/* List */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {departments.map((dept) => (
              <div key={dept.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                {editingDept?.id === dept.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      value={editingDept.name}
                      onChange={(e) => setEditingDept({ ...editingDept, name: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && handleUpdateDepartment()}
                      className="h-8"
                      maxLength={50}
                      autoFocus
                    />
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleUpdateDepartment}>
                      <Check className="w-4 h-4 text-primary" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingDept(null)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className="font-medium text-sm">{dept.name}</span>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingDept({ id: dept.id, name: dept.name })}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Department</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{dept.name}"? This won't affect users already assigned to this department.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteDepartment(dept.id, dept.name)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Roles */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            Roles
          </CardTitle>
          <CardDescription>Manage organizational roles. System roles cannot be deleted.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add new */}
          <div className="flex gap-2">
            <Input
              placeholder="Role key (e.g. logistics)"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
              maxLength={30}
              className="flex-1"
            />
            <Input
              placeholder="Display label"
              value={newRoleLabel}
              onChange={(e) => setNewRoleLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddRole()}
              maxLength={50}
              className="flex-1"
            />
            <Button onClick={handleAddRole} disabled={addingRole || !newRoleName.trim() || !newRoleLabel.trim()} size="sm">
              {addingRole ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </Button>
          </div>

          {/* List */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {roles.map((role) => (
              <div key={role.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                {editingRole?.id === role.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      value={editingRole.label}
                      onChange={(e) => setEditingRole({ ...editingRole, label: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && handleUpdateRole()}
                      className="h-8"
                      maxLength={50}
                      autoFocus
                    />
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleUpdateRole}>
                      <Check className="w-4 h-4 text-primary" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingRole(null)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{role.label}</span>
                      <Badge variant="outline" className="text-xs font-mono">{role.name}</Badge>
                      {role.is_system && <Badge variant="secondary" className="text-xs">System</Badge>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingRole({ id: role.id, label: role.label })}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      {!role.is_system && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Role</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{role.label}"? This won't affect users already assigned to this role.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteRole(role.id, role.label)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default OrgSettingsPanel;
