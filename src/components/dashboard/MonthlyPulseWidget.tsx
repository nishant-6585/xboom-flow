import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Newspaper, Eye } from "lucide-react";
import { useLatestActivePulse, getPulseSignedUrl, useMarkPulseSeen } from "@/hooks/useMonthlyPulses";

export function MonthlyPulseWidget() {
  const { latest, isLoading } = useLatestActivePulse();
  const markSeen = useMarkPulseSeen();
  const [opening, setOpening] = useState(false);

  if (isLoading || !latest) return null;

  const open = async () => {
    setOpening(true);
    const url = await getPulseSignedUrl(latest.file_url);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    markSeen.mutate(latest.id);
    setOpening(false);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Newspaper className="w-5 h-5 text-primary" />
          Monthly Pulse
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{latest.title}</span>
          <Badge variant="outline">{latest.month}</Badge>
        </div>
        {latest.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{latest.description}</p>
        )}
        <Button size="sm" onClick={open} disabled={opening}>
          <Eye className="h-4 w-4 mr-1" /> View Newsletter
        </Button>
      </CardContent>
    </Card>
  );
}