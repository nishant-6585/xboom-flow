import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Smartphone, Trash2, Loader2, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getDeviceId } from "@/lib/deviceTrust";
import { format } from "date-fns";

interface TrustedDevice {
  id: string;
  device_name: string | null;
  created_at: string;
  expires_at: string;
  last_used_at: string;
  is_revoked: boolean;
  device_hash: string;
}

export function TrustedDevicesList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  const fetchDevices = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("trusted_devices")
        .select("id, device_name, created_at, expires_at, last_used_at, is_revoked, device_hash")
        .eq("user_id", user.id)
        .eq("is_revoked", false)
        .order("last_used_at", { ascending: false });

      if (error) throw error;
      setDevices((data as TrustedDevice[]) || []);
    } catch (e: any) {
      console.warn("Failed to fetch trusted devices:", e.message);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const revokeDevice = async (deviceId: string) => {
    setRevoking(deviceId);
    try {
      const { error } = await supabase
        .from("trusted_devices")
        .update({ is_revoked: true } as any)
        .eq("id", deviceId);

      if (error) throw error;
      toast({ title: "Device revoked", description: "Trust has been removed from this device." });
      fetchDevices();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setRevoking(null);
    }
  };

  const revokeAll = async () => {
    setRevoking("all");
    try {
      const { error } = await supabase
        .from("trusted_devices")
        .update({ is_revoked: true } as any)
        .eq("user_id", user!.id)
        .eq("is_revoked", false);

      if (error) throw error;
      localStorage.removeItem("mfa_device_trust");
      toast({ title: "All devices revoked", description: "MFA will be required on next login from any device." });
      fetchDevices();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setRevoking(null);
    }
  };

  // Detect if a device is the current one (rough match by hash prefix)
  const currentDeviceId = getDeviceId();

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Trusted Devices
            </CardTitle>
            <CardDescription>
              Devices that can skip MFA for 30 days. Max 5 devices.
            </CardDescription>
          </div>
          {devices.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={revokeAll}
              disabled={revoking === "all"}
            >
              {revoking === "all" ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
              Revoke All
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {devices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No trusted devices. MFA will be required on every login.</p>
        ) : (
          devices.map((device) => {
            const isExpired = new Date(device.expires_at).getTime() < Date.now();
            return (
              <div
                key={device.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card"
              >
                <div className="flex items-center gap-3">
                  <Smartphone className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {device.device_name || "Unknown Device"}
                      </span>
                      {isExpired && (
                        <Badge variant="secondary" className="text-[10px]">Expired</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Last used: {format(new Date(device.last_used_at), "MMM d, yyyy h:mm a")}
                      {" · "}
                      Expires: {format(new Date(device.expires_at), "MMM d, yyyy")}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => revokeDevice(device.id)}
                  disabled={revoking === device.id}
                  className="h-8 w-8 text-destructive hover:text-destructive"
                >
                  {revoking === device.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </Button>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
