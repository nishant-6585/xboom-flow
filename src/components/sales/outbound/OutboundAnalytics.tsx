import { History, ShieldCheck, Linkedin, Star, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useOutboundContacts } from "@/hooks/useOutboundContacts";
import { format } from "date-fns";

export function OutboundAnalytics() {
  const { contacts, uploadLogs, reviewQueue } = useOutboundContacts();

  const total = contacts.length;
  const withEmail = contacts.filter(c => c.email).length;
  const withPhone = contacts.filter(c => c.phone).length;
  const withLinkedin = contacts.filter(c => c.linkedin_url).length;
  const duplicated = contacts.filter(c => c.duplicate_count > 0).length;
  const prospects = contacts.filter(c => c.is_prospect).length;
  const attention = contacts.filter(c => c.needs_attention).length;
  const hospitality = contacts.filter(c => c.source_type === 'hospitality').length;
  const events = contacts.filter(c => c.source_type === 'events').length;
  const multi = contacts.filter(c => c.source_type === 'multi').length;

  const pct = (n: number) => total ? Math.round((n / total) * 100) : 0;

  // Sheet-wise stats
  const sheetCounts = new Map<string, number>();
  contacts.forEach(c => {
    const s = c.source_sheet || 'Unknown';
    sheetCounts.set(s, (sheetCounts.get(s) || 0) + 1);
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold">{total}</p>
          <p className="text-xs text-muted-foreground">Total</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{pct(withEmail)}%</p>
          <p className="text-xs text-muted-foreground">Email</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{pct(withPhone)}%</p>
          <p className="text-xs text-muted-foreground">Phone</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-sky-600">{pct(withLinkedin)}%</p>
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Linkedin className="w-3 h-3" />LinkedIn</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">{prospects}</p>
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Star className="w-3 h-3" />Prospects</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{attention}</p>
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><AlertTriangle className="w-3 h-3" />Attention</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">{pct(duplicated)}%</p>
          <p className="text-xs text-muted-foreground">Dupe Rate</p>
        </CardContent></Card>
      </div>

      {/* Source Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Source Breakdown</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Hospitality</span><Badge variant="outline">{hospitality}</Badge></div>
              <div className="flex justify-between"><span>Events</span><Badge variant="outline">{events}</Badge></div>
              <div className="flex justify-between"><span>Multi-source</span><Badge variant="outline">{multi}</Badge></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Sheet-wise Import</CardTitle></CardHeader>
          <CardContent>
            <ScrollArea className="h-[120px]">
              <div className="space-y-1 text-sm">
                {Array.from(sheetCounts.entries()).map(([sheet, count]) => (
                  <div key={sheet} className="flex justify-between">
                    <span className="truncate max-w-[150px]">{sheet}</span>
                    <Badge variant="outline">{count}</Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Conflict Queue
              {reviewQueue.length > 0 && <Badge variant="destructive" className="text-xs">{reviewQueue.length}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {reviewQueue.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No conflicts</p>
            ) : (
              <ScrollArea className="h-[120px]">
                <div className="space-y-2">
                  {reviewQueue.map(item => {
                    const data = item.contact_data as any;
                    return (
                      <div key={item.id} className="p-2 rounded border text-sm">
                        <p className="font-medium">{data?.contact_name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{item.conflict_type}</p>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Upload History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4" /> Upload History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {uploadLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No uploads yet</p>
          ) : (
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {uploadLogs.map(log => (
                  <div key={log.id} className="p-3 rounded-lg border text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium truncate max-w-[250px]">{log.file_name}</span>
                      <span className="text-xs text-muted-foreground">{format(new Date(log.created_at), 'dd MMM yyyy HH:mm')}</span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{log.total_rows} rows</Badge>
                      <Badge className="text-xs bg-green-500/10 text-green-700 border-green-200">{log.new_records} new</Badge>
                      <Badge className="text-xs bg-blue-500/10 text-blue-700 border-blue-200">{log.updated_records} updated</Badge>
                      {log.failed_rows > 0 && <Badge className="text-xs bg-red-500/10 text-red-700 border-red-200">{log.failed_rows} failed</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
