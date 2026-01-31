import { useState, useEffect } from "react";
import { Bell, X, ChevronRight, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useNotices, Notice } from "@/hooks/useNotices";
import { NoticeCard } from "./NoticeCard";

export function NoticePopup() {
  const { unreadNotices, markAsRead, markAllAsRead, loading } = useNotices();
  const [open, setOpen] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
  const [hasShownPopup, setHasShownPopup] = useState(false);

  // Show popup automatically on login if there are unread notices
  useEffect(() => {
    if (!loading && unreadNotices.length > 0 && !hasShownPopup) {
      // Small delay to ensure smooth UI transition after login
      const timer = setTimeout(() => {
        setOpen(true);
        setHasShownPopup(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [loading, unreadNotices.length, hasShownPopup]);

  const handleNoticeClick = (notice: Notice) => {
    setSelectedNotice(notice);
    markAsRead(notice.id);
  };

  const handleMarkAllRead = () => {
    markAllAsRead();
    setOpen(false);
  };

  if (unreadNotices.length === 0 && !selectedNotice) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg max-h-[80vh] p-0">
        <DialogHeader className="p-4 pb-2 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              {selectedNotice ? "Notice Details" : "New Notices"}
              {!selectedNotice && unreadNotices.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {unreadNotices.length}
                </Badge>
              )}
            </DialogTitle>
          </div>
        </DialogHeader>

        {selectedNotice ? (
          <div className="p-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedNotice(null)}
              className="mb-3 -ml-2"
            >
              ← Back to list
            </Button>
            <NoticeCard notice={selectedNotice} isRead={true} />
          </div>
        ) : (
          <>
            <ScrollArea className="max-h-[50vh]">
              <div className="p-4 space-y-2">
                {unreadNotices.map((notice) => (
                  <div
                    key={notice.id}
                    onClick={() => handleNoticeClick(notice)}
                    className="p-3 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={notice.priority === "urgent" ? "destructive" : "secondary"}
                            className="text-[10px] px-1.5"
                          >
                            {notice.priority}
                          </Badge>
                          <h4 className="font-medium text-sm truncate">{notice.title}</h4>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {notice.content}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 ml-2" />
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="p-4 border-t flex gap-2">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                className="flex-1"
              >
                View Later
              </Button>
              <Button onClick={handleMarkAllRead} className="flex-1">
                <Check className="w-4 h-4 mr-2" />
                Mark All Read
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
