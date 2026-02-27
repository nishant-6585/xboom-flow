import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { recordAuditLog } from "@/lib/auditLog";
import { Camera, Save, Loader2, User, Mail, Shield, Building2, Hash } from "lucide-react";

const MyProfile = () => {
  const { user, profile, role } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [allRoles, setAllRoles] = useState<string[]>([]);
  const [department, setDepartment] = useState("General");
  const [employeeId, setEmployeeId] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setName(profile.name || "");
      setAvatarUrl(profile.avatar_url || null);
    }
    if (user) {
      fetchUserDetails();
    }
  }, [profile, user]);

  const fetchUserDetails = async () => {
    if (!user) return;
    const [rolesRes, empRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", user.id),
      supabase.from("employees").select("id, department").eq("user_id", user.id).maybeSingle(),
    ]);
    if (rolesRes.data) setAllRoles(rolesRes.data.map((r) => r.role as string));
    if (empRes.data) {
      setDepartment(empRes.data.department || "General");
      setEmployeeId(empRes.data.id);
    }
  };

  const getRoleLabel = (r: string) => {
    const labels: Record<string, string> = {
      admin: "Admin", sales: "Sales", finance: "Finance",
      supply_chain: "Supply Chain", hr: "HR", it: "IT", marketing: "Marketing",
    };
    return labels[r] || r;
  };

  const getInitials = (n: string) =>
    n.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  const handleSaveName = async () => {
    if (!user || !name.trim()) return;
    setSaving(true);
    try {
      const oldName = profile?.name || "";
      const { error } = await supabase
        .from("profiles")
        .update({ name: name.trim() })
        .eq("user_id", user.id);
      if (error) throw error;

      // Log change
      await supabase.from("edit_history").insert({
        table_name: "profiles",
        record_id: user.id,
        field_name: "name",
        old_value: oldName,
        new_value: name.trim(),
        edited_by: user.id,
        edited_by_name: name.trim(),
      });

      toast({ title: "Profile Updated", description: "Your name has been updated." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const { validateFile } = await import('@/lib/fileValidation');
    const validation = validateFile(file, 'avatars');
    if (!validation.valid) {
      toast({ title: "Invalid file", description: validation.error, variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = urlData.publicUrl + `?t=${Date.now()}`;

      const { error: profErr } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("user_id", user.id);
      if (profErr) throw profErr;

      setAvatarUrl(publicUrl);
      toast({ title: "Avatar Updated", description: "Your profile photo has been updated." });
    } catch (err: any) {
      toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">My Profile</h1>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" /> Profile Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Avatar */}
            <div className="flex items-center gap-6">
              <div className="relative group">
                <Avatar className="w-20 h-20">
                  <AvatarImage src={avatarUrl || undefined} />
                  <AvatarFallback className="text-lg bg-primary/20 text-primary">
                    {profile?.name ? getInitials(profile.name) : "U"}
                  </AvatarFallback>
                </Avatar>
                <label className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  {uploading ? (
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  ) : (
                    <Camera className="w-5 h-5 text-white" />
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploading} />
                </label>
              </div>
              <div>
                <p className="font-medium text-lg">{profile?.name}</p>
                <p className="text-sm text-muted-foreground">{profile?.email}</p>
              </div>
            </div>

            {/* Name (editable) */}
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <div className="flex gap-2">
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
                <Button onClick={handleSaveName} disabled={saving || name.trim() === profile?.name}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            {/* Read-only fields */}
            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="flex items-center gap-1.5 text-muted-foreground">
                  <Mail className="w-3.5 h-3.5" /> Email
                </Label>
                <p className="text-sm font-medium">{profile?.email}</p>
              </div>

              <div className="space-y-1">
                <Label className="flex items-center gap-1.5 text-muted-foreground">
                  <Shield className="w-3.5 h-3.5" /> Roles
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {allRoles.map((r) => (
                    <Badge key={r} variant="secondary">{getRoleLabel(r)}</Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="flex items-center gap-1.5 text-muted-foreground">
                  <Building2 className="w-3.5 h-3.5" /> Department
                </Label>
                <p className="text-sm font-medium">{department}</p>
              </div>

              {employeeId && (
                <div className="space-y-1">
                  <Label className="flex items-center gap-1.5 text-muted-foreground">
                    <Hash className="w-3.5 h-3.5" /> Employee ID
                  </Label>
                  <p className="text-sm font-medium font-mono">{employeeId.slice(0, 8).toUpperCase()}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default MyProfile;
