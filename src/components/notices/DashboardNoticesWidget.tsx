import { Bell, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotices } from "@/hooks/useNotices";
import { NoticeCard } from "./NoticeCard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useState } from "react";

export function DashboardNoticesWidget() {
  const { notices, unreadNotices, readNoticeIds, markAsRead, loading } = useNotices();
  const [viewAllOpen, setViewAllOpen] = useState(false);

  // Show only recent notices (last 5)
  const recentNotices = notices.slice(0, 5);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Notices
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Notices
            {unreadNotices.length > 0 && (
              <Badge variant="destructive" className="ml-1">
                {unreadNotices.length} new
              </Badge>
            )}
          </CardTitle>
          {notices.length > 5 && (
            <Dialog open={viewAllOpen} onOpenChange={setViewAllOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs">
                  View All
                  <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh]">
                <DialogHeader>
                  <DialogTitle>All Notices</DialogTitle>
                </DialogHeader>
                <ScrollArea className="max-h-[60vh] pr-4">
                  <div className="space-y-4">
                    {notices.map((notice) => (
                      <NoticeCard
                        key={notice.id}
                        notice={notice}
                        isRead={readNoticeIds.includes(notice.id)}
                        onMarkRead={markAsRead}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {recentNotices.length === 0 ? (
          <div className="text-center py-6">
            <Bell className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">No notices yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentNotices.map((notice) => (
              <NoticeCard
                key={notice.id}
                notice={notice}
                isRead={readNoticeIds.includes(notice.id)}
                onMarkRead={markAsRead}
                compact
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
