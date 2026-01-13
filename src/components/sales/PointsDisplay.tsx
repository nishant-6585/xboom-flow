import { Zap, TrendingUp, Award, Star, Flame, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSalesPoints } from "@/hooks/useSalesGamification";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export function PointsDisplay() {
  const { points, totalPoints, isLoading } = useSalesPoints();

  // Calculate level based on points
  const getLevel = (pts: number) => {
    if (pts >= 10000) return { name: 'Legend', level: 10, color: 'text-yellow-500', icon: Star };
    if (pts >= 7500) return { name: 'Champion', level: 9, color: 'text-purple-500', icon: Award };
    if (pts >= 5000) return { name: 'Master', level: 8, color: 'text-blue-500', icon: Target };
    if (pts >= 3500) return { name: 'Expert', level: 7, color: 'text-green-500', icon: Flame };
    if (pts >= 2500) return { name: 'Advanced', level: 6, color: 'text-teal-500', icon: TrendingUp };
    if (pts >= 1500) return { name: 'Skilled', level: 5, color: 'text-indigo-500', icon: Zap };
    if (pts >= 1000) return { name: 'Intermediate', level: 4, color: 'text-pink-500', icon: Zap };
    if (pts >= 500) return { name: 'Apprentice', level: 3, color: 'text-orange-500', icon: Zap };
    if (pts >= 200) return { name: 'Beginner', level: 2, color: 'text-cyan-500', icon: Zap };
    return { name: 'Rookie', level: 1, color: 'text-gray-500', icon: Zap };
  };

  const levelInfo = getLevel(totalPoints);
  const LevelIcon = levelInfo.icon;

  // Calculate progress to next level
  const levelThresholds = [0, 200, 500, 1000, 1500, 2500, 3500, 5000, 7500, 10000];
  const currentThreshold = levelThresholds[levelInfo.level - 1] || 0;
  const nextThreshold = levelThresholds[levelInfo.level] || totalPoints;
  const progress = levelInfo.level >= 10 ? 100 : ((totalPoints - currentThreshold) / (nextThreshold - currentThreshold)) * 100;

  // Group points by category
  const pointsByCategory = points?.reduce((acc, p) => {
    acc[p.category] = (acc[p.category] || 0) + p.points;
    return acc;
  }, {} as Record<string, number>) || {};

  const categoryColors: Record<string, string> = {
    lead_calls: 'from-blue-500 to-blue-600',
    sales_value: 'from-green-500 to-emerald-600',
    order_value: 'from-purple-500 to-purple-600',
    repeated_customer: 'from-amber-500 to-orange-600',
    reference: 'from-pink-500 to-rose-600',
    review: 'from-cyan-500 to-teal-600',
    testimonial: 'from-indigo-500 to-violet-600',
    product_closure: 'from-red-500 to-red-600',
    suggestion: 'from-yellow-500 to-amber-600',
  };

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardContent className="p-6">
          <div className="h-32 bg-muted rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-primary/20 via-primary/10 to-transparent border-b">
        <CardTitle className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary animate-pulse" />
          Your Points & Level
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 mb-4">
            <LevelIcon className={cn("w-10 h-10", levelInfo.color)} />
          </div>
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              {totalPoints.toLocaleString()}
            </span>
            <Zap className="w-6 h-6 text-primary" />
          </div>
          <p className={cn("text-lg font-semibold", levelInfo.color)}>
            Level {levelInfo.level}: {levelInfo.name}
          </p>
        </div>

        <div className="space-y-2 mb-6">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Progress to next level</span>
            <span className="font-medium">
              {levelInfo.level >= 10 ? 'MAX' : `${Math.round(progress)}%`}
            </span>
          </div>
          <Progress value={progress} className="h-3" />
          {levelInfo.level < 10 && (
            <p className="text-xs text-muted-foreground text-center">
              {nextThreshold - totalPoints} points to next level
            </p>
          )}
        </div>

        {Object.keys(pointsByCategory).length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">Points Breakdown</h4>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(pointsByCategory).map(([category, pts]) => (
                <div
                  key={category}
                  className={cn(
                    "p-3 rounded-lg text-white text-sm",
                    `bg-gradient-to-r ${categoryColors[category] || 'from-gray-500 to-gray-600'}`
                  )}
                >
                  <p className="font-semibold">{pts}</p>
                  <p className="text-xs opacity-80">{category.replace(/_/g, ' ')}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
