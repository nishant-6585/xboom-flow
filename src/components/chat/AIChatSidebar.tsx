import { useState } from 'react';
import { Plus, MessageSquare, Trash2, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { AIChat } from '@/hooks/useAIChats';

interface AIChatSidebarProps {
  chats: AIChat[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
  onRenameChat: (chatId: string, title: string) => void;
}

export function AIChatSidebar({
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onRenameChat,
}: AIChatSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const startEdit = (chat: AIChat) => {
    setEditingId(chat.id);
    setEditTitle(chat.title);
  };

  const commitEdit = () => {
    if (editingId && editTitle.trim()) {
      onRenameChat(editingId, editTitle.trim());
    }
    setEditingId(null);
  };

  const groupChatsByDate = (chats: AIChat[]) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const groups: { label: string; chats: AIChat[] }[] = [
      { label: 'Today', chats: [] },
      { label: 'Yesterday', chats: [] },
      { label: 'Previous 7 Days', chats: [] },
      { label: 'Older', chats: [] },
    ];

    for (const chat of chats) {
      const d = new Date(chat.updated_at);
      if (d.toDateString() === today.toDateString()) groups[0].chats.push(chat);
      else if (d.toDateString() === yesterday.toDateString()) groups[1].chats.push(chat);
      else if (d >= weekAgo) groups[2].chats.push(chat);
      else groups[3].chats.push(chat);
    }

    return groups.filter(g => g.chats.length > 0);
  };

  const groups = groupChatsByDate(chats);

  return (
    <div className="flex flex-col h-full bg-muted/30 border-r border-border/40">
      <div className="p-3 border-b border-border/40">
        <Button
          onClick={onNewChat}
          className="w-full gap-2 rounded-xl"
          size="sm"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-3">
          {groups.map(group => (
            <div key={group.label}>
              <p className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.chats.map(chat => (
                  <div
                    key={chat.id}
                    className={cn(
                      "group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors",
                      chat.id === activeChatId
                        ? "bg-primary/10 text-foreground"
                        : "hover:bg-muted text-foreground/80 hover:text-foreground"
                    )}
                    onClick={() => editingId !== chat.id && onSelectChat(chat.id)}
                  >
                    <MessageSquare className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                    {editingId === chat.id ? (
                      <div className="flex-1 flex items-center gap-1 min-w-0">
                        <input
                          value={editTitle}
                          onChange={e => setEditTitle(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null); }}
                          className="flex-1 text-xs bg-background border border-border rounded px-1.5 py-0.5 min-w-0"
                          autoFocus
                          onClick={e => e.stopPropagation()}
                        />
                        <button onClick={(e) => { e.stopPropagation(); commitEdit(); }} className="text-primary hover:text-primary/80">
                          <Check className="w-3 h-3" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="text-muted-foreground hover:text-foreground">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="flex-1 text-xs truncate">{chat.title}</span>
                        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); startEdit(chat); }}
                            className="p-0.5 rounded hover:bg-background/80 text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); onDeleteChat(chat.id); }}
                            className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {chats.length === 0 && (
            <div className="px-3 py-8 text-center">
              <MessageSquare className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">No conversations yet</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
