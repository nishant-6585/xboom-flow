import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

export interface TrainingAssignment {
  id: string;
  training_id: string;
  employee_id: string;
  training_title: string;
  description: string | null;
  assigned_by: string;
  assigned_by_name: string;
  assigned_date: string;
  due_date: string;
  priority: "low" | "medium" | "high";
  status: "assigned" | "in_progress" | "completed" | "overdue";
  completed_at: string | null;
  last_accessed: string | null;
  progress_percentage: number;
  created_at: string;
  updated_at: string;
  // Joined
  employee_name?: string;
  employee_department?: string;
  resources?: TrainingResource[];
  tracking?: TrainingResourceTracking[];
}

export interface GroupedTraining {
  key: string;
  training_id: string;
  training_title: string;
  description: string | null;
  assigned_by_name: string;
  due_date: string;
  priority: "low" | "medium" | "high";
  created_at: string;
  assignments: TrainingAssignment[];
  // Aggregated
  total_employees: number;
  overall_progress: number;
  completed_count: number;
  in_progress_count: number;
  assigned_count: number;
  overdue_count: number;
  grouped_status: "completed" | "in_progress" | "assigned" | "overdue";
  teams: string[];
}

export interface TrainingResource {
  id: string;
  training_assignment_id: string;
  resource_type: "youtube" | "zoom" | "gmeet" | "upload_video" | "document" | "link" | "note";
  title: string;
  url_or_file_path: string | null;
  description: string | null;
  thumbnail_url: string | null;
  resource_order: number;
  created_at: string;
}

export interface MasterTrainingResource {
  id: string;
  training_id: string;
  resource_type: "youtube" | "zoom" | "gmeet" | "upload_video" | "document" | "link" | "note";
  title: string;
  url_or_file_path: string | null;
  description: string | null;
  thumbnail_url: string | null;
  resource_order: number;
  created_at: string;
}

export interface TrainingResourceTracking {
  id: string;
  training_assignment_id: string;
  resource_id: string;
  employee_id: string;
  is_viewed: boolean;
  viewed_at: string | null;
}

export interface AssignTrainingData {
  employee_id: string;
  training_title: string;
  description?: string;
  due_date: string;
  priority: "low" | "medium" | "high";
  resources: {
    resource_type: TrainingResource["resource_type"];
    title: string;
    url_or_file_path?: string;
    description?: string;
  }[];
}

export function useEmployeeTrainings() {
  const [assignments, setAssignments] = useState<TrainingAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user, role, roles } = useAuth();

  const isHrOrAdmin = roles.includes("hr") || roles.includes("admin");

  const fetchAssignments = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("training_assignments")
        .select("*, employees!training_assignments_employee_id_fkey(name, department)")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const transformed = (data || []).map((a: any) => ({
        ...a,
        employee_name: a.employees?.name,
        employee_department: a.employees?.department,
      }));

      setAssignments(transformed);
    } catch (error: any) {
      console.error("Error fetching training assignments:", error);
      toast({ title: "Error", description: "Failed to load training assignments", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssignments();

    const channel = supabase
      .channel("training-assignments-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "training_assignments" }, () => fetchAssignments())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchAssignments]);

  // Find or create a master training, then create assignment
  const assignTraining = async (data: AssignTrainingData, userId: string, userName: string) => {
    try {
      // Check if a master training with this title already exists
      let trainingId: string;

      const { data: existing } = await supabase
        .from("employee_trainings")
        .select("id")
        .eq("title", data.training_title)
        .limit(1)
        .maybeSingle();

      if (existing) {
        trainingId = existing.id;
      } else {
        // Create new master training
        const { data: newTraining, error: tErr } = await supabase
          .from("employee_trainings")
          .insert({
            title: data.training_title,
            description: data.description || null,
            priority: data.priority,
            created_by: userId,
            created_by_name: userName,
          })
          .select()
          .single();

        if (tErr) throw tErr;
        trainingId = newTraining.id;

        // Insert master resources
        if (data.resources.length > 0) {
          const masterResRows = data.resources.map((r, i) => ({
            training_id: trainingId,
            resource_type: r.resource_type,
            title: r.title || `Resource ${i + 1}`,
            url_or_file_path: r.url_or_file_path || null,
            description: r.description || null,
            resource_order: i,
          }));

          await supabase.from("employee_training_resources").insert(masterResRows);
        }
      }

      // Create assignment linked to master training
      const { data: assignment, error } = await supabase
        .from("training_assignments")
        .insert({
          training_id: trainingId,
          employee_id: data.employee_id,
          training_title: data.training_title,
          description: data.description || null,
          due_date: data.due_date,
          priority: data.priority,
          assigned_by: userId,
          assigned_by_name: userName,
          status: "assigned",
          progress_percentage: 0,
        })
        .select()
        .single();

      if (error) throw error;

      // Get master resources and duplicate for this assignment (for per-employee tracking)
      const { data: masterResources } = await supabase
        .from("employee_training_resources")
        .select("*")
        .eq("training_id", trainingId)
        .order("resource_order");

      if (masterResources && masterResources.length > 0) {
        const resourceRows = masterResources.map((r: any) => ({
          training_assignment_id: assignment.id,
          resource_type: r.resource_type,
          title: r.title,
          url_or_file_path: r.url_or_file_path,
          description: r.description,
          resource_order: r.resource_order,
        }));

        await supabase.from("training_resources").insert(resourceRows);
      }

      toast({ title: "Success", description: "Training assigned successfully" });
      await fetchAssignments();
      return assignment;
    } catch (error: any) {
      console.error("Error assigning training:", error);
      toast({ title: "Error", description: error.message || "Failed to assign training", variant: "destructive" });
      throw error;
    }
  };

  const fetchAssignmentDetails = async (assignmentId: string) => {
    const [resourcesRes, trackingRes] = await Promise.all([
      supabase.from("training_resources").select("*").eq("training_assignment_id", assignmentId).order("resource_order"),
      supabase.from("training_resource_tracking").select("*").eq("training_assignment_id", assignmentId),
    ]);

    return {
      resources: (resourcesRes.data || []) as TrainingResource[],
      tracking: (trackingRes.data || []) as TrainingResourceTracking[],
    };
  };

  const markResourceViewed = async (assignmentId: string, resourceId: string, employeeId: string) => {
    try {
      const { error } = await supabase
        .from("training_resource_tracking")
        .upsert({
          training_assignment_id: assignmentId,
          resource_id: resourceId,
          employee_id: employeeId,
          is_viewed: true,
          viewed_at: new Date().toISOString(),
        }, { onConflict: "resource_id,employee_id" });

      if (error) throw error;

      // Recalculate progress
      const { data: resources } = await supabase
        .from("training_resources")
        .select("id")
        .eq("training_assignment_id", assignmentId);

      const { data: viewed } = await supabase
        .from("training_resource_tracking")
        .select("id")
        .eq("training_assignment_id", assignmentId)
        .eq("employee_id", employeeId)
        .eq("is_viewed", true);

      const totalResources = resources?.length || 1;
      const viewedCount = viewed?.length || 0;
      const progress = Math.round((viewedCount / totalResources) * 100);

      const updateData: any = {
        progress_percentage: progress,
        last_accessed: new Date().toISOString(),
      };

      // Auto-derive status from progress
      if (progress === 100) {
        updateData.status = "completed";
        updateData.completed_at = new Date().toISOString();
      } else if (progress > 0) {
        updateData.status = "in_progress";
      }

      await supabase
        .from("training_assignments")
        .update(updateData)
        .eq("id", assignmentId);

    } catch (error: any) {
      console.error("Error marking resource viewed:", error);
    }
  };

  const markCompleted = async (assignmentId: string) => {
    try {
      const { error } = await supabase
        .from("training_assignments")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          progress_percentage: 100,
        })
        .eq("id", assignmentId);

      if (error) throw error;
      toast({ title: "Success", description: "Training marked as completed" });
    } catch (error: any) {
      toast({ title: "Error", description: "Failed to mark as completed", variant: "destructive" });
    }
  };

  const addEmployeesToTraining = async (trainingId: string, employeeIds: string[], dueDate: string) => {
    try {
      // Get master training info
      const { data: training } = await supabase
        .from("employee_trainings")
        .select("*")
        .eq("id", trainingId)
        .single();

      if (!training) throw new Error("Training not found");

      // Get already assigned employee IDs to prevent duplicates
      const { data: existing } = await supabase
        .from("training_assignments")
        .select("employee_id")
        .eq("training_id", trainingId);

      const existingSet = new Set((existing || []).map(e => e.employee_id));
      const newIds = employeeIds.filter(id => !existingSet.has(id));

      if (newIds.length === 0) {
        toast({ title: "Info", description: "All selected employees are already assigned" });
        return;
      }

      // Get master resources
      const { data: masterResources } = await supabase
        .from("employee_training_resources")
        .select("*")
        .eq("training_id", trainingId)
        .order("resource_order");

      const userName = user?.user_metadata?.name || user?.email || "Unknown";

      for (const empId of newIds) {
        const { data: assignment, error } = await supabase
          .from("training_assignments")
          .insert({
            training_id: trainingId,
            employee_id: empId,
            training_title: training.title,
            description: training.description || null,
            due_date: dueDate,
            priority: training.priority,
            assigned_by: user!.id,
            assigned_by_name: userName,
            status: "assigned",
            progress_percentage: 0,
          })
          .select()
          .single();

        if (error) throw error;

        // Duplicate resources for per-employee tracking
        if (masterResources && masterResources.length > 0 && assignment) {
          const resourceRows = masterResources.map((r: any) => ({
            training_assignment_id: assignment.id,
            resource_type: r.resource_type,
            title: r.title,
            url_or_file_path: r.url_or_file_path,
            description: r.description,
            resource_order: r.resource_order,
          }));

          await supabase.from("training_resources").insert(resourceRows);
        }
      }

      toast({
        title: "Success",
        description: `Training assigned to ${newIds.length} new employee${newIds.length > 1 ? "s" : ""}`,
      });

      // Force immediate refetch to update UI
      await fetchAssignments();
    } catch (error: any) {
      console.error("Error adding employees to training:", error);
      toast({ title: "Error", description: error.message || "Failed to add employees", variant: "destructive" });
      throw error;
    }
  };

  const deleteAssignment = async (assignmentId: string) => {
    try {
      const assignment = assignments.find(a => a.id === assignmentId);

      const { error } = await supabase
        .from("training_assignments")
        .delete()
        .eq("id", assignmentId);

      if (error) throw error;

      if (user) {
        await supabase.from("security_audit_log").insert({
          user_id: user.id,
          user_name: user.user_metadata?.name || user.email || "Unknown",
          action: "training_assignment_deleted",
          details: {
            assignment_id: assignmentId,
            training_title: assignment?.training_title || "Unknown",
            employee_name: assignment?.employee_name || "Unknown",
            employee_id: assignment?.employee_id || "Unknown",
          },
          user_agent: navigator.userAgent,
        });
      }

      toast({ title: "Success", description: "Training assignment deleted" });
    } catch (error: any) {
      toast({ title: "Error", description: "Failed to delete assignment", variant: "destructive" });
    }
  };

  const uploadTrainingFile = async (file: File, assignmentId: string): Promise<string | null> => {
    const { validateFile } = await import("@/lib/fileValidation");
    const validation = validateFile(file, "documents");
    if (!validation.valid) {
      toast({ title: "Error", description: validation.error, variant: "destructive" });
      return null;
    }

    const ext = file.name.split(".").pop();
    const fileName = `${assignmentId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

    const { error } = await supabase.storage
      .from("training-uploads")
      .upload(fileName, file);

    if (error) {
      toast({ title: "Error", description: "File upload failed", variant: "destructive" });
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from("training-uploads")
      .getPublicUrl(fileName);

    return publicUrl;
  };

  // Group by training_id (master training) — each training appears ONCE
  const groupedTrainings = useMemo((): GroupedTraining[] => {
    const groupMap = new Map<string, TrainingAssignment[]>();
    assignments.forEach(a => {
      const key = a.training_id;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(a);
    });

    return Array.from(groupMap.entries()).map(([trainingId, group]) => {
      const first = group[0];
      const now = new Date();

      // Derive status from progress_percentage, not just status field
      const completedCount = group.filter(a => a.progress_percentage >= 100 || a.status === "completed").length;
      const overdueCount = group.filter(a => a.progress_percentage < 100 && a.status !== "completed" && new Date(a.due_date) < now).length;
      const inProgressCount = group.filter(a => a.progress_percentage > 0 && a.progress_percentage < 100 && a.status !== "completed").length;
      const assignedCount = group.filter(a => a.progress_percentage === 0 && a.status !== "completed" && new Date(a.due_date) >= now).length;
      const avgProgress = group.reduce((sum, a) => sum + Number(a.progress_percentage), 0) / group.length;
      const teams = [...new Set(group.map(a => a.employee_department).filter(Boolean))] as string[];

      let groupedStatus: GroupedTraining["grouped_status"] = "assigned";
      if (completedCount === group.length) groupedStatus = "completed";
      else if (overdueCount > 0) groupedStatus = "overdue";
      else if (inProgressCount > 0 || completedCount > 0) groupedStatus = "in_progress";

      return {
        key: trainingId,
        training_id: trainingId,
        training_title: first.training_title,
        description: first.description,
        assigned_by_name: first.assigned_by_name,
        due_date: first.due_date,
        priority: first.priority,
        created_at: first.created_at,
        assignments: group,
        total_employees: group.length,
        overall_progress: Math.round(avgProgress),
        completed_count: completedCount,
        in_progress_count: inProgressCount,
        assigned_count: assignedCount,
        overdue_count: overdueCount,
        grouped_status: groupedStatus,
        teams,
      };
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [assignments]);

  return {
    assignments,
    groupedTrainings,
    loading,
    isHrOrAdmin,
    assignTraining,
    addEmployeesToTraining,
    fetchAssignmentDetails,
    markResourceViewed,
    markCompleted,
    deleteAssignment,
    uploadTrainingFile,
    refetch: fetchAssignments,
  };
}
