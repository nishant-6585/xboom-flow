import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Building2, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";
import { useLeadCompanyCoverage } from "@/hooks/useLeadCompanyCoverage";

const COLOR_WITH = "hsl(var(--primary))";
const COLOR_TOTAL = "hsl(var(--muted-foreground) / 0.4)";

export function LeadCompanyCoverage() {
  const { data = [], isLoading } = useLeadCompanyCoverage();

  const grandTotal = data.reduce((s, r) => s + r.total, 0);
  const grandWith = data.reduce((s, r) => s + r.withCompany, 0);
  const grandPct = grandTotal > 0 ? Math.round((grandWith / grandTotal) * 100) : 0;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          Company Field Coverage by Lead Source
          <Badge variant="secondary" className="ml-2">
            {grandWith.toLocaleString()} / {grandTotal.toLocaleString()} ({grandPct}%)
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart */}
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="source" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="total" name="Total Contacts" fill={COLOR_TOTAL} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="withCompany" name="With Company" fill={COLOR_WITH} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Table */}
            <div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">With Company</TableHead>
                    <TableHead className="text-right">Placeholder</TableHead>
                    <TableHead className="text-right">Coverage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((r) => (
                    <TableRow key={r.source}>
                      <TableCell className="font-medium">{r.source}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{r.total.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-semibold">{r.withCompany.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        {r.badPlaceholder > 0 ? (
                          <Badge variant="destructive" className="text-xs">{r.badPlaceholder.toLocaleString()}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={r.pct >= 50 ? "default" : r.pct >= 20 ? "secondary" : "outline"}>
                          {r.pct}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
