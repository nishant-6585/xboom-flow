import { Enquiry, LOST_REASONS, LostReason, QueryStatus } from "@/hooks/useEnquiries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { TrendingUp, TrendingDown, Target, Trophy, XCircle, Clock } from "lucide-react";

interface EnquiryConversionAnalyticsProps {
  enquiries: Enquiry[];
  onStatusClick?: (status: QueryStatus | "all") => void;
  onLostReasonClick?: (reason: LostReason) => void;
}

export function EnquiryConversionAnalytics({ enquiries, onStatusClick, onLostReasonClick }: EnquiryConversionAnalyticsProps) {
  // Calculate conversion stats
  const totalEnquiries = enquiries.length;
  const wonEnquiries = enquiries.filter((e) => e.status === "order_won").length;
  const lostEnquiries = enquiries.filter((e) => e.status === "order_lost").length;
  const pendingEnquiries = enquiries.filter((e) => e.status === "pending" || e.status === "responded" || e.status === "on_hold").length;
  
  const conversionRate = totalEnquiries > 0 ? ((wonEnquiries / totalEnquiries) * 100).toFixed(1) : "0";
  const lossRate = totalEnquiries > 0 ? ((lostEnquiries / totalEnquiries) * 100).toFixed(1) : "0";

  // Outcome distribution for pie chart
  const outcomeData = [
    { name: "Won", value: wonEnquiries, color: "hsl(142, 76%, 36%)", status: "order_won" as QueryStatus },
    { name: "Lost", value: lostEnquiries, color: "hsl(0, 84%, 60%)", status: "order_lost" as QueryStatus },
    { name: "Pending", value: pendingEnquiries, color: "hsl(220, 14%, 50%)", status: "pending" as QueryStatus },
  ].filter((d) => d.value > 0);

  // Lost reason breakdown
  const lostReasonCounts: Record<string, number> = {};
  enquiries
    .filter((e) => e.status === "order_lost" && e.lost_reason)
    .forEach((e) => {
      const reason = e.lost_reason as LostReason;
      lostReasonCounts[reason] = (lostReasonCounts[reason] || 0) + 1;
    });

  const lostReasonData = LOST_REASONS.map((reason) => ({
    name: reason.label.replace(" too high", "").replace(" not acceptable", ""),
    shortName: reason.value as LostReason,
    count: lostReasonCounts[reason.value] || 0,
    fullLabel: reason.label,
  })).filter((d) => d.count > 0);

  // Custom tooltip for bar chart
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border rounded-lg p-2 shadow-lg">
          <p className="text-sm font-medium">{payload[0].payload.fullLabel}</p>
          <p className="text-sm text-muted-foreground">Count: {payload[0].value}</p>
        </div>
      );
    }
    return null;
  };

  const handlePieClick = (data: any) => {
    if (onStatusClick && data?.status) {
      onStatusClick(data.status);
    }
  };

  const handleBarClick = (data: any) => {
    if (onLostReasonClick && data?.shortName) {
      onLostReasonClick(data.shortName);
    }
  };

  const cardClickClass = onStatusClick ? "cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg hover:ring-2 hover:ring-primary/30" : "";

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card 
          className={cardClickClass}
          onClick={() => onStatusClick?.("all")}
        >
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Target className="w-4 h-4" />
              Total Enquiries
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalEnquiries}</p>
          </CardContent>
        </Card>

        <Card 
          className={cardClickClass}
          onClick={() => onStatusClick?.("order_won")}
        >
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-green-600">
              <Trophy className="w-4 h-4" />
              Orders Won
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{wonEnquiries}</p>
            <p className="text-sm text-muted-foreground">{conversionRate}% conversion</p>
          </CardContent>
        </Card>

        <Card 
          className={cardClickClass}
          onClick={() => onStatusClick?.("order_lost")}
        >
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-destructive">
              <XCircle className="w-4 h-4" />
              Orders Lost
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-destructive">{lostEnquiries}</p>
            <p className="text-sm text-muted-foreground">{lossRate}% loss rate</p>
          </CardContent>
        </Card>

        <Card 
          className={cardClickClass}
          onClick={() => onStatusClick?.("pending")}
        >
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Pending
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{pendingEnquiries}</p>
            <p className="text-sm text-muted-foreground">awaiting outcome</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Outcome Distribution Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Outcome Distribution</CardTitle>
            <CardDescription>Breakdown of enquiry outcomes - click segments to filter</CardDescription>
          </CardHeader>
          <CardContent>
            {outcomeData.length > 0 ? (
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={outcomeData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                      onClick={handlePieClick}
                      style={{ cursor: onStatusClick ? 'pointer' : 'default' }}
                    >
                      {outcomeData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.color} 
                          className={onStatusClick ? "hover:opacity-80 transition-opacity" : ""}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend 
                      onClick={(e) => {
                        const item = outcomeData.find(d => d.name === e.value);
                        if (item && onStatusClick) {
                          onStatusClick(item.status);
                        }
                      }}
                      wrapperStyle={{ cursor: onStatusClick ? 'pointer' : 'default' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No outcome data yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Lost Reason Analysis Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Lost Order Analysis</CardTitle>
            <CardDescription>Reasons for lost orders - click bars to filter</CardDescription>
          </CardHeader>
          <CardContent>
            {lostReasonData.length > 0 ? (
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={lostReasonData} layout="vertical" margin={{ left: 20, right: 20 }}>
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar 
                      dataKey="count" 
                      fill="hsl(0, 84%, 60%)" 
                      radius={[0, 4, 4, 0]} 
                      onClick={handleBarClick}
                      style={{ cursor: onLostReasonClick ? 'pointer' : 'default' }}
                      className={onLostReasonClick ? "hover:opacity-80 transition-opacity" : ""}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No lost orders recorded yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Conversion Insights */}
      {totalEnquiries >= 5 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              {parseFloat(conversionRate) >= 50 ? (
                <TrendingUp className="w-5 h-5 text-green-600" />
              ) : (
                <TrendingDown className="w-5 h-5 text-destructive" />
              )}
              Conversion Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div 
                className={onLostReasonClick && lostReasonData.length > 0 ? "cursor-pointer hover:bg-muted/50 p-2 rounded-lg transition-colors" : ""}
                onClick={() => {
                  if (onLostReasonClick && lostReasonData.length > 0) {
                    const topReason = lostReasonData.sort((a, b) => b.count - a.count)[0];
                    onLostReasonClick(topReason.shortName);
                  }
                }}
              >
                <p className="text-sm text-muted-foreground mb-1">Top Loss Reason</p>
                <p className="font-medium">
                  {lostReasonData.length > 0
                    ? lostReasonData.sort((a, b) => b.count - a.count)[0].fullLabel
                    : "No data"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Win Rate Target</p>
                <p className="font-medium">
                  {parseFloat(conversionRate) >= 50 ? (
                    <span className="text-green-600">Meeting target (≥50%)</span>
                  ) : (
                    <span className="text-amber-600">Below target ({conversionRate}% / 50%)</span>
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
