import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, ExternalLink, FileText, Link, Youtube, Video, MonitorPlay,
  Play, StickyNote, Loader2
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

interface Props {
  resource: TrainingResource | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isViewed: boolean;
  isOwner: boolean;
  onMarkViewed: () => Promise<void>;
}

function getEmbedUrl(resource: TrainingResource): string | null {
  const url = resource.url_or_file_path;
  if (!url) return null;

  // YouTube embed
  if (resource.resource_type === "youtube" || url.includes("youtube.com") || url.includes("youtu.be")) {
    const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (match) return `https://www.youtube.com/embed/${match[1]}`;
  }

  // For documents (PDF), use direct URL in iframe
  if (resource.resource_type === "document" && url) {
    return url;
  }

  // For links, embed directly
  if (resource.resource_type === "link") {
    return url;
  }

  return url;
}

function canEmbed(resource: TrainingResource): boolean {
  if (resource.resource_type === "note") return false;
  if (resource.resource_type === "youtube") return true;
  if (resource.resource_type === "document") return true;
  if (resource.resource_type === "link") return true;
  if (resource.resource_type === "upload_video") return true;
  return false;
}

export function ResourcePreviewDialog({ resource, open, onOpenChange, isViewed, isOwner, onMarkViewed }: Props) {
  const [marking, setMarking] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(true);

  if (!resource) return null;

  const embedUrl = getEmbedUrl(resource);
  const embeddable = canEmbed(resource);

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
              {resource.url_or_file_path && resource.resource_type !== "note" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(resource.url_or_file_path!, "_blank")}
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Open in New Tab
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
          ) : (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <p className="text-sm text-muted-foreground">This resource cannot be previewed inline.</p>
              {resource.url_or_file_path && (
                <Button onClick={() => window.open(resource.url_or_file_path!, "_blank")}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Resource
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
