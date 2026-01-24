import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, ClipboardList, Eye, Pencil, Plus, Trash2, Users, Save, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface FormPermission {
  id: string;
  user_id: string;
  can_view_forms: boolean;
  can_create_forms: boolean;
  can_edit_forms: boolean;
  can_view_submissions: boolean;
  can_delete_submissions: boolean;
}

interface UserWithPermissions {
  user_id: string;
  name: string;
  email: string;
  role: string;
  permissions: FormPermission | null;
}

export function FormPermissionsPanel() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserWithPermissions[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUser, setSavingUser] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingChanges, setPendingChanges] = useState<Record<string, Partial<FormPermission>>>({});

  useEffect(() => {
    fetchUsersWithPermissions();
  }, []);

  const fetchUsersWithPermissions = async () => {
    try {
      setLoading(true);

      // Fetch all approved users with their roles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, name, email")
        .eq("is_approved", true);

      if (profilesError) throw profilesError;

      // Fetch roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      // Fetch form permissions
      const { data: permissions, error: permError } = await supabase
        .from("form_permissions")
        .select("*");

      if (permError) throw permError;

      // Combine data - exclude admins as they have full access
      const usersWithPerms: UserWithPermissions[] = (profiles || [])
        .map((profile) => {
          const userRole = roles?.find((r) => r.user_id === profile.user_id);
          const userPerm = permissions?.find((p) => p.user_id === profile.user_id);
          return {
            user_id: profile.user_id,
            name: profile.name,
            email: profile.email,
            role: userRole?.role || "unknown",
            permissions: userPerm || null,
          };
        })
        .filter((u) => u.role !== "admin"); // Admins have full access

      setUsers(usersWithPerms);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast({
        title: "Error",
        description: "Failed to load users",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePermissionChange = (userId: string, field: keyof FormPermission, value: boolean) => {
    setPendingChanges((prev) => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        [field]: value,
      },
    }));
  };

  const getEffectiveValue = (user: UserWithPermissions, field: keyof FormPermission): boolean => {
    if (pendingChanges[user.user_id]?.[field] !== undefined) {
      return pendingChanges[user.user_id][field] as boolean;
    }
    if (user.permissions) {
      return user.permissions[field] as boolean;
    }
    return false;
  };

  const hasChanges = (userId: string) => {
    return Object.keys(pendingChanges[userId] || {}).length > 0;
  };

  const savePermissions = async (userId: string) => {
    const user = users.find((u) => u.user_id === userId);
    if (!user) return;

    setSavingUser(userId);
    try {
      const changes = pendingChanges[userId] || {};
      
      if (user.permissions) {
        // Update existing
        const { error } = await supabase
          .from("form_permissions")
          .update(changes)
          .eq("user_id", userId);

        if (error) throw error;
      } else {
        // Insert new with defaults
        const { error } = await supabase
          .from("form_permissions")
          .insert({
            user_id: userId,
            can_view_forms: changes.can_view_forms ?? false,
            can_create_forms: changes.can_create_forms ?? false,
            can_edit_forms: changes.can_edit_forms ?? false,
            can_view_submissions: changes.can_view_submissions ?? false,
            can_delete_submissions: changes.can_delete_submissions ?? false,
          });

        if (error) throw error;
      }

      toast({
        title: "Permissions Updated",
        description: `Form permissions for ${user.name} have been saved`,
      });

      // Clear pending changes for this user
      setPendingChanges((prev) => {
        const updated = { ...prev };
        delete updated[userId];
        return updated;
      });

      // Refresh data
      fetchUsersWithPermissions();
    } catch (error) {
      console.error("Error saving permissions:", error);
      toast({
        title: "Error",
        description: "Failed to save permissions",
        variant: "destructive",
      });
    } finally {
      setSavingUser(null);
    }
  };

  const grantAllAccess = async (userId: string) => {
    const user = users.find((u) => u.user_id === userId);
    if (!user) return;

    setSavingUser(userId);
    try {
      const fullAccess = {
        can_view_forms: true,
        can_create_forms: true,
        can_edit_forms: true,
        can_view_submissions: true,
        can_delete_submissions: true,
      };

      if (user.permissions) {
        const { error } = await supabase
          .from("form_permissions")
          .update(fullAccess)
          .eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("form_permissions")
          .insert({ user_id: userId, ...fullAccess });
        if (error) throw error;
      }

      toast({
        title: "Full Access Granted",
        description: `${user.name} now has full form access`,
      });

      setPendingChanges((prev) => {
        const updated = { ...prev };
        delete updated[userId];
        return updated;
      });

      fetchUsersWithPermissions();
    } catch (error) {
      console.error("Error granting access:", error);
      toast({
        title: "Error",
        description: "Failed to grant access",
        variant: "destructive",
      });
    } finally {
      setSavingUser(null);
    }
  };

  const revokeAllAccess = async (userId: string) => {
    const user = users.find((u) => u.user_id === userId);
    if (!user) return;

    setSavingUser(userId);
    try {
      if (user.permissions) {
        const { error } = await supabase
          .from("form_permissions")
          .delete()
          .eq("user_id", userId);
        if (error) throw error;
      }

      toast({
        title: "Access Revoked",
        description: `${user.name}'s form access has been removed`,
      });

      setPendingChanges((prev) => {
        const updated = { ...prev };
        delete updated[userId];
        return updated;
      });

      fetchUsersWithPermissions();
    } catch (error) {
      console.error("Error revoking access:", error);
      toast({
        title: "Error",
        description: "Failed to revoke access",
        variant: "destructive",
      });
    } finally {
      setSavingUser(null);
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "sales": return "Sales";
      case "supply_chain": return "Supply Chain";
      case "finance": return "Finance";
      default: return role;
    }
  };

  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5" />
            Form Module Access Control
          </CardTitle>
          <CardDescription>
            Manage which users can view, create, edit forms and access submissions.
            Admins automatically have full access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search users by name, email, or role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 mb-6 p-3 bg-muted/50 rounded-lg text-sm">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-muted-foreground" />
              <span>View Forms</span>
            </div>
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-muted-foreground" />
              <span>Create Forms</span>
            </div>
            <div className="flex items-center gap-2">
              <Pencil className="w-4 h-4 text-muted-foreground" />
              <span>Edit/Delete Forms</span>
            </div>
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-blue-500" />
              <span>View Submissions</span>
            </div>
            <div className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-destructive" />
              <span>Delete Submissions</span>
            </div>
          </div>

          {filteredUsers.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {searchQuery ? "No users match your search" : "No non-admin users found"}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredUsers.map((user) => (
                <div
                  key={user.user_id}
                  className={`p-4 rounded-lg border transition-colors ${
                    hasChanges(user.user_id)
                      ? "border-primary bg-primary/5"
                      : "border-border bg-secondary/30"
                  }`}
                >
                  {/* User Info */}
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{user.name}</span>
                        <Badge variant="outline">{getRoleLabel(user.role)}</Badge>
                        {user.permissions && (
                          <Badge variant="secondary" className="text-xs">
                            Has Access
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>

                    {/* Quick Actions */}
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => grantAllAccess(user.user_id)}
                        disabled={savingUser === user.user_id}
                      >
                        Grant All
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => revokeAllAccess(user.user_id)}
                        disabled={savingUser === user.user_id || !user.permissions}
                      >
                        Revoke All
                      </Button>
                    </div>
                  </div>

                  {/* Permissions Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                    {/* View Forms */}
                    <div className="flex items-center justify-between gap-2 p-2 bg-background/50 rounded-lg">
                      <Label htmlFor={`${user.user_id}-view`} className="text-xs flex items-center gap-1 cursor-pointer">
                        <Eye className="w-3 h-3" />
                        View Forms
                      </Label>
                      <Switch
                        id={`${user.user_id}-view`}
                        checked={getEffectiveValue(user, "can_view_forms")}
                        onCheckedChange={(checked) =>
                          handlePermissionChange(user.user_id, "can_view_forms", checked)
                        }
                        disabled={savingUser === user.user_id}
                      />
                    </div>

                    {/* Create Forms */}
                    <div className="flex items-center justify-between gap-2 p-2 bg-background/50 rounded-lg">
                      <Label htmlFor={`${user.user_id}-create`} className="text-xs flex items-center gap-1 cursor-pointer">
                        <Plus className="w-3 h-3" />
                        Create
                      </Label>
                      <Switch
                        id={`${user.user_id}-create`}
                        checked={getEffectiveValue(user, "can_create_forms")}
                        onCheckedChange={(checked) =>
                          handlePermissionChange(user.user_id, "can_create_forms", checked)
                        }
                        disabled={savingUser === user.user_id}
                      />
                    </div>

                    {/* Edit Forms */}
                    <div className="flex items-center justify-between gap-2 p-2 bg-background/50 rounded-lg">
                      <Label htmlFor={`${user.user_id}-edit`} className="text-xs flex items-center gap-1 cursor-pointer">
                        <Pencil className="w-3 h-3" />
                        Edit/Delete
                      </Label>
                      <Switch
                        id={`${user.user_id}-edit`}
                        checked={getEffectiveValue(user, "can_edit_forms")}
                        onCheckedChange={(checked) =>
                          handlePermissionChange(user.user_id, "can_edit_forms", checked)
                        }
                        disabled={savingUser === user.user_id}
                      />
                    </div>

                    {/* View Submissions */}
                    <div className="flex items-center justify-between gap-2 p-2 bg-background/50 rounded-lg">
                      <Label htmlFor={`${user.user_id}-view-sub`} className="text-xs flex items-center gap-1 cursor-pointer">
                        <Eye className="w-3 h-3 text-blue-500" />
                        Submissions
                      </Label>
                      <Switch
                        id={`${user.user_id}-view-sub`}
                        checked={getEffectiveValue(user, "can_view_submissions")}
                        onCheckedChange={(checked) =>
                          handlePermissionChange(user.user_id, "can_view_submissions", checked)
                        }
                        disabled={savingUser === user.user_id}
                      />
                    </div>

                    {/* Delete Submissions */}
                    <div className="flex items-center justify-between gap-2 p-2 bg-background/50 rounded-lg">
                      <Label htmlFor={`${user.user_id}-delete-sub`} className="text-xs flex items-center gap-1 cursor-pointer">
                        <Trash2 className="w-3 h-3 text-destructive" />
                        Delete Sub.
                      </Label>
                      <Switch
                        id={`${user.user_id}-delete-sub`}
                        checked={getEffectiveValue(user, "can_delete_submissions")}
                        onCheckedChange={(checked) =>
                          handlePermissionChange(user.user_id, "can_delete_submissions", checked)
                        }
                        disabled={savingUser === user.user_id}
                      />
                    </div>
                  </div>

                  {/* Save Button */}
                  {hasChanges(user.user_id) && (
                    <div className="mt-4 flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => savePermissions(user.user_id)}
                        disabled={savingUser === user.user_id}
                      >
                        {savingUser === user.user_id ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4 mr-2" />
                        )}
                        Save Changes
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
