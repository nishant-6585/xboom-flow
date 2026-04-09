import { Users, Target, Award, DollarSign } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { LeadDistributionChart } from "./LeadDistributionChart";
import { useSalesLeaderboard } from "@/hooks/useSalesGamification";
import { usePipelineOrders } from "@/hooks/usePipelineOrders";

interface ManagerDashboardProps {
  startDate: string;
  endDate: string;
}

export function ManagerDashboard({ startDate, endDate }: ManagerDashboardProps) {
  const { leaderboard } = useSalesLeaderboard(startDate, endDate);
  const { pipelineOrders } = usePipelineOrders();

  const totalLeads = leaderboard?.reduce((sum, e) => sum + e.leads_handled, 0) || 0;
  const totalOrders = leaderboard?.reduce((sum, e) => sum + e.orders_won, 0) || 0;
  const totalPipeline = leaderboard?.reduce((sum, e) => sum + Number(e.total_pipeline_value), 0) || 0;
  const totalPoints = leaderboard?.reduce((sum, e) => sum + e.total_points, 0) || 0;

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="overflow-hidden">
          <CardContent className="p-4 bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-5 h-5" />
              <span className="text-sm opacity-80">Team Leads</span>
            </div>
            <p className="text-3xl font-bold">{totalLeads}</p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardContent className="p-4 bg-gradient-to-br from-green-500 to-emerald-600 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Award className="w-5 h-5" />
              <span className="text-sm opacity-80">Orders Won</span>
            </div>
            <p className="text-3xl font-bold">{totalOrders}</p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardContent className="p-4 bg-gradient-to-br from-purple-500 to-violet-600 text-white">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-5 h-5" />
              <span className="text-sm opacity-80">Pipeline Value</span>
            </div>
            <p className="text-3xl font-bold">₹{(totalPipeline / 100000).toFixed(1)}L</p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardContent className="p-4 bg-gradient-to-br from-amber-500 to-orange-600 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-5 h-5" />
              <span className="text-sm opacity-80">Team Points</span>
            </div>
            <p className="text-3xl font-bold">{totalPoints.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Lead Distribution */}
      <LeadDistributionChart startDate={startDate} endDate={endDate} />
    </div>
  );
}
