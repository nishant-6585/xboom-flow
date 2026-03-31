import { Trophy, Medal, Crown, Star, TrendingUp, Target, Zap, IndianRupee } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSalesLeaderboard } from "@/hooks/useSalesGamification";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface SalesLeaderboardProps {
  startDate?: string;
  endDate?: string;
}

export function SalesLeaderboard({ startDate, endDate }: SalesLeaderboardProps) {
  const { leaderboard, isLoading } = useSalesLeaderboard(startDate, endDate);
  const { user } = useAuth();

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            Sales Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-muted rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="w-6 h-6 text-yellow-500 animate-pulse" />;
      case 2:
        return <Medal className="w-5 h-5 text-gray-400" />;
      case 3:
        return <Medal className="w-5 h-5 text-amber-600" />;
      default:
        return <span className="w-6 h-6 flex items-center justify-center text-sm font-bold text-muted-foreground">#{rank}</span>;
    }
  };

  const getRankStyle = (rank: number) => {
    switch (rank) {
      case 1:
        return "bg-gradient-to-r from-yellow-500/20 via-amber-500/10 to-yellow-500/20 border-yellow-500/50 shadow-yellow-500/20 shadow-lg";
      case 2:
        return "bg-gradient-to-r from-gray-400/20 via-gray-300/10 to-gray-400/20 border-gray-400/50";
      case 3:
        return "bg-gradient-to-r from-amber-600/20 via-amber-500/10 to-amber-600/20 border-amber-600/50";
      default:
        return "bg-muted/50 border-border";
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b">
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-500" />
          Sales Leaderboard
          <Zap className="w-4 h-4 text-primary ml-auto animate-pulse" />
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {!leaderboard || leaderboard.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Target className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No sales data yet. Start logging activities!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {leaderboard.map((entry) => (
              <div
                key={entry.user_id}
                className={cn(
                  "relative p-4 rounded-lg border transition-all hover:scale-[1.02]",
                  getRankStyle(entry.rank),
                  entry.user_id === user?.id && "ring-2 ring-primary"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0">
                    {getRankIcon(entry.rank)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold truncate">
                        {entry.user_name}
                        {entry.user_id === user?.id && (
                          <span className="ml-2 text-xs text-primary">(You)</span>
                        )}
                      </p>
                      {entry.rank === 1 && (
                        <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Target className="w-3 h-3" />
                        {entry.leads_handled} leads
                      </span>
                      <span className="flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        {entry.orders_won} won
                      </span>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-lg font-bold text-primary">
                      <Zap className="w-4 h-4" />
                      {entry.total_points.toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground">points</p>
                  </div>
                </div>
                
                {entry.rank <= 3 && (
                  <div className="absolute top-0 right-0 w-16 h-16 overflow-hidden">
                    <div className={cn(
                      "absolute top-2 -right-8 w-24 text-center text-xs font-bold py-1 rotate-45",
                      entry.rank === 1 && "bg-yellow-500 text-yellow-900",
                      entry.rank === 2 && "bg-gray-400 text-gray-900",
                      entry.rank === 3 && "bg-amber-600 text-amber-100"
                    )}>
                      #{entry.rank}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
