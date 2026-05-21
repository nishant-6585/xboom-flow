import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DataErrorStateProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Error-state block for list/table regions, with optional retry. Surfaces
 * a friendly message and uses semantic tokens.
 */
export function DataErrorState({
  message = "Something went wrong loading this data.",
  onRetry,
  className,
}: DataErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-12 px-4 gap-3",
        className,
      )}
    >
      <div className="p-3 rounded-full bg-destructive/10">
        <AlertCircle className="h-6 w-6 text-destructive" aria-hidden />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">Couldn't load data</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      )}
    </div>
  );
}