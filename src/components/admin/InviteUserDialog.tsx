import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, UserPlus, Copy, Check, Link, Mail } from "lucide-react";
import { useOrgRoles, useOrgDepartments } from "@/hooks/useOrgRolesAndDepartments";

interface InviteUserDialogProps {
  onUserInvited: () => void;
}

export function InviteUserDialog({ onUserInvited }: InviteUserDialogProps) {
  const { roles: orgRoles } = useOrgRoles();
  const { departments: orgDepartments } = useOrgDepartments();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    role: "sales" as string,
    department: "General" as string,
  });
  const [autoSendEmail, setAutoSendEmail] = useState(true);
  const [autoSendResult, setAutoSendResult] = useState<{ ok: boolean; message: string } | null>(null);
  const { toast } = useToast();

  const signupUrl = `${window.location.origin}/auth`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(signupUrl);
      setCopied(true);
      toast({
        title: "Link Copied!",
        description: "Signup link copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Please copy the link manually",
        variant: "destructive",
      });
    }
  };

  const handleClose = () => {
    setOpen(false);
    setInviteSent(false);
    setCopied(false);
    setFormData({ name: "", email: "", role: "sales", department: "General" });
    setAutoSendResult(null);
    setAutoSendEmail(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.email.trim()) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast({
        title: "Error",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Check if user already exists
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", formData.email.toLowerCase())
        .maybeSingle();

      if (existingProfile) {
        toast({
          title: "User Already Exists",
          description: "A user with this email already exists in the system",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // Check for existing invitation
      const { data: existingInvitation } = await supabase
        .from("user_invitations")
        .select("id, status")
        .eq("email", formData.email.toLowerCase().trim())
        .maybeSingle();

      let invitation;

      if (existingInvitation) {
        if (existingInvitation.status === "pending") {
          toast({
            title: "Invitation Already Pending",
            description: "An invitation for this email is already pending. It has been updated with the new details.",
          });
        }
        // Update the existing invitation (re-invite scenario or update cancelled one)
        const { data: updated, error: updateError } = await supabase
          .from("user_invitations")
          .update({
            name: formData.name.trim(),
            role: formData.role,
            department: formData.department,
            status: "pending",
          })
          .eq("id", existingInvitation.id)
          .select()
          .single();

        if (updateError) throw updateError;
        invitation = updated;
      } else {
        // Create a new invitation record
        const { data: created, error: inviteError } = await supabase
          .from("user_invitations")
          .insert({
            name: formData.name.trim(),
            email: formData.email.toLowerCase().trim(),
            role: formData.role,
            department: formData.department,
          })
          .select()
          .single();

        if (inviteError) throw inviteError;
        invitation = created;
      }

      setInviteSent(true);
      onUserInvited();

      if (autoSendEmail && invitation?.id) {
        try {
          const { data: sendData, error: sendError } = await supabase.functions.invoke(
            "send-invite-email",
            { body: { invitation_id: invitation.id } }
          );
          if (sendError || sendData?.error) {
            const msg = sendData?.error || sendError?.message || "Failed to send invite email";
            setAutoSendResult({ ok: false, message: msg });
            toast({ title: "Invite email failed", description: msg, variant: "destructive" });
          } else {
            setAutoSendResult({ ok: true, message: `Sent to ${formData.email} from hr@xboom.in` });
            toast({ title: "Invite email sent", description: `Sent to ${formData.email} from hr@xboom.in` });
          }
        } catch (e: any) {
          setAutoSendResult({ ok: false, message: e?.message || "Failed to send invite email" });
          toast({ title: "Invite email failed", description: e?.message || "Unknown error", variant: "destructive" });
        }
      }
    } catch (error: any) {
      console.error("Error creating invitation:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create invitation",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "sales":
        return "Sales Team";
      case "supply_chain":
        return "Supply Chain";
      case "finance":
        return "Finance";
      case "admin":
        return "Admin";
      case "it":
        return "IT Team";
      case "marketing":
        return "Marketing Team";
      default:
        return role;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) handleClose();
      else setOpen(true);
    }}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <UserPlus className="w-4 h-4" />
          Invite User
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        {inviteSent ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="w-5 h-5 text-success" />
                Invitation Created
              </DialogTitle>
              <DialogDescription>
                Share the signup link with {formData.name} to complete their registration.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="p-4 rounded-lg bg-secondary/50 border border-border space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{formData.email}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Role: {getRoleLabel(formData.role)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Signup Link</Label>
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md bg-muted border border-border text-sm truncate">
                    <Link className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">{signupUrl}</span>
                  </div>
                  <Button
                    type="button"
                    variant={copied ? "default" : "outline"}
                    size="icon"
                    onClick={handleCopyLink}
                    className="flex-shrink-0"
                  >
                    {copied ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Share this link with {formData.name}. They must sign up using <strong>{formData.email}</strong> to get auto-approved as {getRoleLabel(formData.role)}.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Invite New User</DialogTitle>
              <DialogDescription>
                Create a joining request for a new team member. They will be able to sign up with the provided email address.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Full Name *</Label>
                  <Input
                    id="name"
                    placeholder="Enter full name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    disabled={loading}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter email address"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    disabled={loading}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="department">Department *</Label>
                  <Select
                    value={formData.department}
                    onValueChange={(value) => setFormData({ ...formData, department: value })}
                    disabled={loading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      {orgDepartments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.name}>{dept.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="role">Role *</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value) => setFormData({ ...formData, role: value })}
                    disabled={loading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {orgRoles.map((r) => (
                        <SelectItem key={r.id} value={r.name}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Sending...
                    </>
                  ) : (
                    "Send Invitation"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
