import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, Square, ChevronDown, Check, Timer, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type PomodoroState = "idle" | "running" | "paused";

interface SimpleTask {
  id: string;
  title: string;
  stage: string;
}

const POMODORO_DURATION = 25 * 60; // 25 minutes in seconds

export function PomodoroTimer() {
  const { user } = useAuth();
  const [state, setState] = useState<PomodoroState>("idle");
  const [secondsLeft, setSecondsLeft] = useState(POMODORO_DURATION);
  const [selectedTask, setSelectedTask] = useState<SimpleTask | null>(null);
  const [tasks, setTasks] = useState<SimpleTask[]>([]);
  const [taskOpen, setTaskOpen] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch user's active tasks
  useEffect(() => {
    if (!user?.id) return;
    const fetchTasks = async () => {
      const { data } = await supabase
        .from("tasks")
        .select("id, title, stage")
        .eq("assigned_to", user.id)
        .in("stage", ["new", "started", "in_review", "on_hold"])
        .order("updated_at", { ascending: false })
        .limit(20);
      if (data) setTasks(data as SimpleTask[]);
    };
    fetchTasks();
  }, [user?.id]);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    setState("running");
    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearTimer();
          setState("idle");
          setSecondsLeft(POMODORO_DURATION);
          setShowSuccess(true);
          setTimeout(() => setShowSuccess(false), 3000);
          return POMODORO_DURATION;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearTimer]);

  const pauseTimer = useCallback(() => {
    clearTimer();
    setState("paused");
  }, [clearTimer]);

  const stopTimer = useCallback(() => {
    clearTimer();
    setState("idle");
    if (secondsLeft < POMODORO_DURATION) {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }
    setSecondsLeft(POMODORO_DURATION);
  }, [clearTimer, secondsLeft]);

  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const progress = 1 - secondsLeft / POMODORO_DURATION;
  const circumference = 2 * Math.PI * 18;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <div className="relative flex items-center gap-1.5">
      {/* Success animation overlay */}
      {showSuccess && (
        <div className="absolute -inset-3 z-50 flex items-center justify-center pointer-events-none">
          <div className="animate-scale-in flex items-center gap-1.5 bg-green-500/90 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg backdrop-blur-sm">
            <Sparkles className="w-3.5 h-3.5" />
            Done!
          </div>
          {/* Burst particles */}
          {[...Array(6)].map((_, i) => (
            <span
              key={i}
              className="absolute w-1.5 h-1.5 rounded-full bg-green-400"
              style={{
                animation: `pomodoro-burst 0.8s ease-out forwards`,
                animationDelay: `${i * 0.05}s`,
                transform: `rotate(${i * 60}deg) translateY(-8px)`,
              }}
            />
          ))}
        </div>
      )}

      {/* Timer ring + time */}
      <button
        onClick={() => {
          if (state === "idle") startTimer();
          else if (state === "running") pauseTimer();
          else startTimer();
        }}
        className={cn(
          "relative flex items-center gap-2 px-2 py-1 rounded-lg transition-all duration-200",
          "hover:bg-muted/60",
          state === "running" && "bg-primary/5"
        )}
      >
        <div className="relative w-10 h-10 flex items-center justify-center">
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 40 40">
            {/* Track */}
            <circle
              cx="20" cy="20" r="18"
              fill="none"
              strokeWidth="2"
              className="stroke-muted-foreground/20"
            />
            {/* Progress */}
            {state !== "idle" && (
              <circle
                cx="20" cy="20" r="18"
                fill="none"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className={cn(
                  "transition-all duration-1000",
                  state === "running" ? "stroke-primary" : "stroke-yellow-500"
                )}
              />
            )}
          </svg>
          {state === "idle" ? (
            <Timer className="w-4 h-4 text-muted-foreground" />
          ) : (
            <span
              className={cn(
                "text-[11px] font-mono font-bold tabular-nums leading-none",
                state === "running" ? "text-primary" : "text-yellow-500"
              )}
            >
              {minutes}:{seconds.toString().padStart(2, "0")}
            </span>
          )}
        </div>

        {/* Play/Pause indicator */}
        {state === "idle" && (
          <span className="hidden md:inline text-xs text-muted-foreground font-medium">
            Focus
          </span>
        )}
      </button>

      {/* Stop button (only when active) */}
      {state !== "idle" && (
        <button
          onClick={stopTimer}
          className="p-1 rounded-md hover:bg-destructive/10 transition-colors"
        >
          <Square className="w-3.5 h-3.5 text-destructive/70" />
        </button>
      )}

      {/* Task selector */}
      <Popover open={taskOpen} onOpenChange={setTaskOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "hidden md:flex items-center gap-1 max-w-[140px] px-2 py-1 rounded-md text-xs transition-colors",
              "hover:bg-muted/60 text-muted-foreground",
              selectedTask && "text-foreground"
            )}
          >
            <span className="truncate">
              {selectedTask ? selectedTask.title : "Pick task"}
            </span>
            <ChevronDown className="w-3 h-3 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-1" align="center">
          <div className="max-h-52 overflow-y-auto">
            {tasks.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No active tasks</p>
            ) : (
              tasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => {
                    setSelectedTask(task);
                    setTaskOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left text-xs transition-colors",
                    "hover:bg-muted/60",
                    selectedTask?.id === task.id && "bg-primary/10 text-primary"
                  )}
                >
                  {selectedTask?.id === task.id && <Check className="w-3 h-3 shrink-0" />}
                  <span className="truncate">{task.title}</span>
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
