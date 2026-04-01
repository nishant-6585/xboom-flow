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

const EMBEDDABLE_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp"];
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

function isEmbeddableUrl(resource: TrainingResource): boolean {
  const url = resource.url_or_file_path;
  if (!url) return false;

  if (resource.resource_type === "youtube" || url.includes("youtube.com") || url.includes("youtu.be")) {
    return true;
  }

  if (resource.resource_type === "document" || resource.resource_type === "upload_video") {
    const ext = getFileExtension(url);
    return EMBEDDABLE_EXTENSIONS.includes(ext) || VIDEO_EXTENSIONS.includes(ext) || OFFICE_EXTENSIONS.includes(ext);
  }

  if (resource.resource_type === "link") {
    return true;
  }

  return false;
}

function isOfficeFile(url: string): boolean {
  const ext = getFileExtension(url);
  return OFFICE_EXTENSIONS.includes(ext);
}

function isVideoUrl(url: string): boolean {
  const ext = getFileExtension(url);
  return VIDEO_EXTENSIONS.includes(ext);
}

function getEmbedUrl(resource: TrainingResource): string | null {
  const url = resource.url_or_file_path;
  if (!url) return null;

  // YouTube embed
  if (resource.resource_type === "youtube" || url.includes("youtube.com") || url.includes("youtu.be")) {
    const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (match) return `https://www.youtube.com/embed/${match[1]}`;
  }

  // Office files via Microsoft Office Online Viewer
  if (isOfficeFile(url)) {
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
  }

  return url;
}

function getFileName(resource: TrainingResource): string {
  const url = resource.url_or_file_path;
  if (!url) return resource.title;
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split("/");
    const lastSegment = segments[segments.length - 1];
    // Remove the timestamp prefix (e.g., "1775019557027-slbv3.docx" → "slbv3.docx")
    const cleaned = lastSegment.replace(/^\d+-[a-z0-9]+\./, (match) => {
      const ext = match.substring(match.lastIndexOf("."));
      return `file${ext}`;
    });
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

export function ResourcePreviewDialog({ resource, open, onOpenChange, isViewed, isOwner, onMarkViewed }: Props) {
  const [marking, setMarking] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(true);

  if (!resource) return null;

  const embeddable = resource.resource_type !== "note" && isEmbeddableUrl(resource);
  const embedUrl = embeddable ? getEmbedUrl(resource) : null;
  const isVideo = resource.url_or_file_path ? isVideoUrl(resource.url_or_file_path) : false;
  const fileName = getFileName(resource);
  const isDownloadable = resource.url_or_file_path && resource.resource_type !== "note";

  const handleMarkViewed = async () => {
    setMarking(true);
    try {
      await onMarkViewed();
    } finally {
      setMarking(false);
    }
  };

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
                  onClick={() => handleDownload(resource.url_or_file_path!, fileName)}
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
          {resource.resource_type === "note" ? (
            <div className="p-4 bg-muted/50 rounded-md max-h-[60vh] overflow-y-auto">
              <p className="text-sm whitespace-pre-wrap">{resource.url_or_file_path}</p>
            </div>
          ) : embeddable && embedUrl ? (
            isVideo ? (
              <div className="w-full max-h-[60vh] bg-muted/30 rounded-md overflow-hidden flex items-center justify-center">
                <video
                  src={embedUrl}
                  controls
                  className="max-w-full max-h-[60vh] rounded-md"
                />
              </div>
            ) : (
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
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                />
              </div>
            )
          ) : (
            /* Non-embeddable file (docx, xlsx, pptx, etc.) - show download prompt */
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
              {resource.url_or_file_path && (
                <Button onClick={() => handleDownload(resource.url_or_file_path!, fileName)}>
                  <Download className="h-4 w-4 mr-2" />
                  Download File
                </Button>
              )}
            </div>
          )}
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
