import { BarChart3, PieChart, ShieldCheck, History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useOutboundContacts } from "@/hooks/useOutboundContacts";
import { format } from "date-fns";

export function OutboundAnalytics() {
  const { contacts, uploadLogs, reviewQueue } = useOutboundContacts();

  const totalContacts = contacts.length;
  const withEmail = contacts.filter(c => c.email).length;
  const withPhone = contacts.filter(c => c.phone).length;
  const duplicated = contacts.filter(c => c.duplicate_count > 0).length;

  const emailPct = totalContacts ? Math.round((withEmail / totalContacts) * 100) : 0;
  const phonePct = totalContacts ? Math.round((withPhone / totalContacts) * 100) : 0;
  const dupePct = totalContacts ? Math.round((duplicated / totalContacts) * 100) : 0;

  const totalUploaded = uploadLogs.reduce((s, l) => s + l.total_rows, 0);
  const totalNew = uploadLogs.reduce((s, l) => s + l.new_records, 0);
  const totalUpdated = uploadLogs.reduce((s, l) => s + l.updated_records, 0);

  return (
    <div className="space-y-4">
      {/* Data Quality */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">{totalContacts}</p>
            <p className="text-xs text-muted-foreground">Total Contacts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-green-600">{emailPct}%</p>
            <p className="text-xs text-muted-foreground">With Email</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-blue-600">{phonePct}%</p>
            <p className="text-xs text-muted-foreground">With Phone</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-amber-600">{dupePct}%</p>
            <p className="text-xs text-muted-foreground">Duplicate Rate</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <ScrollArea className="h-[250px]">
                <div className="space-y-2">
                  {uploadLogs.map(log => (
                    <div key={log.id} className="p-3 rounded-lg border text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium truncate max-w-[200px]">{log.file_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(log.created_at), 'dd MMM yyyy HH:mm')}
                        </span>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">{log.total_rows} rows</Badge>
                        <Badge className="text-xs bg-green-500/10 text-green-700 border-green-200">{log.new_records} new</Badge>
                        <Badge className="text-xs bg-blue-500/10 text-blue-700 border-blue-200">{log.updated_records} updated</Badge>
                        {log.failed_rows > 0 && (
                          <Badge className="text-xs bg-red-500/10 text-red-700 border-red-200">{log.failed_rows} failed</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Review Queue */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Conflict Review Queue
              {reviewQueue.length > 0 && (
                <Badge variant="destructive" className="text-xs">{reviewQueue.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {reviewQueue.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No conflicts to review</p>
            ) : (
              <ScrollArea className="h-[250px]">
                <div className="space-y-2">
                  {reviewQueue.map(item => {
                    const data = item.contact_data as any;
                    return (
                      <div key={item.id} className="p-3 rounded-lg border text-sm">
                        <p className="font-medium">{data?.contact_name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.conflict_type === 'phone_match_email_mismatch'
                            ? 'Phone matches existing contact but email differs'
                            : item.conflict_type}
                        </p>
                        <div className="flex gap-1 mt-1">
                          {data?.email && <Badge variant="outline" className="text-xs">{data.email}</Badge>}
                          {data?.phone && <Badge variant="outline" className="text-xs">{data.phone}</Badge>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
