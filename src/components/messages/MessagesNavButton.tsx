import { Link } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDmThreads } from "@/hooks/useDmThreads";

export function MessagesNavButton() {
  const { totalUnread } = useDmThreads();
  return (
    <Button asChild variant="ghost" size="icon" className="relative h-9 w-9">
      <Link to="/messages" aria-label="Messages">
        <MessageSquare className="h-5 w-5" />
        {totalUnread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold grid place-items-center">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </Link>
    </Button>
  );
}