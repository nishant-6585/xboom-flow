import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface FlagRow {
  key: string;
  enabled: boolean;
  updated_at: string;
  updated_by: string | null;
  updated_by_name: string | null;
}

const FLAG_KEY = "kyc_customer_emails_enabled";

export default function FeatureFlagsPanel() {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const [row, setRow] = useState<FlagRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase.from("feature_flags") as any)
      .select("key, enabled, updated_at, updated_by, updated_by_name")
      .eq("key", FLAG_KEY)
      .maybeSingle();
    if (!error) setRow(data as FlagRow | null);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (next: boolean) => {
    if (!isAdmin) return;
    setSaving(true);
    const updatedByName =
      (user as any)?.user_metadata?.full_name ||
      (user as any)?.user_metadata?.name ||
      (user as any)?.email ||
      null;
    const { error } = await (supabase.from("feature_flags") as any)
      .update({
        enabled: next,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
        updated_by_name: updatedByName,
      })
      .eq("key", FLAG_KEY);
    setSaving(false);
    if (error) {
      toast.error(`Failed to update flag: ${error.message}`);
      return;
    }
    toast.success(`KYC customer emails ${next ? "enabled" : "disabled"}`);
    load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Feature Flags</CardTitle>
          <CardDescription>
            Runtime toggles. Changes take effect immediately — no redeploy needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start justify-between gap-6 border rounded-lg p-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">KYC customer emails</span>
                <Badge variant={row?.enabled ? "default" : "secondary"}>
                  {loading ? "…" : row?.enabled ? "ON" : "OFF"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground max-w-prose">
                Master switch for the customer-facing KYC / portal-invite emails sent on
                order creation, plus KYC approve/reject status emails. When OFF, no portal
                account, auth user, or contact is created either.
              </p>
              {row && (
                <p className="text-xs text-muted-foreground">
                  Last changed {new Date(row.updated_at).toLocaleString()}{" "}
                  {row.updated_by_name ? `by ${row.updated_by_name}` : ""}
                </p>
              )}
            </div>
            <Switch
              checked={!!row?.enabled}
              onCheckedChange={toggle}
              disabled={!isAdmin || loading || saving}
            />
          </div>
          {!isAdmin && (
            <p className="text-xs text-muted-foreground">Only admins can change flags.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}