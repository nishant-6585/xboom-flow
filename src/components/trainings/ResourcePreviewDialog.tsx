import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, Download, FileText, Link, Youtube, Video, MonitorPlay,
  Play, StickyNote, Loader2, FileDown
} from "lucide-react";
import { TrainingResource } from "@/hooks/useEmployeeTrainings";

const RESOURCE_ICONS: Record<string, React.ReactNode> = {
  youtube: <Youtube className="h-5 w-5 text-red-500" />,
  zoom: <MonitorPlay className="h-5 w-5 text-blue-500" />,
  gmeet: <Video className="h-5 w-5 text-green-500" />,
  upload_video: <Play className="h-5 w-5 text-purple-500" />,
  document: <FileText className="h-5 w-5 text-orange-500" />,
  link: <Link className="h-5 w-5 text-blue-400" />,
  note: <StickyNote className="h-5 w-5 text-yellow-500" />,
};

const PDF_EXTENSION = ".pdf";
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp"];
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogg"];
const OFFICE_EXTENSIONS = [".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt"];

interface Props {
  resource: TrainingResource | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isViewed: boolean;
  isOwner: boolean;
  onMarkViewed: () => Promise<void>;
}

function getFileExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.substring(pathname.lastIndexOf(".")).toLowerCase();
    return ext;
  } catch {
    return "";
  }
}

function getFileName(resource: TrainingResource): string {
  const url = resource.url_or_file_path;
  if (!url) return resource.title;
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split("/");
    const lastSegment = segments[segments.length - 1];
    return decodeURIComponent(lastSegment);
  } catch {
    return resource.title;
  }
}

function handleDownload(url: string, title: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = title;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

type ContentType = "youtube" | "pdf" | "image" | "video" | "office" | "link" | "note" | "download-only";

function getContentType(resource: TrainingResource): ContentType {
  if (resource.resource_type === "note") return "note";

  const url = resource.url_or_file_path;
  if (!url) return "download-only";

  // YouTube
  if (resource.resource_type === "youtube" || url.includes("youtube.com") || url.includes("youtu.be")) {
    return "youtube";
  }

  const ext = getFileExtension(url);

  if (ext === PDF_EXTENSION) return "pdf";
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (VIDEO_EXTENSIONS.includes(ext)) return "video";
  if (OFFICE_EXTENSIONS.includes(ext)) return "office";

  if (resource.resource_type === "link") return "link";

  return "download-only";
}

function getYoutubeEmbedUrl(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (match) return `https://www.youtube.com/embed/${match[1]}`;
  return null;
}

export function ResourcePreviewDialog({ resource, open, onOpenChange, isViewed, isOwner, onMarkViewed }: Props) {
  const [marking, setMarking] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(true);

  if (!resource) return null;

  const contentType = getContentType(resource);
  const fileName = getFileName(resource);
  const url = resource.url_or_file_path || "";
  const isDownloadable = url && resource.resource_type !== "note";

  const handleMarkViewed = async () => {
    setMarking(true);
    try {
      await onMarkViewed();
    } finally {
      setMarking(false);
    }
  };

  const renderContent = () => {
    switch (contentType) {
      case "note":
        return (
          <div className="p-4 bg-muted/50 rounded-md max-h-[60vh] overflow-y-auto">
            <p className="text-sm whitespace-pre-wrap">{url}</p>
          </div>
        );

      case "youtube": {
        const embedUrl = getYoutubeEmbedUrl(url);
        if (!embedUrl) return renderDownloadFallback();
        return (
          <div className="relative w-full h-[60vh] bg-muted/30 rounded-md overflow-hidden">
            {iframeLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
            <iframe
              src={embedUrl}
              className="w-full h-full border-0 rounded-md"
              onLoad={() => setIframeLoading(false)}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        );
      }

      case "pdf":
        // Use Google Docs viewer for reliable cross-origin PDF rendering
        return (
          <div className="relative w-full h-[60vh] bg-muted/30 rounded-md overflow-hidden">
            {iframeLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
            <iframe
              src={`https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`}
              className="w-full h-full border-0 rounded-md"
              onLoad={() => setIframeLoading(false)}
            />
          </div>
        );

      case "image":
        return (
          <div className="w-full max-h-[60vh] bg-muted/30 rounded-md overflow-hidden flex items-center justify-center p-4">
            <img
              src={url}
              alt={resource.title}
              className="max-w-full max-h-[55vh] object-contain rounded-md"
            />
          </div>
        );

      case "video":
        return (
          <div className="w-full max-h-[60vh] bg-muted/30 rounded-md overflow-hidden flex items-center justify-center">
            <video
              src={url}
              controls
              className="max-w-full max-h-[60vh] rounded-md"
            />
          </div>
        );

      case "office":
        // Use Microsoft Office Online Viewer — no sandbox restrictions
        return (
          <div className="relative w-full h-[60vh] bg-muted/30 rounded-md overflow-hidden">
            {iframeLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
            <iframe
              src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`}
              className="w-full h-full border-0 rounded-md"
              onLoad={() => setIframeLoading(false)}
            />
          </div>
        );

      case "link":
        return (
          <div className="relative w-full h-[60vh] bg-muted/30 rounded-md overflow-hidden">
            {iframeLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
            <iframe
              src={url}
              className="w-full h-full border-0 rounded-md"
              onLoad={() => setIframeLoading(false)}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        );

      default:
        return renderDownloadFallback();
    }
  };

  const renderDownloadFallback = () => (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
        <FileDown className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-medium">{fileName}</p>
        <p className="text-xs text-muted-foreground">
          This file type cannot be previewed. Please download to view.
        </p>
      </div>
      {url && (
        <Button onClick={() => handleDownload(url, fileName)}>
          <Download className="h-4 w-4 mr-2" />
          Download File
        </Button>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4 pr-6">
            <div className="flex items-center gap-2 min-w-0">
              {RESOURCE_ICONS[resource.resource_type] || <Link className="h-5 w-5" />}
              <DialogTitle className="truncate">{resource.title}</DialogTitle>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isViewed && (
                <Badge variant="default" className="bg-green-600 hover:bg-green-600 gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Viewed
                </Badge>
              )}
              {isDownloadable && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload(url, fileName)}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Content area */}
        <div className="flex-1 min-h-0 relative">
          {renderContent()}
        </div>

        {/* Mark as viewed action - only for owner who hasn't viewed yet */}
        {isOwner && !isViewed && (
          <div className="pt-3 border-t">
            <Button onClick={handleMarkViewed} disabled={marking} className="w-full">
              {marking ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Mark as Completed
            </Button>
          </div>
        )}

        {resource.description && (
          <p className="text-xs text-muted-foreground">{resource.description}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
