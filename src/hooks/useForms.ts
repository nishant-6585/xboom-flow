import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface FormField {
  id: string;
  form_id: string;
  field_type: 'text' | 'email' | 'phone' | 'number' | 'textarea' | 'dropdown' | 'checkbox' | 'radio' | 'date' | 'attachment';
  label: string;
  placeholder?: string;
  is_required: boolean;
  options?: { label: string; value: string }[];
  field_order: number;
  created_at: string;
}

export interface Form {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  is_public?: boolean;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  form_fields?: FormField[];
  submission_count?: number;
  view_count?: number;
}

export interface FormSubmission {
  id: string;
  form_id: string;
  submission_data: Record<string, unknown>;
  submitted_at: string;
  ip_address?: string;
  user_agent?: string;
}

export function useForms() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: forms = [], isLoading } = useQuery({
    queryKey: ["forms"],
    queryFn: async () => {
      // Get forms with fields
      const { data: formsData, error: formsError } = await supabase
        .from("forms")
        .select("*, form_fields(*)")
        .order("created_at", { ascending: false });
      
      if (formsError) throw formsError;

      // Get submission counts for all forms
      const { data: submissionCounts, error: subError } = await supabase
        .from("form_submissions")
        .select("form_id");
      
      // Get view counts for all forms
      const { data: viewCounts, error: viewError } = await supabase
        .from("form_views")
        .select("form_id");

      // Count submissions per form
      const subCountMap = new Map<string, number>();
      if (submissionCounts) {
        submissionCounts.forEach((s: { form_id: string }) => {
          subCountMap.set(s.form_id, (subCountMap.get(s.form_id) || 0) + 1);
        });
      }

      // Count views per form
      const viewCountMap = new Map<string, number>();
      if (viewCounts) {
        viewCounts.forEach((v: { form_id: string }) => {
          viewCountMap.set(v.form_id, (viewCountMap.get(v.form_id) || 0) + 1);
        });
      }

      // Merge counts into forms
      return (formsData || []).map((form) => ({
        ...form,
        submission_count: subCountMap.get(form.id) || 0,
        view_count: viewCountMap.get(form.id) || 0,
      })) as unknown as Form[];
    },
  });

  const createForm = useMutation({
    mutationFn: async (formData: { name: string; description?: string; created_by: string; created_by_name: string }) => {
      const { data, error } = await supabase
        .from("forms")
        .insert(formData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forms"] });
      toast({ title: "Form created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error creating form", description: error.message, variant: "destructive" });
    },
  });

  const updateForm = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Form> & { id: string }) => {
      const { error } = await supabase
        .from("forms")
        .update(updates)
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forms"] });
      toast({ title: "Form updated successfully" });
    },
    onError: (error) => {
      toast({ title: "Error updating form", description: error.message, variant: "destructive" });
    },
  });

  const deleteForm = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("forms")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forms"] });
      toast({ title: "Form deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error deleting form", description: error.message, variant: "destructive" });
    },
  });

  return {
    forms,
    isLoading,
    createForm: createForm.mutate,
    updateForm: updateForm.mutate,
    deleteForm: deleteForm.mutate,
    isCreating: createForm.isPending,
    isUpdating: updateForm.isPending,
    isDeleting: deleteForm.isPending,
  };
}

export function useFormFields(formId: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: fields = [], isLoading } = useQuery({
    queryKey: ["form_fields", formId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("form_fields")
        .select("*")
        .eq("form_id", formId)
        .order("field_order", { ascending: true });
      
      if (error) throw error;
      return data as FormField[];
    },
    enabled: !!formId,
  });

  const createField = useMutation({
    mutationFn: async (fieldData: Omit<FormField, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from("form_fields")
        .insert(fieldData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["form_fields", formId] });
      queryClient.invalidateQueries({ queryKey: ["forms"] });
    },
    onError: (error) => {
      toast({ title: "Error adding field", description: error.message, variant: "destructive" });
    },
  });

  const updateField = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<FormField> & { id: string }) => {
      const { error } = await supabase
        .from("form_fields")
        .update(updates)
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["form_fields", formId] });
      queryClient.invalidateQueries({ queryKey: ["forms"] });
    },
    onError: (error) => {
      toast({ title: "Error updating field", description: error.message, variant: "destructive" });
    },
  });

  const deleteField = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("form_fields")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["form_fields", formId] });
      queryClient.invalidateQueries({ queryKey: ["forms"] });
      toast({ title: "Field deleted" });
    },
    onError: (error) => {
      toast({ title: "Error deleting field", description: error.message, variant: "destructive" });
    },
  });

  return {
    fields,
    isLoading,
    createField: createField.mutate,
    updateField: updateField.mutate,
    deleteField: deleteField.mutate,
    isCreating: createField.isPending,
  };
}

export function useFormSubmissions(formId?: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: submissions = [], isLoading, refetch } = useQuery({
    queryKey: ["form_submissions", formId],
    queryFn: async () => {
      let query = supabase
        .from("form_submissions")
        .select("*")
        .order("submitted_at", { ascending: false });
      
      if (formId) {
        query = query.eq("form_id", formId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as FormSubmission[];
    },
    refetchOnWindowFocus: true,
  });

  const deleteSubmission = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("form_submissions")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["form_submissions"] });
      toast({ title: "Submission deleted" });
    },
    onError: (error) => {
      toast({ title: "Error deleting submission", description: error.message, variant: "destructive" });
    },
  });

  return {
    submissions,
    isLoading,
    refetch,
    deleteSubmission: deleteSubmission.mutate,
    isDeleting: deleteSubmission.isPending,
  };
}
