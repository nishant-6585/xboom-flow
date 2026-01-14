import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, Clock } from "lucide-react";
import { Task, TimerStatus } from "@/hooks/useTasks";

interface TaskTimerProps {
  task: Task;
  onStart: () => void;
  onPause: () => void;
  compact?: boolean;
}

export function formatTimeSpent(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

export function TaskTimer({ task, onStart, onPause, compact = false }: TaskTimerProps) {
  const [currentTime, setCurrentTime] = useState(0);

  // Calculate total time including running timer
  useEffect(() => {
    const calculateTime = () => {
      let total = task.time_spent_seconds || 0;
      if (task.timer_status === 'running' && task.timer_started_at) {
        const elapsed = Math.floor(
          (new Date().getTime() - new Date(task.timer_started_at).getTime()) / 1000
        );
        total += elapsed;
      }
      return total;
    };

    setCurrentTime(calculateTime());

    // Update every second if timer is running
    if (task.timer_status === 'running') {
      const interval = setInterval(() => {
        setCurrentTime(calculateTime());
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [task.time_spent_seconds, task.timer_started_at, task.timer_status]);

  if (task.stage === 'completed') {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Clock className="w-4 h-4" />
        <span className={compact ? "text-xs" : "text-sm"}>
          {formatTimeSpent(task.time_spent_seconds || 0)}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className={`flex items-center gap-1 font-mono ${
        task.timer_status === 'running' 
          ? 'text-green-600 dark:text-green-400' 
          : 'text-muted-foreground'
      }`}>
        <Clock className={`w-4 h-4 ${task.timer_status === 'running' ? 'animate-pulse' : ''}`} />
        <span className={compact ? "text-xs" : "text-sm font-medium"}>
          {formatTimeSpent(currentTime)}
        </span>
      </div>
      
      {task.timer_status === 'running' ? (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            onPause();
          }}
          className="h-7 px-2"
        >
          <Pause className="w-3 h-3 mr-1" />
          {!compact && "Pause"}
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            onStart();
          }}
          className="h-7 px-2"
        >
          <Play className="w-3 h-3 mr-1" />
          {!compact && (task.timer_status === 'paused' ? "Resume" : "Start")}
        </Button>
      )}
    </div>
  );
}
