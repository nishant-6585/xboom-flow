import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bug, RefreshCw, X } from "lucide-react";

interface HealthData {
  userId: string | null;
  sessionExpiresAt: string | null;
  currentAAL: string | null;
  nextAAL: string | null;
  mfaVerified: boolean;
  deviceTrusted: boolean;
  lastRefresh: string;
  tokenExpiresIn: string;
}

/**
 * Internal debug panel — only visible when `?debug=session` is in the URL.
 * Shows live session health metrics for diagnosing auth issues.
 */
export function SessionHealthDebug() {
  const { user, session, mfaStatus } = useAuth();
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState<HealthData | null>(null);

  useEffect(() => {
    setVisible(window.location.search.includes("debug=session"));
  }, []);

  const refresh = async () => {
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const trustData = localStorage.getItem("mfa_device_trust");
    let deviceTrusted = false;
    if (trustData) {
      try {
        const parsed = JSON.parse(trustData);
        deviceTrusted = parsed.userId === user?.id && new Date(parsed.expiresAt).getTime() > Date.now();
      } catch { /* noop */ }
    }

    const expiresAt = session?.expires_at ? session.expires_at * 1000 : null;
    const timeLeft = expiresAt ? Math.max(0, Math.round((expiresAt - Date.now()) / 1000)) : 0;

    setData({
      userId: user?.id ?? null,
      sessionExpiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      currentAAL: aalData?.currentLevel ?? null,
      nextAAL: aalData?.nextLevel ?? null,
      mfaVerified: mfaStatus === "verified",
      deviceTrusted,
      lastRefresh: new Date().toISOString(),
      tokenExpiresIn: `${Math.floor(timeLeft / 60)}m ${timeLeft % 60}s`,
    });
  };

  useEffect(() => {
    if (visible && user) {
      refresh();
      const interval = setInterval(refresh, 10_000);
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, user?.id]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-80">
      <Card className="border-primary/30 bg-background/95 backdrop-blur shadow-xl">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Bug className="w-4 h-4" /> Session Health
          </CardTitle>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={refresh}>
              <RefreshCw className="w-3 h-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setVisible(false)}>
              <X className="w-3 h-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-1.5 text-xs font-mono">
          {data ? (
            <>
              <Row label="User" value={data.userId?.slice(0, 8) + "..." || "none"} />
              <Row label="Token expires" value={data.tokenExpiresIn} />
              <Row label="AAL" value={`${data.currentAAL} → ${data.nextAAL}`} />
              <Row label="MFA" value={
                <Badge variant={data.mfaVerified ? "default" : "destructive"} className="text-[10px] h-4">
                  {data.mfaVerified ? "verified" : mfaStatus}
                </Badge>
              } />
              <Row label="Device trust" value={
                <Badge variant={data.deviceTrusted ? "default" : "secondary"} className="text-[10px] h-4">
                  {data.deviceTrusted ? "trusted" : "untrusted"}
                </Badge>
              } />
              <Row label="Last check" value={new Date(data.lastRefresh).toLocaleTimeString()} />
            </>
          ) : (
            <p className="text-muted-foreground">Loading...</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
