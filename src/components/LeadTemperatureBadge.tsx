import { Badge } from "@/components/ui/badge";
import { Flame, Thermometer, Snowflake, Star } from "lucide-react";
import { cn } from "@/lib/utils";

export type LeadTemperature = "hot" | "warm" | "cold";

interface LeadTemperatureBadgeProps {
  temperature: LeadTemperature;
  isMegaDeal?: boolean;
  showLabel?: boolean;
  size?: "sm" | "md";
}

export const LEAD_TEMPERATURES: { value: LeadTemperature; label: string }[] = [
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "cold", label: "Cold" },
];

const temperatureConfig: Record<LeadTemperature, { 
  icon: typeof Flame; 
  label: string; 
  colorClass: string; 
  bgClass: string;
  iconColor: string;
}> = {
  hot: {
    icon: Flame,
    label: "Hot",
    colorClass: "text-orange-600 dark:text-orange-400",
    bgClass: "bg-orange-500/10 border-orange-500/30 hover:bg-orange-500/20",
    iconColor: "text-orange-500",
  },
  warm: {
    icon: Thermometer,
    label: "Warm",
    colorClass: "text-yellow-600 dark:text-yellow-400",
    bgClass: "bg-yellow-500/10 border-yellow-500/30 hover:bg-yellow-500/20",
    iconColor: "text-yellow-500",
  },
  cold: {
    icon: Snowflake,
    label: "Cold",
    colorClass: "text-blue-600 dark:text-blue-400",
    bgClass: "bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20",
    iconColor: "text-blue-500",
  },
};

export function LeadTemperatureBadge({ 
  temperature, 
  isMegaDeal = false, 
  showLabel = true,
  size = "md" 
}: LeadTemperatureBadgeProps) {
  const config = temperatureConfig[temperature];
  const Icon = config.icon;
  
  const sizeClasses = size === "sm" 
    ? "text-xs px-1.5 py-0.5 gap-1" 
    : "text-xs px-2 py-1 gap-1.5";
  
  const iconSize = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";

  return (
    <div className="flex items-center gap-1.5">
      {/* Hot lead fire animation */}
      {temperature === "hot" && (
        <div className="relative">
          <Flame className={cn(
            iconSize,
            "text-orange-500 animate-pulse"
          )} />
          <Flame className={cn(
            iconSize,
            "text-orange-400 absolute top-0 left-0 animate-ping opacity-50"
          )} />
        </div>
      )}
      
      <Badge 
        variant="outline" 
        className={cn(
          sizeClasses,
          config.bgClass,
          config.colorClass,
          "font-medium border transition-colors"
        )}
      >
        {temperature !== "hot" && <Icon className={cn(iconSize, config.iconColor)} />}
        {showLabel && <span>{config.label}</span>}
      </Badge>

      {/* Mega Deal indicator */}
      {isMegaDeal && (
        <Badge 
          variant="outline" 
          className={cn(
            sizeClasses,
            "bg-gradient-to-r from-amber-500/20 to-yellow-500/20",
            "border-amber-400/50 text-amber-600 dark:text-amber-400",
            "font-semibold"
          )}
        >
          <Star className={cn(iconSize, "text-amber-500 fill-amber-500")} />
          {showLabel && <span>Mega</span>}
        </Badge>
      )}
    </div>
  );
}

export function LeadTemperatureIcon({ 
  temperature, 
  className 
}: { 
  temperature: LeadTemperature; 
  className?: string;
}) {
  if (temperature === "hot") {
    return (
      <div className="relative inline-flex">
        <Flame className={cn("w-4 h-4 text-orange-500 animate-pulse", className)} />
      </div>
    );
  }
  
  const config = temperatureConfig[temperature];
  const Icon = config.icon;
  return <Icon className={cn("w-4 h-4", config.iconColor, className)} />;
}
