import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip, X, Loader2 } from "lucide-react";
import { uploadPortalAttachment, type UploadedAttachment } from "@/portal/lib/portalUploads";
import { usePortalAuth } from "@/portal/hooks/usePortalAuth";
import { useToast } from "@/hooks/use-toast";

const MAX_BYTES = 15 * 1024 * 1024; // 15MB

interface Props {
  scope: "rfq" | "ticket";
  attachments: UploadedAttachment[];
  onChange: (next: UploadedAttachment[]) => void;
  disabled?: boolean;
}

export function AttachmentUploader({ scope, attachments, onChange, disabled }: Props) {
  const { account } = usePortalAuth();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || !account?.id) return;
    setBusy(true);
    try {
      const next: UploadedAttachment[] = [...attachments];
      for (const f of Array.from(files)) {
        if (f.size > MAX_BYTES) {
          toast({ title: "File too large", description: `${f.name} is over 15MB.`, variant: "destructive" });
          continue;
        }
        const uploaded = await uploadPortalAttachment(account.id, scope, f);
        next.push(uploaded);
      }
      onChange(next);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
        disabled={disabled || busy}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Paperclip className="h-3.5 w-3.5 mr-2" />}
        Attach files
      </Button>
      {attachments.length > 0 && (
        <ul className="space-y-1">
          {attachments.map((a, idx) => (
            <li key={a.path} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1.5">
              <span className="truncate flex-1">{a.name}</span>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground ml-2"
                onClick={() => onChange(attachments.filter((_, i) => i !== idx))}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">Up to 15MB per file. PDF, images, Office docs.</p>
    </div>
  );
}