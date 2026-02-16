import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface OrgDepartment {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface OrgRole {
  id: string;
  name: string;
  label: string;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
}

export const useOrgSettings = () => {
  const { toast } = useToast();
  const [departments, setDepartments] = useState<OrgDepartment[]>([]);
  const [roles, setRoles] = useState<OrgRole[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDepartments = useCallback(async () => {
    const { data, error } = await supabase
      .from("org_departments")
      .select("id, name, is_active, created_at")
      .order("name");
    if (error) {
      console.error("Error fetching departments:", error);
      return;
    }
    setDepartments(data || []);
  }, []);

  const fetchRoles = useCallback(async () => {
    const { data, error } = await supabase
      .from("org_roles")
      .select("id, name, label, is_system, is_active, created_at")
      .order("name");
    if (error) {
      console.error("Error fetching roles:", error);
      return;
    }
    setRoles(data || []);
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchDepartments(), fetchRoles()]);
    setLoading(false);
  }, [fetchDepartments, fetchRoles]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const addDepartment = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const { error } = await supabase.from("org_departments").insert({ name: trimmed });
    if (error) {
      toast({ title: "Error", description: error.message.includes("duplicate") ? "Department already exists" : error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Department Added", description: `${trimmed} has been added` });
    await fetchDepartments();
    return true;
  };

  const updateDepartment = async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const { error } = await supabase.from("org_departments").update({ name: trimmed }).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message.includes("duplicate") ? "Department already exists" : error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Department Updated" });
    await fetchDepartments();
    return true;
  };

  const deleteDepartment = async (id: string, name: string) => {
    const { error } = await supabase.from("org_departments").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Department Deleted", description: `${name} has been removed` });
    await fetchDepartments();
    return true;
  };

  const addRole = async (name: string, label: string) => {
    const trimmedName = name.trim().toLowerCase().replace(/\s+/g, "_");
    const trimmedLabel = label.trim();
    if (!trimmedName || !trimmedLabel) return false;
    const { error } = await supabase.from("org_roles").insert({ name: trimmedName, label: trimmedLabel });
    if (error) {
      toast({ title: "Error", description: error.message.includes("duplicate") ? "Role already exists" : error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Role Added", description: `${trimmedLabel} has been added` });
    await fetchRoles();
    return true;
  };

  const updateRole = async (id: string, label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return false;
    const { error } = await supabase.from("org_roles").update({ label: trimmed }).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Role Updated" });
    await fetchRoles();
    return true;
  };

  const deleteRole = async (id: string, label: string) => {
    const { error } = await supabase.from("org_roles").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Role Deleted", description: `${label} has been removed` });
    await fetchRoles();
    return true;
  };

  return {
    departments,
    roles,
    loading,
    addDepartment,
    updateDepartment,
    deleteDepartment,
    addRole,
    updateRole,
    deleteRole,
  };
};
