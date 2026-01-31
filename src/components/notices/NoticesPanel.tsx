import { useState } from "react";
import { Plus, Bell, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNotices, Notice, NoticeFormData } from "@/hooks/useNotices";
import { useAuth } from "@/hooks/useAuth";
import { NoticeFormDialog } from "./NoticeFormDialog";
import { NoticeCard } from "./NoticeCard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function NoticesPanel() {
  const { notices, loading, createNotice, updateNotice, deleteNotice, readNoticeIds } = useNotices();
  const { role } = useAuth();
  const isAdmin = role === "admin";

  const [formOpen, setFormOpen] = useState(false);
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const activeNotices = notices.filter(n => n.is_active);
  const inactiveNotices = notices.filter(n => !n.is_active);

  const filterNotices = (list: Notice[]) => {
    if (!searchQuery) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      n => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
    );
  };

  const handleSubmit = async (data: NoticeFormData) => {
    if (editingNotice) {
      return updateNotice(editingNotice.id, data);
    }
    return createNotice(data);
  };

  const handleEdit = (notice: Notice) => {
    setEditingNotice(notice);
    setFormOpen(true);
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    await updateNotice(id, { is_active: active });
  };

  const confirmDelete = async () => {
    if (deleteId) {
      await deleteNotice(deleteId);
      setDeleteId(null);
    }
  };

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Bell className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            You don't have permission to manage notices.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search notices..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => { setEditingNotice(null); setFormOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          New Notice
        </Button>
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList>
          <TabsTrigger value="active">
            Active ({activeNotices.length})
          </TabsTrigger>
          <TabsTrigger value="inactive">
            Inactive ({inactiveNotices.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          {loading ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">Loading notices...</p>
              </CardContent>
            </Card>
          ) : filterNotices(activeNotices).length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Bell className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {searchQuery ? "No notices match your search" : "No active notices"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filterNotices(activeNotices).map((notice) => (
                <NoticeCard
                  key={notice.id}
                  notice={notice}
                  isRead={readNoticeIds.includes(notice.id)}
                  isAdmin={isAdmin}
                  onEdit={handleEdit}
                  onDelete={setDeleteId}
                  onToggleActive={handleToggleActive}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="inactive" className="mt-4">
          {filterNotices(inactiveNotices).length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">No inactive notices</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filterNotices(inactiveNotices).map((notice) => (
                <NoticeCard
                  key={notice.id}
                  notice={notice}
                  isRead={true}
                  isAdmin={isAdmin}
                  onEdit={handleEdit}
                  onDelete={setDeleteId}
                  onToggleActive={handleToggleActive}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <NoticeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        notice={editingNotice}
        onSubmit={handleSubmit}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Notice</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this notice? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
