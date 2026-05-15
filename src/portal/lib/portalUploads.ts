import { supabase } from "@/integrations/supabase/client";

export interface UploadedAttachment {
  name: string;
  path: string;
  size: number;
}

/**
 * Uploads a file into the private "portal-attachments" bucket under the
 * authenticated customer's account folder. RLS ensures only that account
 * (and internal staff) can read it back.
 */
export async function uploadPortalAttachment(
  accountId: string,
  scope: "rfq" | "ticket",
  file: File,
): Promise<UploadedAttachment> {
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${accountId}/${scope}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from("portal-attachments").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  return { name: file.name, path, size: file.size };
}

export async function signedAttachmentUrl(path: string, expiresInSeconds = 600) {
  const { data, error } = await supabase.storage
    .from("portal-attachments")
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}