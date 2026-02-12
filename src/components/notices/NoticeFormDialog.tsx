import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Notice, NoticeFormData, NoticePriority, NoticeVisibility } from "@/hooks/useNotices";

interface NoticeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notice?: Notice | null;
  onSubmit: (data: NoticeFormData) => Promise<{ error: Error | null }>;
}

const VISIBILITY_OPTIONS: { value: NoticeVisibility; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "sales", label: "Sales Team" },
  { value: "supply_chain", label: "Supply Chain Team" },
  { value: "finance", label: "Finance Team" },
  { value: "admin", label: "Admins Only" },
  { value: "it", label: "IT Team" },
  { value: "marketing", label: "Marketing Team" },
  { value: "hr", label: "HR Team" },
];

const PRIORITY_OPTIONS: { value: NoticePriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export function NoticeFormDialog({
  open,
  onOpenChange,
  notice,
  onSubmit,
}: NoticeFormDialogProps) {
  const [formData, setFormData] = useState<NoticeFormData>({
    title: "",
    content: "",
    priority: "normal",
    visibility: ["all"],
    expires_at: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (notice) {
      setFormData({
        title: notice.title,
        content: notice.content,
        priority: notice.priority,
        visibility: notice.visibility,
        expires_at: notice.expires_at ? notice.expires_at.split("T")[0] : "",
      });
    } else {
      setFormData({
        title: "",
        content: "",
        priority: "normal",
        visibility: ["all"],
        expires_at: "",
      });
    }
  }, [notice, open]);

  const handleVisibilityChange = (value: NoticeVisibility, checked: boolean) => {
    setFormData((prev) => {
      let newVisibility = [...prev.visibility];
      
      if (value === "all") {
        // If selecting "all", clear other selections
        newVisibility = checked ? ["all"] : [];
      } else {
        // If selecting specific team, remove "all"
        newVisibility = newVisibility.filter(v => v !== "all");
        
        if (checked) {
          newVisibility.push(value);
        } else {
          newVisibility = newVisibility.filter(v => v !== value);
        }
      }
      
      return { ...prev, visibility: newVisibility.length ? newVisibility : ["all"] };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    
    const { error } = await onSubmit(formData);
    
    setSubmitting(false);
    if (!error) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{notice ? "Edit Notice" : "Create New Notice"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Notice title"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Content *</Label>
            <Textarea
              id="content"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="Notice content..."
              rows={5}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <Select
              value={formData.priority}
              onValueChange={(value: NoticePriority) =>
                setFormData({ ...formData, priority: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Visibility *</Label>
            <div className="grid grid-cols-2 gap-2">
              {VISIBILITY_OPTIONS.map((opt) => (
                <div key={opt.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`vis-${opt.value}`}
                    checked={formData.visibility.includes(opt.value)}
                    onCheckedChange={(checked) =>
                      handleVisibilityChange(opt.value, checked as boolean)
                    }
                  />
                  <Label htmlFor={`vis-${opt.value}`} className="text-sm font-normal cursor-pointer">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="expires_at">Expires On (Optional)</Label>
            <Input
              id="expires_at"
              type="date"
              value={formData.expires_at}
              onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
              min={new Date().toISOString().split("T")[0]}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? "Saving..." : notice ? "Update" : "Publish"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
