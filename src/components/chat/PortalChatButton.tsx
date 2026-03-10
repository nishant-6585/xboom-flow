import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PortalChatWindow } from './PortalChatWindow';
import { cn } from '@/lib/utils';

export function PortalChatButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className={cn(
            "fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg",
            "bg-primary hover:bg-primary/90 text-primary-foreground",
            "transition-transform hover:scale-105 active:scale-95",
            "md:bottom-8 md:right-8"
          )}
          size="icon"
          title="Ask XBoom AI"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      )}
      {isOpen && <PortalChatWindow onClose={() => setIsOpen(false)} />}
    </>
  );
}
