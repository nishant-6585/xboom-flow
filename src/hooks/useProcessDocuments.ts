import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const BUCKET = "hr-process-docs";

export interface ProcessDocument {
  id: string;
  title: string;
  description: string | null;
  category: string;
  file_path: string;
  file_name: string;
  file_size: number;
  mime_type: string | null;
  version: number;
  is_active: boolean;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UploadProcessDocInput {
  title: string;
  description?: string;
  category: string;
  file: File;
}

function sanitizeName(name: string) {
  return name.replace(/[^\w.\-]+/g, "_");
}

export function useProcessDocuments() {
  const [documents, setDocuments] = useState<ProcessDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("hr_process_documents")
      .select("*")
      .order("category", { ascending: true })
      .order("title", { ascending: true });
    if (error) {
      toast.error("Failed to load process documents", { description: error.message });
      setDocuments([]);
    } else {
      setDocuments((data || []) as ProcessDocument[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const upload = useCallback(
    async ({ title, description, category, file }: UploadProcessDocInput) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id ?? null;
      const safe = sanitizeName(file.name);
      const safeCat = (category || "General").replace(/[^\w\-]+/g, "_");
      const path = `${safeCat}/${crypto.randomUUID()}-${safe}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from("hr_process_documents").insert({
        title: title.trim(),
        description: description?.trim() || null,
        category: category || "General",
        file_path: path,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || null,
        version: 1,
        is_active: true,
        uploaded_by: userId,
      });
      if (insErr) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw insErr;
      }
      await refresh();
    },
    [refresh]
  );

  const replaceFile = useCallback(
    async (doc: ProcessDocument, file: File) => {
      const safe = sanitizeName(file.name);
      const safeCat = (doc.category || "General").replace(/[^\w\-]+/g, "_");
      const path = `${safeCat}/${crypto.randomUUID()}-${safe}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (upErr) throw upErr;

      const { error: updErr } = await supabase
        .from("hr_process_documents")
        .update({
          file_path: path,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || null,
          version: doc.version + 1,
        })
        .eq("id", doc.id);
      if (updErr) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw updErr;
      }
      // Best-effort cleanup of previous file
      if (doc.file_path) {
        await supabase.storage.from(BUCKET).remove([doc.file_path]);
      }
      await refresh();
    },
    [refresh]
  );

  const updateMetadata = useCallback(
    async (id: string, patch: Partial<Pick<ProcessDocument, "title" | "description" | "category" | "is_active">>) => {
      const { error } = await supabase.from("hr_process_documents").update(patch).eq("id", id);
      if (error) throw error;
      await refresh();
    },
    [refresh]
  );

  const remove = useCallback(
    async (doc: ProcessDocument) => {
      const { error } = await supabase.from("hr_process_documents").delete().eq("id", doc.id);
      if (error) throw error;
      if (doc.file_path) {
        await supabase.storage.from(BUCKET).remove([doc.file_path]);
      }
      await refresh();
    },
    [refresh]
  );

  const getSignedUrl = useCallback(async (path: string) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
    if (error) throw error;
    return data.signedUrl;
  }, []);

  return { documents, loading, refresh, upload, replaceFile, updateMetadata, remove, getSignedUrl };
}