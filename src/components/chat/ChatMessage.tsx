import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, User, Volume2, VolumeX } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { parseChartBlocks, ChatChart } from './ChatChart';
import { Button } from '@/components/ui/button';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  autoSpeak?: boolean;
  onSpeakingChange?: (speaking: boolean) => void;
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[|\-]+/g, ' ')
    .replace(/\n+/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getPreferredFemaleVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const preferred = [
    'Google UK English Female',
    'Google US English',
    'Samantha',
    'Karen',
    'Victoria',
    'Zira',
    'Microsoft Zira',
  ];
  for (const name of preferred) {
    const v = voices.find(v => v.name.includes(name));
    if (v) return v;
  }
  const female = voices.find(v => v.lang.startsWith('en') && /female|woman|samantha|karen|zira|victoria/i.test(v.name));
  if (female) return female;
  return voices.find(v => v.lang.startsWith('en')) || voices[0] || null;
}

export function speakText(text: string, onEnd?: () => void): SpeechSynthesisUtterance | null {
  if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const plainText = stripMarkdown(text);
  if (!plainText) return null;

  const utterance = new SpeechSynthesisUtterance(plainText);
  const voice = getPreferredFemaleVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = 1.0;
  utterance.pitch = 1.15;
  if (onEnd) {
    utterance.onend = onEnd;
    utterance.onerror = onEnd;
  }
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return utterance;
}

export function stopSpeaking() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function ChatMessage({ role, content, isStreaming, autoSpeak, onSpeakingChange }: ChatMessageProps) {
  const isUser = role === 'user';
  const [isSpeaking, setIsSpeaking] = useState(false);
  const hasAutoSpokenRef = useRef(false);
  const prevContentLenRef = useRef(0);

  // Auto-speak when content is finalized (streaming done)
  useEffect(() => {
    if (!autoSpeak || isUser || !content || isStreaming) return;
    // Reset when content starts fresh (new message)
    if (content.length < prevContentLenRef.current) {
      hasAutoSpokenRef.current = false;
    }
    prevContentLenRef.current = content.length;
  }, [content, isStreaming, autoSpeak, isUser]);

  useEffect(() => {
    if (!autoSpeak || isUser || !content || isStreaming || hasAutoSpokenRef.current) return;
    
    hasAutoSpokenRef.current = true;
    setIsSpeaking(true);
    onSpeakingChange?.(true);
    speakText(content, () => {
      setIsSpeaking(false);
      onSpeakingChange?.(false);
    });
  }, [isStreaming, autoSpeak, isUser, content, onSpeakingChange]);

  const handleSpeak = useCallback(() => {
    if (!content || isStreaming) return;

    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
      onSpeakingChange?.(false);
      return;
    }

    setIsSpeaking(true);
    onSpeakingChange?.(true);
    speakText(content, () => {
      setIsSpeaking(false);
      onSpeakingChange?.(false);
    });
  }, [content, isStreaming, isSpeaking, onSpeakingChange]);

  const showSpeaker = !isUser && content && !isStreaming && typeof window !== 'undefined' && 'speechSynthesis' in window;

  const renderAssistantContent = () => {
    if (!content) {
      return isStreaming ? <span className="text-muted-foreground">•••</span> : null;
    }

    const hasChartBlock = content.includes('```chart');
    if (!hasChartBlock || isStreaming) {
      return (
        <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_table]:text-xs [&_code]:text-xs [&_code]:bg-background/50 [&_code]:px-1 [&_code]:rounded [&_pre]:bg-background/50 [&_pre]:text-xs">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      );
    }

    const parts = parseChartBlocks(content);
    return (
      <div>
        {parts.map((part, i) =>
          part.type === 'chart' ? (
            <ChatChart key={i} spec={part.spec} />
          ) : (
            <div key={i} className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_table]:text-xs [&_code]:text-xs [&_code]:bg-background/50 [&_code]:px-1 [&_code]:rounded [&_pre]:bg-background/50 [&_pre]:text-xs">
              <ReactMarkdown>{part.value}</ReactMarkdown>
            </div>
          )
        )}
      </div>
    );
  };

  return (
    <div className={cn('flex gap-2 animate-fade-in', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
          <Bot className="w-3.5 h-3.5 text-primary" />
        </div>
      )}
      <div className="flex flex-col max-w-[85%]">
        <div
          className={cn(
            'rounded-xl px-3 py-2 text-sm leading-relaxed',
            isUser
              ? 'bg-primary text-primary-foreground rounded-br-sm'
              : 'bg-muted rounded-bl-sm'
          )}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap break-words">{content}</div>
          ) : (
            renderAssistantContent()
          )}
        </div>
        {showSpeaker && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSpeak}
            className={cn(
              "h-6 w-6 rounded-md mt-0.5 self-start transition-colors",
              isSpeaking
                ? "text-primary bg-primary/10 hover:bg-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
            title={isSpeaking ? "Stop speaking" : "Read aloud"}
          >
            {isSpeaking ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
          </Button>
        )}
      </div>
      {isUser && (
        <div className="shrink-0 w-7 h-7 rounded-full bg-secondary flex items-center justify-center mt-0.5">
          <User className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
