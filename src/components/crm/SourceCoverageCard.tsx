import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, type LucideIcon } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";
import { useSourceCoverage, type CoverageDataset } from "@/hooks/useSourceCoverage";

const COLOR_WITH = "hsl(var(--primary))";
const COLOR_TOTAL = "hsl(var(--muted-foreground) / 0.4)";

interface Props {
  title: string;
  dataset: CoverageDataset;
  Icon: LucideIcon;
}

export function SourceCoverageCard({ title, dataset, Icon }: Props) {
  const { data, isLoading } = useSourceCoverage(dataset);
  const rows = data?.rows ?? [];
  const hasCompany = data?.hasCompany ?? false;

  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  const grandWith = rows.reduce((s, r) => s + r.withCompany, 0);
  const grandPct = grandTotal > 0 ? Math.round((grandWith / grandTotal) * 100) : 0;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          {title}
          <Badge variant="secondary" className="ml-2">
            {hasCompany
              ? `${grandWith.toLocaleString()} / ${grandTotal.toLocaleString()} (${grandPct}%)`
              : `${grandTotal.toLocaleString()} entries`}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">No data available.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="source" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="total" name={hasCompany ? "Total Contacts" : "Entries"} fill={COLOR_TOTAL} radius={[4, 4, 0, 0]} />
                  {hasCompany && (
                    <Bar dataKey="withCompany" name="With Company" fill={COLOR_WITH} radius={[4, 4, 0, 0]} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">{hasCompany ? "Total" : "Entries"}</TableHead>
                    {hasCompany && <TableHead className="text-right">With Company</TableHead>}
                    {hasCompany && <TableHead className="text-right">Coverage</TableHead>}
                    {!hasCompany && <TableHead className="text-right">Share</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const share = grandTotal > 0 ? Math.round((r.total / grandTotal) * 100) : 0;
                    return (
                      <TableRow key={r.source}>
                        <TableCell className="font-medium">{r.source}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{r.total.toLocaleString()}</TableCell>
                        {hasCompany && (
                          <TableCell className="text-right font-semibold">{r.withCompany.toLocaleString()}</TableCell>
                        )}
                        {hasCompany && (
                          <TableCell className="text-right">
                            <Badge variant={r.pct >= 50 ? "default" : r.pct >= 20 ? "secondary" : "outline"}>
                              {r.pct}%
                            </Badge>
                          </TableCell>
                        )}
                        {!hasCompany && (
                          <TableCell className="text-right">
                            <Badge variant="secondary">{share}%</Badge>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}