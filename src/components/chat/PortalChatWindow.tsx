import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Send, X, Loader2, Sparkles, Trash2, Zap, BarChart3, Package, ClipboardList, BrainCircuit, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { ChatMessage, stopSpeaking } from './ChatMessage';
import { VoiceInputButton } from './VoiceInputButton';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-portal-assistant`;
const STORAGE_KEY = 'xboom-ai-chat-history';
const MAX_STORED_MESSAGES = 50;

const QUICK_PROMPTS = [
  { icon: BarChart3, label: "Dashboard summary", prompt: "Show me today's dashboard summary" },
  { icon: Package, label: "Pending orders", prompt: "What are the pending orders?" },
  { icon: Zap, label: "Hot leads", prompt: "Show me all hot leads" },
  { icon: ClipboardList, label: "My tasks", prompt: "What tasks are assigned to me?" },
  { icon: BrainCircuit, label: "Daily briefing", prompt: "Give me my daily briefing — overdue payments, stalled deals, pending approvals, and any anomalies" },
];

interface PortalChatWindowProps {
  onClose: () => void;
}

function loadMessages(): Message[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Message[];
      return parsed.slice(-MAX_STORED_MESSAGES);
    }
  } catch { /* ignore */ }
  return [];
}

function saveMessages(messages: Message[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)));
  } catch { /* ignore */ }
}

export function PortalChatWindow({ onClose }: PortalChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>(() => loadMessages());
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    saveMessages(messages);
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Stop speaking when component unmounts or chat is cleared
  useEffect(() => {
    return () => stopSpeaking();
  }, []);

  const streamChat = useCallback(async (userMessage: string) => {
    const userMsg: Message = { role: 'user', content: userMessage };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setInput('');
    setIsLoading(true);

    // Stop any current speech when new message is sent
    stopSpeaking();

    let assistantContent = '';

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Please log in to use the AI assistant');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ messages: allMessages }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get response');
      }
      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const finishReason = parsed.choices?.[0]?.finish_reason;
            if (finishReason === 'error') {
              console.warn('AI returned error finish_reason:', parsed);
              break;
            }
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
                return updated;
              });
            }
          } catch {
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }

      if (!assistantContent.trim()) {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: 'I processed your request but couldn\'t generate a response. Please try rephrasing your question.' };
          return updated;
        });
      }
    } catch (error) {
      console.error('Chat error:', error);
      let errorMsg = 'Unknown error';
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMsg = 'The request took too long. Please try a simpler query.';
        } else if (error.message === 'Load failed' || error.message === 'Failed to fetch') {
          errorMsg = 'Network error — the request may have timed out. Please try again.';
        } else {
          errorMsg = error.message;
        }
      }
      setMessages(prev => [
        ...prev.filter(m => m.content !== ''),
        { role: 'assistant', content: `Sorry, I encountered an error: ${errorMsg}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    streamChat(input.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleVoiceTranscript = useCallback((text: string) => {
    setInput(text);
    // Enable voice mode automatically when using mic
    setVoiceMode(true);
    setTimeout(() => {
      if (text.trim() && !isLoading) {
        streamChat(text.trim());
      }
    }, 300);
  }, [isLoading, streamChat]);

  const toggleVoiceMode = useCallback(() => {
    setVoiceMode(prev => {
      if (prev) stopSpeaking();
      return !prev;
    });
  }, []);

  const clearChat = useCallback(() => {
    stopSpeaking();
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <div className={cn(
      "fixed z-50 flex flex-col animate-scale-in",
      "bg-background/95 backdrop-blur-xl border border-border/60 shadow-2xl",
      "bottom-4 left-4 w-[400px] h-[620px] rounded-2xl",
      "max-sm:inset-0 max-sm:w-full max-sm:h-full max-sm:rounded-none max-sm:bottom-0 max-sm:left-0"
    )}>
      {/* Header */}
      <div className="relative overflow-hidden rounded-t-2xl max-sm:rounded-t-none">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent" />
        <div className="relative flex items-center justify-between px-4 py-3 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className="relative p-2 rounded-xl bg-primary/15">
              <Bot className="w-5 h-5 text-primary" />
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success border-2 border-background" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground leading-none">XBoom AI</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5 font-medium tracking-wide uppercase">
                {voiceMode ? '🔊 Voice Mode Active' : 'Intelligent Portal Assistant'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* Voice mode toggle */}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 rounded-lg transition-colors",
                voiceMode
                  ? "text-primary bg-primary/15 hover:bg-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
              onClick={toggleVoiceMode}
              title={voiceMode ? "Disable voice replies" : "Enable voice replies"}
            >
              {voiceMode ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </Button>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                onClick={clearChat}
                title="Clear chat"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-3" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-6">
            <div className="relative mb-5">
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-pulse scale-150" />
              <div className="relative p-4 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10">
                <Sparkles className="w-7 h-7 text-primary" />
              </div>
            </div>

            <h3 className="text-base font-bold text-foreground mb-1">What can I help with?</h3>
            <p className="text-xs text-muted-foreground mb-5 max-w-[260px] leading-relaxed">
              Query, analyze, or take action on orders, leads, inventory & more — powered by AI.
            </p>

            <div className="grid grid-cols-2 gap-2 w-full max-w-[320px]">
              {QUICK_PROMPTS.map(({ icon: Icon, label, prompt }, i) => (
                <button
                  key={i}
                  onClick={() => !isLoading && streamChat(prompt)}
                  className={cn(
                    "flex items-center gap-2 p-2.5 rounded-xl text-left",
                    "bg-card border border-border/50 hover:border-primary/30",
                    "hover:bg-primary/5 transition-all duration-200",
                    "group cursor-pointer",
                    i === 4 && "col-span-2"
                  )}
                >
                  <div className="p-1.5 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors shrink-0">
                    <Icon className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span className="text-[11px] font-medium text-foreground leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg, i) => {
              const isLastAssistant = msg.role === 'assistant' && i === messages.length - 1;
              const isCurrentlyStreaming = isLoading && isLastAssistant;
              return (
                <ChatMessage
                  key={i}
                  role={msg.role}
                  content={msg.content}
                  isStreaming={isCurrentlyStreaming}
                  autoSpeak={voiceMode && isLastAssistant && !isCurrentlyStreaming}
                />
              );
            })}
            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex gap-2">
                <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="bg-muted rounded-xl rounded-bl-sm px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse" />
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse [animation-delay:150ms]" />
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/20 animate-pulse [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Input area */}
      <div className="px-3 py-2.5 border-t border-border/40 shrink-0">
        <form onSubmit={handleSubmit} className="relative flex items-end gap-1.5">
          <VoiceInputButton onTranscript={handleVoiceTranscript} disabled={isLoading} />
          <div className="relative flex-1">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about orders, leads, inventory..."
              disabled={isLoading}
              rows={1}
              className={cn(
                "w-full resize-none rounded-xl border border-border/60 bg-card",
                "px-4 py-2.5 pr-12 text-sm placeholder:text-muted-foreground",
                "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40",
                "disabled:opacity-50 transition-all"
              )}
            />
            <Button
              type="submit"
              disabled={isLoading || !input.trim()}
              size="icon"
              className={cn(
                "absolute right-1.5 bottom-1.5 h-8 w-8 rounded-lg",
                "transition-all duration-200",
                input.trim() && !isLoading
                  ? "bg-primary text-primary-foreground shadow-md hover:shadow-lg"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </form>
        <p className="text-[9px] text-muted-foreground text-center mt-1.5 tracking-wide">
          {voiceMode ? '🔊 Voice replies ON — tap speaker icon to disable' : 'AI responses are based on your role-level data access'}
        </p>
      </div>
    </div>
  );
}
