import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "./useAuth";

export type CandidateStatus = "applied" | "shortlisted" | "rejected" | "hired" | "blacklisted";
export type InterviewDecision = "pass" | "reject" | "hold";

export interface Candidate {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  years_of_experience?: number;
  current_company?: string;
  current_ctc?: number;
  expected_ctc?: number;
  notice_period_days?: number;
  location?: string;
  primary_skills?: string[];
  source?: string;
  status: CandidateStatus;
  notes?: string;
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
  rating?: number;
  feedback?: string;
  decision: InterviewDecision;
  interview_date: string;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
}

export interface CandidateFilters {
  search?: string;
  status?: CandidateStatus | "all";
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
            c.location?.toLowerCase().includes(s)
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
    onError: (err: any) => toast.error(err.message || "Failed to update candidate"),
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
