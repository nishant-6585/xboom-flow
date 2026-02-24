import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Settings, Loader2, Sun, Moon, Monitor, Bell, Lock } from "lucide-react";

interface EmailNotifications {
  orders: boolean;
  enquiries: boolean;
  tasks: boolean;
  attendance: boolean;
  system: boolean;
}

const DEFAULT_NOTIFICATIONS: EmailNotifications = {
  orders: true,
  enquiries: true,
  tasks: true,
  attendance: true,
  system: true,
};

const Preferences = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState("light");
  const [compactMode, setCompactMode] = useState(false);
  const [language, setLanguage] = useState("en");
  const [emailNotifications, setEmailNotifications] = useState<EmailNotifications>(DEFAULT_NOTIFICATIONS);
  const [inAppNotifications, setInAppNotifications] = useState(true);

  useEffect(() => {
    if (user) fetchSettings();
  }, [user]);

  const fetchSettings = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_settings")
      .select("theme, compact_mode, language, email_notifications, in_app_notifications")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      setTheme(data.theme || "light");
      setCompactMode(data.compact_mode || false);
      setLanguage(data.language || "en");
      setInAppNotifications(data.in_app_notifications ?? true);
      const en = data.email_notifications as unknown as EmailNotifications | null;
      if (en) setEmailNotifications({ ...DEFAULT_NOTIFICATIONS, ...en });
    }
    setLoading(false);
  };

  const saveSetting = async (field: string, value: any) => {
    if (!user) return;
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from("user_settings")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("user_settings")
          .update({ [field]: value, updated_at: new Date().toISOString() })
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_settings")
          .insert({ user_id: user.id, [field]: value });
        if (error) throw error;
      }

      if (field === "theme") applyTheme(value);
      toast({ title: "Saved", description: "Preference updated." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const applyTheme = (t: string) => {
    const root = document.documentElement;
    if (t === "dark") {
      root.classList.add("dark");
    } else if (t === "light") {
      root.classList.remove("dark");
    } else {
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }
  };

  const handleThemeChange = (val: string) => {
    setTheme(val);
    saveSetting("theme", val);
  };

  const handleCompactChange = (val: boolean) => {
    setCompactMode(val);
    saveSetting("compact_mode", val);
  };

  const handleEmailToggle = (key: keyof EmailNotifications, val: boolean) => {
    const updated = { ...emailNotifications, [key]: val };
    setEmailNotifications(updated);
    saveSetting("email_notifications", updated);
  };

  const handleInAppToggle = (val: boolean) => {
    setInAppNotifications(val);
    saveSetting("in_app_notifications", val);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const notifCategories: { key: keyof EmailNotifications; label: string; desc: string }[] = [
    { key: "orders", label: "Orders", desc: "Order creation, status changes, delivery updates" },
    { key: "enquiries", label: "Enquiries", desc: "New enquiries, responses, escalations" },
    { key: "tasks", label: "Tasks", desc: "Task assignments, due date reminders" },
    { key: "attendance", label: "Attendance", desc: "Check-in/out alerts, break warnings" },
    { key: "system", label: "System", desc: "Maintenance, updates, announcements" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-lg">
        <h1 className="text-2xl font-bold mb-6">Preferences</h1>

        <div className="space-y-4">
          {/* Theme */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sun className="w-4 h-4" /> Appearance
              </CardTitle>
              <CardDescription>Customize the look and feel</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Theme</Label>
                <Select value={theme} onValueChange={handleThemeChange}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">
                      <span className="flex items-center gap-2"><Sun className="w-3.5 h-3.5" /> Light</span>
                    </SelectItem>
                    <SelectItem value="dark">
                      <span className="flex items-center gap-2"><Moon className="w-3.5 h-3.5" /> Dark</span>
                    </SelectItem>
                    <SelectItem value="system">
                      <span className="flex items-center gap-2"><Monitor className="w-3.5 h-3.5" /> System</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Compact Mode</Label>
                  <p className="text-xs text-muted-foreground">Reduce spacing for denser layout</p>
                </div>
                <Switch checked={compactMode} onCheckedChange={handleCompactChange} />
              </div>
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="w-4 h-4" /> Notifications
              </CardTitle>
              <CardDescription>Control what you receive</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* In-app toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label>In-App Notifications</Label>
                  <p className="text-xs text-muted-foreground">Show notifications inside the app</p>
                </div>
                <Switch checked={inAppNotifications} onCheckedChange={handleInAppToggle} />
              </div>

              {/* Critical Alerts (always on) */}
              <div className="flex items-center justify-between opacity-70">
                <div>
                  <Label className="flex items-center gap-1.5">
                    Critical Alerts
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 ml-1">
                      <Lock className="w-2.5 h-2.5 mr-0.5" /> Always On
                    </Badge>
                  </Label>
                  <p className="text-xs text-muted-foreground">Security events, account locks, system outages</p>
                </div>
                <Switch checked={true} disabled />
              </div>

              {/* Per-category email toggles */}
              <div className="border-t border-border pt-3 mt-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Email Notifications</p>
                <div className="space-y-3">
                  {notifCategories.map((cat) => (
                    <div key={cat.key} className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm">{cat.label}</Label>
                        <p className="text-xs text-muted-foreground">{cat.desc}</p>
                      </div>
                      <Switch
                        checked={emailNotifications[cat.key]}
                        onCheckedChange={(val) => handleEmailToggle(cat.key, val)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Language */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="w-4 h-4" /> Language
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <Label>Display Language</Label>
                <Select value={language} onValueChange={(v) => { setLanguage(v); saveSetting("language", v); }}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Preferences;
