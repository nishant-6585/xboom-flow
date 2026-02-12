import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink } from "lucide-react";

interface DocumentViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string | null;
  name: string;
}

export function DocumentViewer({ open, onOpenChange, url, name }: DocumentViewerProps) {
  if (!url) return null;

  const isPDF = name.toLowerCase().endsWith(".pdf");
  const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(name);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2 flex-row items-center justify-between gap-4">
          <DialogTitle className="truncate flex-1">{name}</DialogTitle>
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
            <iframe
              src={url + "#toolbar=1&navpanes=0"}
              className="w-full h-full rounded-md border"
              title={name}
            />
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
