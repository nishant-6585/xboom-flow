import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink } from "lucide-react";

interface DocumentViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string | null;
  name: string;
  fileType?: string | null;
}

export function DocumentViewer({ open, onOpenChange, url, name, fileType }: DocumentViewerProps) {
  if (!url) return null;

  // Check by explicit fileType (stored extension without dot) OR by name extension
  const ext = fileType ? fileType.toLowerCase() : name.split(".").pop()?.toLowerCase() ?? "";
  const isPDF = ext === "pdf";
  const isDocx = ["doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext);
  const isImage = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2 flex-row items-center justify-between gap-4">
          <div>
            <DialogTitle className="truncate flex-1">{name}</DialogTitle>
            <DialogDescription className="sr-only">Preview of {name}</DialogDescription>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 mr-8">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(url, "_blank")}
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              Open
            </Button>
            <a href={url} download={name}>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-1" />
                Download
              </Button>
            </a>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-hidden px-2 pb-2">
          {isPDF ? (
            // Render PDFs natively. Browsers (Chrome/Edge/Firefox) display PDFs
            // inline, including blob: URLs. Avoid Google Docs viewer because it
            // can't fetch blob URLs and fails on signed Supabase URLs too.
            <iframe
              src={url}
              className="w-full h-full rounded-md border"
              title={name}
            />
          ) : isDocx ? (
            // Office docs can't be rendered natively. Use Google Docs viewer
            // only for http(s) URLs (it cannot fetch blob: URLs).
            url.startsWith('blob:') ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-muted/30 rounded-md">
                <p className="text-muted-foreground text-center mb-4">
                  Preview not available for Office documents. Please download to view.
                </p>
                <a href={url} download={name}>
                  <Button>
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>
                </a>
              </div>
            ) : (
              <iframe
                src={`https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`}
                className="w-full h-full rounded-md border"
                title={name}
                sandbox="allow-scripts allow-same-origin allow-popups"
              />
            )
          ) : isImage ? (
            <div className="w-full h-full flex items-center justify-center bg-muted/30 rounded-md overflow-auto">
              <img
                src={url}
                alt={name}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-muted/30 rounded-md">
              <p className="text-muted-foreground text-center mb-4">
                Preview not available for this file type.
              </p>
              <div className="flex gap-2">
                <Button onClick={() => window.open(url, "_blank")}>
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Open in New Tab
                </Button>
                <a href={url} download={name}>
                  <Button variant="outline">
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>
                </a>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
