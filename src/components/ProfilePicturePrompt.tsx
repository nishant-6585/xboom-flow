import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, User, Upload, Save, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// One-time nudge to upload a profile picture. Dismissal is stored on the
// user's profile row so it follows them across devices and sessions.

export function ProfilePicturePrompt() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.id || !profile) return;
    if (profile.avatar_url) return; // already has a photo
    if (profile.profile_pic_prompt_dismissed_at) return; // already dismissed on any device
    // Small delay so it doesn't fight the initial dashboard render.
    const t = setTimeout(() => setOpen(true), 1200);
    return () => clearTimeout(t);
  }, [user?.id, profile]);

  const persistDismissal = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      await supabase
        .from("profiles")
        .update({ profile_pic_prompt_dismissed_at: new Date().toISOString() })
        .eq("user_id", user.id);
      await refreshProfile();
    } catch {
      /* non-fatal: prompt will re-show at most once next login */
    } finally {
      setSaving(false);
    }
  };

  const dismiss = () => {
    setOpen(false);
    void persistDismissal();
  };

  const goToProfile = () => {
    setOpen(false);
    void persistDismissal();
    navigate("/profile");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : dismiss())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <Camera className="w-7 h-7 text-primary" />
          </div>
          <DialogTitle className="text-center">Add a profile picture</DialogTitle>
          <DialogDescription className="text-center">
            Help your teammates recognise you across Xboom Flow — birthdays,
            approvals, tickets and messages all look friendlier with a real face.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-2.5 text-sm mt-2">
          <li className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
              1
            </span>
            <span>
              Open your profile — top-right avatar &rarr;{" "}
              <span className="inline-flex items-center gap-1 font-medium">
                <User className="w-3.5 h-3.5" /> My Profile
              </span>.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
              2
            </span>
            <span>
              Click the camera icon on your avatar and pick a clear, front-facing
              photo (JPG or PNG, under 5&nbsp;MB).
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
              3
            </span>
            <span className="inline-flex items-start gap-1">
              <Upload className="w-3.5 h-3.5 mt-0.5" />
              It uploads automatically and the new picture shows everywhere in
              Xboom Flow — no <Save className="w-3.5 h-3.5 inline" /> Save
              needed.
            </span>
          </li>
        </ol>

        <DialogFooter className="mt-4 gap-2 sm:gap-2">
          <Button variant="ghost" onClick={dismiss} disabled={saving} className="gap-2">
            <X className="w-4 h-4" /> Maybe later
          </Button>
          <Button onClick={goToProfile} disabled={saving} className="gap-2">
            <Camera className="w-4 h-4" /> Upload photo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ProfilePicturePrompt;