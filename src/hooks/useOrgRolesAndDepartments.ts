import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ActiveOrgRole {
  id: string;
  name: string;
  label: string;
}

export interface ActiveOrgDepartment {
  id: string;
  name: string;
}

export const useOrgRoles = () => {
  const [roles, setRoles] = useState<ActiveOrgRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("org_roles")
        .select("id, name, label")
        .eq("is_active", true)
        .order("name");
      setRoles(data || []);
      setLoading(false);
    };
    fetch();
  }, []);

  return { roles, loading };
};

export const useOrgDepartments = () => {
  const [departments, setDepartments] = useState<ActiveOrgDepartment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("org_departments")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      setDepartments(data || []);
      setLoading(false);
    };
    fetch();
  }, []);

  return { departments, loading };
};
