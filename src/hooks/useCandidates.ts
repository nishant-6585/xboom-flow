import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "./useAuth";

export type CandidateStatus = "applied" | "shortlisted" | "rejected" | "hired" | "blacklisted";
export type LifecycleStatus = "NEW" | "SCREENING" | "INTERVIEW" | "SELECTED" | "OFFERED" | "JOINED" | "REJECTED" | "DROPPED" | "ON_HOLD";
export type InterviewDecision = "pass" | "reject" | "hold";
export type ApplicationSource = "Referral" | "Naukri" | "LinkedIn" | "Website" | "Consultant" | "Walk-in" | "Other";
export type EmploymentType = "Full-time" | "Contract" | "Intern";
export type ScreeningStatus = "New" | "Shortlisted" | "Rejected" | "On Hold";
export type InterviewStage = "HR" | "Technical" | "Managerial" | "Final";
export type FinalStatus = "Selected" | "Rejected";

// Lifecycle transition map: current status → allowed next statuses
export const LIFECYCLE_TRANSITIONS: Record<LifecycleStatus, LifecycleStatus[]> = {
  NEW: ["SCREENING", "REJECTED"],
  SCREENING: ["INTERVIEW", "ON_HOLD", "REJECTED"],
  INTERVIEW: ["SELECTED", "ON_HOLD", "REJECTED"],
  SELECTED: ["OFFERED", "REJECTED"],
  OFFERED: ["JOINED", "DROPPED"],
  ON_HOLD: ["SCREENING", "INTERVIEW", "REJECTED"],
  JOINED: [],
  REJECTED: [],
  DROPPED: [],
};

export const LIFECYCLE_LABELS: Record<LifecycleStatus, string> = {
  NEW: "New",
  SCREENING: "Screening",
  INTERVIEW: "Interview",
  SELECTED: "Selected",
  OFFERED: "Offered",
  JOINED: "Joined",
  REJECTED: "Rejected",
  DROPPED: "Dropped",
  ON_HOLD: "On Hold",
};

export const FINAL_LIFECYCLE_STATES: LifecycleStatus[] = ["JOINED", "REJECTED", "DROPPED"];

export interface Candidate {
  id: string;
  candidate_number?: string;
  full_name: string;
  email: string;
  phone?: string;
  years_of_experience?: number;
  relevant_experience_years?: number;
  current_company?: string;
  current_designation?: string;
  current_ctc?: number;
  expected_ctc?: number;
  notice_period_days?: number;
  location?: string;
  location_city?: string;
  location_state?: string;
  primary_skills?: string[];
  source?: string;
  application_source?: ApplicationSource;
  employment_type?: EmploymentType;
  job_role_applied?: string;
  department?: string;
  recruiter_id?: string;
  recruiter_name?: string;
  screening_status?: ScreeningStatus;
  interview_stage?: InterviewStage;
  final_status?: FinalStatus;
  offer_letter_issued?: boolean;
  joining_date?: string;
  rejection_reason?: string;
  follow_up_date?: string;
  remarks?: string;
  status: CandidateStatus;
  lifecycle_status: LifecycleStatus;
  notes?: string;
  resume_url?: string;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface CandidateDocument {
  id: string;
  candidate_id: string;
  file_url: string;
  file_name: string;
  file_size?: number;
  uploaded_by?: string;
  uploaded_at: string;
}

export interface InterviewRecord {
  id: string;
  candidate_id: string;
  round_type: string;
  interviewer_name: string;
  interviewer_id?: string;
  rating?: number;
  feedback?: string;
  decision: InterviewDecision;
  result?: string;
  interview_date: string;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
}

export interface CandidateFilters {
  search?: string;
  status?: CandidateStatus | "all";
  screeningStatus?: ScreeningStatus | "all";
  department?: string;
  interviewStage?: InterviewStage | "all";
  minExperience?: number;
  maxExperience?: number;
  skills?: string[];
}

export function useCandidates(filters?: CandidateFilters) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["candidates", filters],
    queryFn: async () => {
      let query = supabase
        .from("candidates")
        .select("*")
        .order("created_at", { ascending: false });

      if (filters?.status && filters.status !== "all") {
        query = query.eq("status", filters.status);
      }
      if (filters?.screeningStatus && filters.screeningStatus !== "all") {
        query = query.eq("screening_status", filters.screeningStatus);
      }
      if (filters?.department) {
        query = query.eq("department", filters.department);
      }
      if (filters?.interviewStage && filters.interviewStage !== "all") {
        query = query.eq("interview_stage", filters.interviewStage);
      }
      if (filters?.minExperience !== undefined) {
        query = query.gte("years_of_experience", filters.minExperience);
      }
      if (filters?.maxExperience !== undefined) {
        query = query.lte("years_of_experience", filters.maxExperience);
      }
      if (filters?.skills && filters.skills.length > 0) {
        query = query.overlaps("primary_skills", filters.skills);
      }

      const { data, error } = await query;
      if (error) throw error;

      let results = (data || []) as Candidate[];

      if (filters?.search) {
        const s = filters.search.toLowerCase();
        results = results.filter(
          (c) =>
            c.full_name.toLowerCase().includes(s) ||
            c.email.toLowerCase().includes(s) ||
            c.current_company?.toLowerCase().includes(s) ||
            c.location_city?.toLowerCase().includes(s) ||
            c.location?.toLowerCase().includes(s) ||
            c.candidate_number?.toLowerCase().includes(s) ||
            c.job_role_applied?.toLowerCase().includes(s) ||
            c.recruiter_name?.toLowerCase().includes(s)
        );
      }

      return results;
    },
  });

  return { candidates: data || [], isLoading, error };
}

export function useCandidate(id: string) {
  return useQuery({
    queryKey: ["candidate", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Candidate;
    },
    enabled: !!id,
  });
}

export function useCandidateDocuments(candidateId: string) {
  return useQuery({
    queryKey: ["candidate-documents", candidateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidate_documents")
        .select("*")
        .eq("candidate_id", candidateId)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data as CandidateDocument[];
    },
    enabled: !!candidateId,
  });
}

export function useInterviewRecords(candidateId: string) {
  return useQuery({
    queryKey: ["interview-records", candidateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interview_records")
        .select("*")
        .eq("candidate_id", candidateId)
        .order("interview_date", { ascending: false });
      if (error) throw error;
      return data as InterviewRecord[];
    },
    enabled: !!candidateId,
  });
}

export function useCandidateMutations() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const createCandidate = useMutation({
    mutationFn: async (data: Omit<Candidate, "id" | "created_at" | "updated_at">) => {
      const { data: result, error } = await supabase
        .from("candidates")
        .insert({ ...data, created_by: profile?.user_id, created_by_name: profile?.name })
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      toast.success("Candidate added successfully");
    },
    onError: (err: any) => {
      if (err.code === "23505") {
        toast.error("A candidate with this email already exists");
      } else {
        toast.error(err.message || "Failed to create candidate");
      }
    },
  });

  const updateCandidate = useMutation({
    mutationFn: async ({ id, ...data }: Partial<Candidate> & { id: string }) => {
      const { error } = await supabase.from("candidates").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["candidate", vars.id] });
      toast.success("Candidate updated");
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to update candidate";
      if (msg.includes("Invalid status transition")) {
        toast.error("Invalid status transition. This change is not allowed.");
      } else {
        toast.error(msg);
      }
    },
  });

  const deleteCandidate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("candidates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      toast.success("Candidate removed");
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete candidate"),
  });

  const uploadCV = useMutation({
    mutationFn: async ({ candidateId, file }: { candidateId: string; file: File }) => {
      const { validateFile } = await import('@/lib/fileValidation');
      const validation = validateFile(file, 'cvs');
      if (!validation.valid) throw new Error(validation.error);
      const ext = file.name.split(".").pop();
      const path = `${candidateId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("candidate-cvs")
        .upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("candidate-cvs").getPublicUrl(path);

      const { error: dbError } = await supabase.from("candidate_documents").insert({
        candidate_id: candidateId,
        file_url: path,
        file_name: file.name,
        file_size: file.size,
        uploaded_by: profile?.user_id,
      });
      if (dbError) throw dbError;
      return path;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["candidate-documents", vars.candidateId] });
      toast.success("CV uploaded successfully");
    },
    onError: (err: any) => toast.error(err.message || "Failed to upload CV"),
  });

  const deleteDocument = useMutation({
    mutationFn: async ({ docId, fileUrl, candidateId }: { docId: string; fileUrl: string; candidateId: string }) => {
      await supabase.storage.from("candidate-cvs").remove([fileUrl]);
      const { error } = await supabase.from("candidate_documents").delete().eq("id", docId);
      if (error) throw error;
      return candidateId;
    },
    onSuccess: (candidateId) => {
      queryClient.invalidateQueries({ queryKey: ["candidate-documents", candidateId] });
      toast.success("Document removed");
    },
    onError: (err: any) => toast.error(err.message || "Failed to remove document"),
  });

  const addInterviewRecord = useMutation({
    mutationFn: async (data: Omit<InterviewRecord, "id" | "created_at">) => {
      const { error } = await supabase.from("interview_records").insert({
        ...data,
        created_by: profile?.user_id,
        created_by_name: profile?.name,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["interview-records", vars.candidate_id] });
      toast.success("Interview record added");
    },
    onError: (err: any) => toast.error(err.message || "Failed to add interview record"),
  });

  const deleteInterviewRecord = useMutation({
    mutationFn: async ({ id, candidateId }: { id: string; candidateId: string }) => {
      const { error } = await supabase.from("interview_records").delete().eq("id", id);
      if (error) throw error;
      return candidateId;
    },
    onSuccess: (candidateId) => {
      queryClient.invalidateQueries({ queryKey: ["interview-records", candidateId] });
      toast.success("Record deleted");
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete record"),
  });

  return {
    createCandidate,
    updateCandidate,
    deleteCandidate,
    uploadCV,
    deleteDocument,
    addInterviewRecord,
    deleteInterviewRecord,
  };
}

export function useSignedCVUrl() {
  const [loading, setLoading] = useState(false);

  const getSignedUrl = async (path: string): Promise<string | null> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from("candidate-cvs")
        .createSignedUrl(path, 3600);
      if (error) throw error;
      return data.signedUrl;
    } catch (e) {
      toast.error("Failed to generate download link");
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { getSignedUrl, loading };
}
