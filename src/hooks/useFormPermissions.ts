import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type FormPermissions = {
  can_view_forms: boolean;
  can_create_forms: boolean;
  can_edit_forms: boolean;
  can_view_submissions: boolean;
  can_delete_submissions: boolean;
};

const DEFAULT_PERMISSIONS: FormPermissions = {
  can_view_forms: false,
  can_create_forms: false,
  can_edit_forms: false,
  can_view_submissions: false,
  can_delete_submissions: false,
};

/**
 * Reads the current user's Forms permissions (stored in public.form_permissions).
 * Admin is treated as full access at the call site (role-based), not here.
 */
export function useFormPermissions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["form_permissions", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      if (!user?.id) return DEFAULT_PERMISSIONS;

      const { data, error } = await supabase
        .from("form_permissions")
        .select(
          "can_view_forms, can_create_forms, can_edit_forms, can_view_submissions, can_delete_submissions"
        )
        .eq("user_id", user.id)
        .maybeSingle();

      // If the table is not readable for some reason, fall back to no access.
      if (error) return DEFAULT_PERMISSIONS;

      return {
        can_view_forms: !!data?.can_view_forms,
        can_create_forms: !!data?.can_create_forms,
        can_edit_forms: !!data?.can_edit_forms,
        can_view_submissions: !!data?.can_view_submissions,
        can_delete_submissions: !!data?.can_delete_submissions,
      } satisfies FormPermissions;
    },
  });
}
