import { useState, useCallback, useRef } from 'react';
import { Bot, User, Volume2, VolumeX } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { parseChartBlocks, ChatChart } from './ChatChart';
import { Button } from '@/components/ui/button';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '') // code blocks
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
  // Prefer high-quality female voices
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
  // Fallback: any female-sounding English voice
  const female = voices.find(v => v.lang.startsWith('en') && /female|woman|samantha|karen|zira|victoria/i.test(v.name));
  if (female) return female;
  // Last fallback: any English voice
  return voices.find(v => v.lang.startsWith('en')) || voices[0] || null;
}

export function ChatMessage({ role, content, isStreaming }: ChatMessageProps) {
  const isUser = role === 'user';
  const [isSpeaking, setIsSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const handleSpeak = useCallback(() => {
    if (!content || isStreaming) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const plainText = stripMarkdown(content);
    if (!plainText) return;

    const utterance = new SpeechSynthesisUtterance(plainText);
    const voice = getPreferredFemaleVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = 1.0;
    utterance.pitch = 1.15;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    utteranceRef.current = utterance;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  }, [content, isStreaming, isSpeaking]);

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
