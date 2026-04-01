import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Bot, Send, X, Loader2, Sparkles, Zap, BarChart3, Package, ClipboardList, BrainCircuit, Volume2, VolumeX, Mic, PanelLeftClose, PanelLeft, Plus, RefreshCw, Users, DollarSign, Truck, Calendar, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { ChatMessage, stopSpeaking } from './ChatMessage';
import { VoiceInputButton } from './VoiceInputButton';
import { VoiceVisualizer } from './VoiceVisualizer';
import { AIChatSidebar } from './AIChatSidebar';
import { DailyBriefingWidget } from './DailyBriefingWidget';
import { useAIChats, type AIMessage } from '@/hooks/useAIChats';
import { useAuth } from '@/hooks/useAuth';

interface AIAction {
  label: string;
  action_type: string;
  payload: Record<string, unknown>;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  actions?: AIAction[];
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-portal-assistant`;

const ROLE_QUICK_PROMPTS: Record<string, { icon: React.ElementType; label: string; prompt: string }[]> = {
  hr: [
    { icon: Users, label: "Attendance today", prompt: "Show today's attendance summary — who's absent, late, or missing checkout" },
    { icon: Calendar, label: "Leave requests", prompt: "Show pending leave requests" },
    { icon: ClipboardList, label: "My tasks", prompt: "What tasks are assigned to me?" },
    { icon: BrainCircuit, label: "People briefing", prompt: "Give me my daily briefing — attendance anomalies, pending leaves, and payroll status" },
  ],
  sales: [
    { icon: Zap, label: "Hot leads", prompt: "Show me all hot leads" },
    { icon: BarChart3, label: "My pipeline", prompt: "Show my active pipeline deals" },
    { icon: ClipboardList, label: "My tasks", prompt: "What tasks are assigned to me?" },
    { icon: BrainCircuit, label: "Sales briefing", prompt: "Give me my daily briefing — hot leads, stalled deals, and follow-ups needed" },
  ],
  sales_manager: [
    { icon: BarChart3, label: "Team performance", prompt: "Show sales team performance this month — orders and pipeline by salesperson" },
    { icon: Zap, label: "Hot leads", prompt: "Show all hot leads across the team" },
    { icon: DollarSign, label: "Overdue payments", prompt: "Show overdue payments" },
    { icon: BrainCircuit, label: "Revenue briefing", prompt: "Give me my daily briefing — pipeline health, overdue payments, and hot leads" },
  ],
  finance: [
    { icon: DollarSign, label: "Overdue payments", prompt: "Show all overdue payments with aging analysis" },
    { icon: BarChart3, label: "Cashflow", prompt: "Show expected payments and cashflow this week" },
    { icon: Package, label: "Pending expenses", prompt: "Show pending expense approvals" },
    { icon: BrainCircuit, label: "Finance briefing", prompt: "Give me my daily briefing — overdue payments, cashflow gaps, and high-risk customers" },
  ],
  supply_chain: [
    { icon: Package, label: "Low stock", prompt: "Show low stock inventory items" },
    { icon: Truck, label: "Delayed procurement", prompt: "Show delayed procurement orders" },
    { icon: BarChart3, label: "Order status", prompt: "Show orders pending dispatch" },
    { icon: BrainCircuit, label: "Supply briefing", prompt: "Give me my daily briefing — low stock, delayed procurements, and pending orders" },
  ],
  admin: [
    { icon: BarChart3, label: "Dashboard summary", prompt: "Show me today's dashboard summary" },
    { icon: Package, label: "Pending orders", prompt: "What are the pending orders?" },
    { icon: Zap, label: "Hot leads", prompt: "Show me all hot leads" },
    { icon: ClipboardList, label: "My tasks", prompt: "What tasks are assigned to me?" },
    { icon: BrainCircuit, label: "Daily briefing", prompt: "Give me my daily briefing — overdue payments, stalled deals, pending approvals, and any anomalies" },
  ],
};

const DEFAULT_QUICK_PROMPTS = [
  { icon: BarChart3, label: "Dashboard summary", prompt: "Show me today's dashboard summary" },
  { icon: ClipboardList, label: "My tasks", prompt: "What tasks are assigned to me?" },
  { icon: BrainCircuit, label: "Daily briefing", prompt: "Give me my daily briefing" },
];

function getRoleAITitle(roles: string[]): string {
  if (roles.includes('admin')) return 'Command Center';
  if (roles.includes('hr')) return 'People Insights';
  if (roles.includes('finance')) return 'Cashflow Insights';
  if (roles.includes('sales_manager')) return 'Revenue Insights';
  if (roles.includes('sales')) return 'Revenue Insights';
  if (roles.includes('supply_chain')) return 'Supply Insights';
  if (roles.includes('it')) return 'IT Operations';
  if (roles.includes('marketing')) return 'Market Insights';
  return 'XBoom AI';
}

function getRoleSubtitle(roles: string[]): string {
  if (roles.includes('admin')) return 'Full organizational intelligence';
  if (roles.includes('hr')) return 'Workforce analytics & operations';
  if (roles.includes('finance')) return 'Payment tracking & risk analysis';
  if (roles.includes('sales_manager')) return 'Team performance & pipeline health';
  if (roles.includes('sales')) return 'Leads, deals & follow-ups';
  if (roles.includes('supply_chain')) return 'Inventory & procurement intelligence';
  if (roles.includes('it')) return 'Ticket management & system health';
  if (roles.includes('marketing')) return 'Lead quality & market trends';
  return 'Intelligent Portal Assistant';
}

interface PortalChatWindowProps {
  onClose: () => void;
}

export function PortalChatWindow({ onClose }: PortalChatWindowProps) {
  const { roles } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [readyToListen, setReadyToListen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 720, h: 650 });
  const resizingRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { chats, fetchChats, createChat, renameChat, deleteChat, fetchMessages, addMessage, autoTitleChat } = useAIChats();

  // Resize handlers
  const onResizeMouseDown = useCallback((edge: 'top-right' | 'right' | 'top', e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    startRef.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const newSize = { ...startRef.current };
      if (edge === 'right' || edge === 'top-right') {
        newSize.w = Math.max(480, Math.min(1400, startRef.current.w + (ev.clientX - startRef.current.x)));
      }
      if (edge === 'top' || edge === 'top-right') {
        newSize.h = Math.max(400, Math.min(900, startRef.current.h + (startRef.current.y - ev.clientY)));
      }
      setSize({ w: newSize.w, h: newSize.h });
    };

    const onMouseUp = () => {
      resizingRef.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [size]);

  // Load chats on mount
  useEffect(() => { fetchChats(); }, [fetchChats]);

  useEffect(() => { inputRef.current?.focus(); }, [activeChatId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    return () => stopSpeaking();
  }, []);

  const loadChat = useCallback(async (chatId: string) => {
    setActiveChatId(chatId);
    const msgs = await fetchMessages(chatId);
    setMessages(msgs.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })));
  }, [fetchMessages]);

  const handleNewChat = useCallback(async () => {
    stopSpeaking();
    setMessages([]);
    setActiveChatId(null);
    setReadyToListen(false);
    setAiSpeaking(false);
  }, []);

  const handleDeleteChat = useCallback(async (chatId: string) => {
    await deleteChat(chatId);
    if (chatId === activeChatId) {
      setActiveChatId(null);
      setMessages([]);
    }
  }, [deleteChat, activeChatId]);

  const handleSpeakingDone = useCallback(() => {
    setAiSpeaking(false);
    if (voiceMode) setReadyToListen(true);
  }, [voiceMode]);

  const streamChat = useCallback(async (userMessage: string) => {
    const userMsg: Message = { role: 'user', content: userMessage };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setInput('');
    setIsLoading(true);
    setReadyToListen(false);
    stopSpeaking();

    // Create or use existing chat
    let chatId = activeChatId;
    if (!chatId) {
      const chat = await createChat(userMessage.length > 40 ? userMessage.slice(0, 40) + '…' : userMessage);
      if (!chat) { setIsLoading(false); return; }
      chatId = chat.id;
      setActiveChatId(chatId);
    }

    // Save user message to DB
    await addMessage(chatId, 'user', userMessage);

    // If this is the first message, auto-title
    if (messages.length === 0) {
      await autoTitleChat(chatId, userMessage);
    }

    let assistantContent = '';
    let pendingActions: AIAction[] = [];

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Please log in to use the AI assistant');

      const controller = new AbortController();
      abortControllerRef.current = controller;
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

            // Handle structured actions event from server
            if (parsed.__actions__) {
              pendingActions = parsed.__actions__;
              continue;
            }

            const finishReason = parsed.choices?.[0]?.finish_reason;
            if (finishReason === 'error') break;
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

      // Apply structured actions to the final message
      if (pendingActions.length > 0) {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { 
            role: 'assistant', 
            content: assistantContent || updated[updated.length - 1].content,
            actions: pendingActions,
          };
          return updated;
        });
      }

      if (!assistantContent.trim()) {
        assistantContent = 'I processed your request but couldn\'t generate a response. Please try rephrasing your question.';
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
          return updated;
        });
      }

      // Save assistant message to DB
      await addMessage(chatId, 'assistant', assistantContent);
      // Refresh sidebar
      fetchChats();
    } catch (error) {
      console.error('Chat error:', error);
      let errorMsg = 'Unknown error';
      if (error instanceof Error) {
        if (error.name === 'AbortError') errorMsg = 'The request took too long. Please try a simpler query.';
        else if (error.message === 'Load failed' || error.message === 'Failed to fetch') errorMsg = 'Network error — please try again.';
        else errorMsg = error.message;
      }
      const fallback = `Sorry, I encountered an error: ${errorMsg}`;
      setMessages(prev => [
        ...prev.filter(m => m.content !== ''),
        { role: 'assistant', content: fallback },
      ]);
      if (chatId) await addMessage(chatId, 'assistant', fallback);
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, [messages, activeChatId, createChat, addMessage, autoTitleChat, fetchChats]);

  const handleStopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

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
    setVoiceMode(true);
    setReadyToListen(false);
    setTimeout(() => {
      if (text.trim() && !isLoading) streamChat(text.trim());
    }, 300);
  }, [isLoading, streamChat]);

  const toggleVoiceMode = useCallback(() => {
    setVoiceMode(prev => {
      if (prev) { stopSpeaking(); setReadyToListen(false); setAiSpeaking(false); }
      return !prev;
    });
  }, []);

  const shouldAutoListen = voiceMode && !isLoading && !aiSpeaking && readyToListen;
  const getVoiceState = () => {
    if (isListening) return 'listening' as const;
    if (isLoading) return 'thinking' as const;
    if (aiSpeaking) return 'speaking' as const;
    return 'idle' as const;
  };

  const isNewChat = !activeChatId && messages.length === 0;

  return (
    <div
      className={cn(
        "fixed z-50 flex animate-scale-in",
        "bg-background/98 backdrop-blur-xl border border-border/50 shadow-2xl dark:border-border/30 dark:shadow-[0_0_60px_rgba(0,0,0,0.5)]",
        "rounded-2xl overflow-hidden",
        "max-sm:inset-0 max-sm:w-full max-sm:h-full max-sm:rounded-none max-sm:bottom-0 max-sm:left-0",
      )}
      style={{ bottom: 16, left: 16, width: size.w, height: size.h }}
    >
      {/* Resize handles */}
      {/* Right edge */}
      <div
        onMouseDown={(e) => onResizeMouseDown('right', e)}
        className="absolute top-0 right-0 w-2 h-full cursor-ew-resize z-[60] max-sm:hidden hover:bg-primary/10 transition-colors"
      />
      {/* Top edge */}
      <div
        onMouseDown={(e) => onResizeMouseDown('top', e)}
        className="absolute top-0 left-0 w-full h-2 cursor-ns-resize z-[60] max-sm:hidden hover:bg-primary/10 transition-colors"
      />
      {/* Top-right corner */}
      <div
        onMouseDown={(e) => onResizeMouseDown('top-right', e)}
        className="absolute top-0 right-0 w-5 h-5 cursor-nesw-resize z-[61] group max-sm:hidden"
        title="Drag to resize"
      >
        <svg className="w-3 h-3 absolute top-1 right-1 text-muted-foreground/40 group-hover:text-primary/60 transition-colors" viewBox="0 0 10 10">
          <path d="M10 0L0 10M10 4L4 10M10 8L8 10" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </div>
      {/* Sidebar */}
      {showSidebar && (
        <div className="w-[220px] shrink-0 max-sm:hidden">
          <AIChatSidebar
            chats={chats}
            activeChatId={activeChatId}
            onSelectChat={loadChat}
            onNewChat={handleNewChat}
            onDeleteChat={handleDeleteChat}
            onRenameChat={renameChat}
          />
        </div>
      )}

      {/* Main Chat Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="relative overflow-hidden">
          <div className={cn(
            "absolute inset-0 transition-all duration-500",
            voiceMode
              ? "bg-gradient-to-r from-primary/15 via-primary/10 to-violet-500/10"
              : "bg-gradient-to-r from-primary/10 via-primary/5 to-transparent"
          )} />
          <div className="relative flex items-center justify-between px-3 py-2.5 border-b border-border/40">
            <div className="flex items-center gap-2 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg shrink-0 text-muted-foreground hover:text-foreground max-sm:hidden"
                onClick={() => setShowSidebar(p => !p)}
                title={showSidebar ? 'Hide sidebar' : 'Show sidebar'}
              >
                {showSidebar ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeft className="w-3.5 h-3.5" />}
              </Button>
              <div className={cn(
                "relative p-1.5 rounded-lg transition-all duration-300 shrink-0",
                voiceMode ? "bg-primary/20" : "bg-primary/15"
              )}>
                {voiceMode ? (
                  <Mic className={cn("w-4 h-4 text-primary", aiSpeaking && "animate-pulse")} />
                ) : (
                  <Bot className="w-4 h-4 text-primary" />
                )}
                <span className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-background",
                  voiceMode
                    ? (isListening ? "bg-emerald-500" : aiSpeaking ? "bg-primary animate-pulse" : "bg-amber-500")
                    : "bg-emerald-500"
                )} />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-foreground leading-none truncate">
                  {voiceMode ? 'Voice Assistant' : (activeChatId ? (chats.find(c => c.id === activeChatId)?.title || 'Chat') : getRoleAITitle(roles))}
                </h3>
                <p className="text-[9px] mt-0.5 text-muted-foreground truncate">
                  {voiceMode
                    ? (isListening ? '🎤 Listening...' : aiSpeaking ? '🔊 Speaking...' : isLoading ? '⚡ Processing...' : '🎙️ Ready')
                    : getRoleSubtitle(roles)
                  }
                </p>
              </div>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
                onClick={handleNewChat}
                title="New chat"
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-7 w-7 rounded-lg transition-all duration-300",
                  voiceMode
                    ? "text-primary bg-primary/15 hover:bg-primary/25 ring-1 ring-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
                onClick={toggleVoiceMode}
                title={voiceMode ? "Exit voice mode" : "Enter voice mode"}
              >
                {voiceMode ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                onClick={onClose}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Voice Mode Overlay */}
        {voiceMode && (
          <div className="absolute inset-0 z-10 flex flex-col overflow-hidden bg-background/98 backdrop-blur-2xl">
            <div className={cn(
              "absolute inset-0 transition-opacity duration-1000",
              isListening
                ? "bg-gradient-to-b from-emerald-500/5 via-transparent to-emerald-500/5 opacity-100"
                : aiSpeaking
                  ? "bg-gradient-to-b from-primary/5 via-transparent to-violet-500/5 opacity-100"
                  : "bg-gradient-to-b from-primary/3 via-transparent to-transparent opacity-60"
            )} />
            <div className="relative flex items-center justify-between px-4 py-3 border-b border-border/20">
              <div className="flex items-center gap-2">
                <div className={cn("p-1.5 rounded-lg", isListening ? "bg-emerald-500/15" : "bg-primary/15")}>
                  <Mic className={cn("w-4 h-4", isListening ? "text-emerald-500" : "text-primary")} />
                </div>
                <span className="text-sm font-semibold text-foreground">Voice Mode</span>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground rounded-lg" onClick={toggleVoiceMode}>Exit Voice</Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground" onClick={onClose}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            <div className="relative flex-1 flex flex-col items-center justify-center px-6">
              <VoiceVisualizer state={getVoiceState()} />
              {messages.length > 0 && (
                <div className="mt-6 max-w-[300px] text-center space-y-2">
                  {messages.filter(m => m.role === 'user').length > 0 && (
                    <p className="text-xs text-muted-foreground truncate">
                      You: "{messages.filter(m => m.role === 'user').pop()?.content}"
                    </p>
                  )}
                  {!isLoading && messages[messages.length - 1]?.role === 'assistant' && (
                    <p className="text-xs text-foreground/70 line-clamp-2 leading-relaxed">
                      {messages[messages.length - 1].content.slice(0, 120)}
                      {(messages[messages.length - 1].content.length || 0) > 120 ? '...' : ''}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="relative px-4 py-4 border-t border-border/20 flex items-center justify-center gap-3">
              <VoiceInputButton
                onTranscript={handleVoiceTranscript}
                disabled={isLoading || aiSpeaking}
                autoListen={shouldAutoListen}
                variant="large"
                onListeningChange={setIsListening}
              />
              {aiSpeaking && (
                <Button variant="outline" size="sm" onClick={() => { stopSpeaking(); setAiSpeaking(false); }} className="text-xs rounded-xl border-border/50">
                  Stop Speaking
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Messages */}
        <ScrollArea className="flex-1 px-4 py-3" ref={scrollRef}>
          {isNewChat ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-4">
              <div className="relative mb-4">
                <div className="absolute inset-0 rounded-full bg-primary/20 animate-pulse scale-150" />
                <div className="relative p-3 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
              </div>

              <h3 className="text-sm font-bold text-foreground mb-1">{getRoleAITitle(roles)}</h3>
              <p className="text-[11px] text-muted-foreground mb-4 max-w-[280px] leading-relaxed">
                {getRoleSubtitle(roles)} — powered by AI.
              </p>

              <DailyBriefingWidget onPrompt={(p) => !isLoading && streamChat(p)} />

              <div className="grid grid-cols-2 gap-2 w-full max-w-[340px]">
                {(() => {
                  const primaryRole = ['admin', 'hr', 'finance', 'supply_chain', 'sales_manager', 'sales']
                    .find(r => roles.includes(r as any)) || 'default';
                  const prompts = ROLE_QUICK_PROMPTS[primaryRole] || DEFAULT_QUICK_PROMPTS;
                  return prompts.map(({ icon: Icon, label, prompt }, i) => (
                    <button
                      key={i}
                      onClick={() => !isLoading && streamChat(prompt)}
                      className={cn(
                        "flex items-center gap-2 p-2.5 rounded-xl text-left",
                        "bg-card border border-border/50 hover:border-primary/30 dark:border-border/30 dark:hover:border-primary/40",
                        "hover:bg-primary/5 dark:hover:bg-primary/10 transition-all duration-200",
                        "group cursor-pointer",
                        i === prompts.length - 1 && prompts.length % 2 === 1 && "col-span-2"
                      )}
                    >
                      <div className="p-1.5 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors shrink-0">
                        <Icon className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <span className="text-[11px] font-medium text-foreground leading-tight">{label}</span>
                    </button>
                  ));
                })()}
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
                    actions={msg.actions}
                    isStreaming={isCurrentlyStreaming}
                    autoSpeak={voiceMode && isLastAssistant && !isCurrentlyStreaming}
                    onSpeakingDone={handleSpeakingDone}
                  />
                );
              })}
              {isLoading && messages[messages.length - 1]?.role === 'user' && (
                <div className="flex gap-2">
                  <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="bg-muted dark:bg-card dark:border dark:border-border/40 rounded-xl rounded-bl-sm px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse" />
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse [animation-delay:150ms]" />
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/20 animate-pulse [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}

              {/* Error retry */}
              {!isLoading && messages.length > 0 && messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content?.startsWith('Sorry, I encountered an error') && (
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs rounded-lg"
                    onClick={() => {
                      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
                      if (lastUserMsg) {
                        setMessages(prev => prev.slice(0, -1));
                        streamChat(lastUserMsg.content);
                      }
                    }}
                  >
                    <RefreshCw className="w-3 h-3" />
                    Retry
                  </Button>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Input area */}
        {!voiceMode && (
          <div className="px-3 py-2.5 border-t border-border/40 shrink-0">
            <form onSubmit={handleSubmit} className="relative flex items-end gap-1.5">
              <VoiceInputButton
                onTranscript={handleVoiceTranscript}
                disabled={isLoading || aiSpeaking}
                autoListen={shouldAutoListen}
                onListeningChange={setIsListening}
              />
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
                {isLoading ? (
                  <Button
                    type="button"
                    onClick={handleStopGeneration}
                    size="icon"
                    className="absolute right-1.5 bottom-1.5 h-8 w-8 rounded-lg bg-destructive text-destructive-foreground shadow-md hover:bg-destructive/90 transition-all duration-200"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={!input.trim()}
                    size="icon"
                    className={cn(
                      "absolute right-1.5 bottom-1.5 h-8 w-8 rounded-lg",
                      "transition-all duration-200",
                      input.trim()
                        ? "bg-primary text-primary-foreground shadow-md hover:shadow-lg"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </form>
            <p className="text-[9px] text-muted-foreground text-center mt-1 tracking-wide">
              Shift+Enter for newline • AI responses based on your role access
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
