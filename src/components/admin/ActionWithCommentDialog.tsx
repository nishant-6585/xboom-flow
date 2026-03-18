import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface Props {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant?: "default" | "destructive";
  loading?: boolean;
  onConfirm: (comment: string) => void;
}

export function ActionWithCommentDialog({
  trigger,
  title,
  description,
  confirmLabel,
  confirmVariant = "default",
  loading,
  onConfirm,
}: Props) {
  const [comment, setComment] = useState("");
  const [open, setOpen] = useState(false);

  const handleConfirm = () => {
    if (!comment.trim()) return;
    onConfirm(comment.trim());
    setComment("");
    setOpen(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setComment(""); }}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="action-comment" className="text-sm font-medium">
            Reason / Comment <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="action-comment"
            placeholder="Enter reason for this action..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="min-h-[80px]"
            maxLength={500}
          />
          {comment.trim().length === 0 && (
            <p className="text-xs text-destructive">A reason is required to proceed</p>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <Button
            onClick={handleConfirm}
            disabled={!comment.trim() || loading}
            variant={confirmVariant}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
