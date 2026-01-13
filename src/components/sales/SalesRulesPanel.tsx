import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Trophy, Star, Target, Gift, TrendingUp, Phone, 
  Users, MessageSquare, ThumbsUp, ShoppingBag, Lightbulb,
  Award, Zap, Crown, Medal
} from "lucide-react";

const pointRules = [
  {
    category: "Order Creation",
    icon: ShoppingBag,
    color: "from-green-500 to-emerald-600",
    rules: [
      { action: "New Order Created", points: 10, description: "Base points for every new order" },
      { action: "Order Value Bonus", points: "+1 per ₹10K", description: "Additional points based on order value" },
    ]
  },
  {
    category: "Delivery Completion",
    icon: Target,
    color: "from-blue-500 to-indigo-600",
    rules: [
      { action: "Order Delivered", points: 25, description: "Points when order is successfully delivered" },
    ]
  },
  {
    category: "Customer Testimonials",
    icon: MessageSquare,
    color: "from-purple-500 to-violet-600",
    rules: [
      { action: "5-Star Rating", points: 50, description: "Customer gives 5-star rating" },
      { action: "4-Star Rating", points: 35, description: "Customer gives 4-star rating" },
      { action: "3-Star Rating", points: 20, description: "Customer gives 3-star rating" },
      { action: "1-2 Star Rating", points: 10, description: "Customer gives 1-2 star rating" },
      { action: "Testimonial Approved", points: 15, description: "Bonus when testimonial is approved by admin" },
    ]
  },
  {
    category: "Lead & Calls",
    icon: Phone,
    color: "from-orange-500 to-red-600",
    rules: [
      { action: "Maximum Lead Calls", points: "Bonus", description: "Top caller of the day gets bonus points" },
    ]
  },
  {
    category: "Customer Engagement",
    icon: Users,
    color: "from-pink-500 to-rose-600",
    rules: [
      { action: "Repeat Customer Order", points: "Bonus", description: "Orders from returning customers" },
      { action: "Customer Reference", points: "Bonus", description: "New customer from referral" },
      { action: "Customer Review", points: "Bonus", description: "Collecting customer reviews" },
    ]
  },
  {
    category: "Suggestions",
    icon: Lightbulb,
    color: "from-yellow-500 to-amber-600",
    rules: [
      { action: "Suggestion Submitted", points: "Bonus", description: "Submit improvement suggestions" },
      { action: "Suggestion Implemented", points: "Bonus", description: "Your suggestion gets implemented" },
    ]
  },
];

const levels = [
  { name: "Rookie", minPoints: 0, icon: Star, color: "text-gray-500" },
  { name: "Pro", minPoints: 100, icon: Medal, color: "text-blue-500" },
  { name: "Expert", minPoints: 300, icon: Award, color: "text-purple-500" },
  { name: "Champion", minPoints: 600, icon: Trophy, color: "text-amber-500" },
  { name: "Legend", minPoints: 1000, icon: Crown, color: "text-yellow-500" },
];

export function SalesRulesPanel() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-primary to-primary/70">
              <Trophy className="w-8 h-8 text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Sales Gamification Rules</h2>
              <p className="text-muted-foreground">
                Earn points, climb the leaderboard, and unlock rewards!
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Levels Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-500" />
            Level Progression
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {levels.map((level) => {
              const LevelIcon = level.icon;
              return (
                <div 
                  key={level.name}
                  className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors text-center"
                >
                  <LevelIcon className={`w-8 h-8 mx-auto mb-2 ${level.color}`} />
                  <p className="font-semibold">{level.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {level.minPoints}+ pts
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Point Rules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {pointRules.map((category) => {
          const CategoryIcon = category.icon;
          return (
            <Card key={category.category} className="overflow-hidden">
              <div className={`h-2 bg-gradient-to-r ${category.color}`} />
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${category.color}`}>
                    <CategoryIcon className="w-4 h-4 text-white" />
                  </div>
                  {category.category}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {category.rules.map((rule, idx) => (
                  <div 
                    key={idx}
                    className="flex items-start justify-between gap-3 p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-sm">{rule.action}</p>
                      <p className="text-xs text-muted-foreground">{rule.description}</p>
                    </div>
                    <Badge 
                      variant="secondary" 
                      className="bg-gradient-to-r from-primary/20 to-primary/10 text-primary shrink-0"
                    >
                      <Zap className="w-3 h-3 mr-1" />
                      {rule.points}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tips Card */}
      <Card className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-red-500/10 border-amber-500/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600">
              <Gift className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-lg mb-2">Pro Tips to Earn More Points</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  Focus on high-value orders for maximum points
                </li>
                <li className="flex items-center gap-2">
                  <ThumbsUp className="w-4 h-4 text-blue-500" />
                  Collect 5-star testimonials for 50 points each
                </li>
                <li className="flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-yellow-500" />
                  Submit valuable suggestions to earn bonus points
                </li>
                <li className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-500" />
                  Build customer relationships for repeat business bonuses
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
