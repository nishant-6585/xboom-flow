import { useState } from 'react';
import { Bot, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PortalChatWindow } from './PortalChatWindow';
import { cn } from '@/lib/utils';

export function PortalChatButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating pill button — bottom-left */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={cn(
            "fixed bottom-6 left-6 z-40 flex items-center gap-2",
            "h-12 pl-3 pr-4 rounded-full",
            "bg-primary text-primary-foreground shadow-lg",
            "transition-all duration-300 hover:shadow-xl hover:scale-105 active:scale-95",
            "animate-fade-in",
            "md:bottom-8 md:left-8"
          )}
        >
          <div className="relative">
            <Bot className="h-5 w-5" />
            <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-success animate-pulse" />
          </div>
          <span className="text-sm font-medium hidden sm:inline">Ask AI</span>
        </button>
      )}

      {/* Chat panel */}
      {isOpen && <PortalChatWindow onClose={() => setIsOpen(false)} />}
    </>
  );
}
