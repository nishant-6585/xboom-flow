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
  onSpeakingDone?: () => void;
}

/** Strip markdown + tables into natural speech-friendly text */
function stripForSpeech(md: string): string {
  let text = md;
  // Remove chart blocks entirely
  text = text.replace(/```chart[\s\S]*?```/g, '');
  // Remove code blocks
  text = text.replace(/```[\s\S]*?```/g, '');
  // Remove inline code
  text = text.replace(/`([^`]+)`/g, '$1');
  // Bold/italic
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  // Headers → just the text
  text = text.replace(/#{1,6}\s+/g, '');
  // Links → just the label
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  
  // Convert markdown tables to spoken form
  // Detect table rows and convert
  const lines = text.split('\n');
  const spokenLines: string[] = [];
  let inTable = false;
  let headers: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed.split('|').filter(c => c.trim()).map(c => c.trim());
      // Skip separator rows
      if (cells.every(c => /^[-:]+$/.test(c))) continue;
      
      if (!inTable) {
        // First table row = headers
        headers = cells;
        inTable = true;
      } else {
        // Data row → "Customer: Aerial Tech, Product: DJI Mavic, Amount: 3.5 lakhs"
        const parts = cells.map((cell, i) => {
          const header = headers[i] || '';
          return `${header}: ${cell}`;
        });
        spokenLines.push(parts.join(', ') + '.');
      }
    } else {
      if (inTable) {
        inTable = false;
        headers = [];
      }
      if (trimmed) spokenLines.push(trimmed);
    }
  }
  
  text = spokenLines.join(' ');
  // Clean up bullets
  text = text.replace(/^[-•*]\s+/gm, '');
  // Clean up emoji
  text = text.replace(/[🔴📊⚡📦🔥✅❌⚠️🌟💰📈📉🎯]/g, '');
  // Multiple spaces/newlines
  text = text.replace(/\n+/g, '. ');
  text = text.replace(/\s+/g, ' ');
  text = text.replace(/\.\s*\./g, '.');
  return text.trim();
}

/** Pick the most natural-sounding voice available */
function getBestVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  // Premium natural voices ranked by quality (these sound most human-like)
  const premium = [
    'Microsoft Jenny Online',    // Windows 11 neural voice — very natural
    'Microsoft Aria Online',     // Windows 11 neural voice
    'Google UK English Female',  // Chrome — smooth & clear
    'Samantha',                  // macOS / iOS — warm & natural
    'Karen',                     // macOS Australian — soft
    'Moira',                     // macOS Irish — pleasant
    'Tessa',                     // macOS South African
    'Google US English',         // Chrome fallback
    'Microsoft Zira',            // Windows desktop
    'Victoria',                  // macOS legacy
  ];

  for (const name of premium) {
    const v = voices.find(v => v.name.includes(name));
    if (v) return v;
  }

  // Fallback: prefer any English "Online" / neural voice (they sound better)
  const neural = voices.find(v => v.lang.startsWith('en') && /online|neural|natural|premium/i.test(v.name));
  if (neural) return neural;

  // Any English female-sounding voice
  const female = voices.find(v => v.lang.startsWith('en') && /female|woman|samantha|karen|zira|victoria|jenny|aria/i.test(v.name));
  if (female) return female;

  return voices.find(v => v.lang.startsWith('en')) || voices[0] || null;
}

/**
 * Break long text into smaller chunks at sentence boundaries
 * to keep the browser TTS engine sounding natural (avoids monotone on long text).
 */
function chunkText(text: string, maxLen = 200): string[] {
  if (text.length <= maxLen) return [text];
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
  const chunks: string[] = [];
  let current = '';
  for (const s of sentences) {
    if ((current + s).length > maxLen && current) {
      chunks.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export function speakText(text: string, onEnd?: () => void): SpeechSynthesisUtterance | null {
  if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const plainText = stripForSpeech(text);
  if (!plainText) return null;

  window.speechSynthesis.cancel();

  const voice = getBestVoice();
  const chunks = chunkText(plainText);

  chunks.forEach((chunk, i) => {
    const utterance = new SpeechSynthesisUtterance(chunk);
    if (voice) utterance.voice = voice;
    // Slightly slower & lower pitch = warmer, more natural feel
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Only fire onEnd after the last chunk
    if (i === chunks.length - 1 && onEnd) {
      utterance.onend = onEnd;
      utterance.onerror = onEnd;
    }
    window.speechSynthesis.speak(utterance);
  });

  return null; // multiple utterances queued
}

export function stopSpeaking() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function ChatMessage({ role, content, isStreaming, autoSpeak, onSpeakingDone }: ChatMessageProps) {
  const isUser = role === 'user';
  const [isSpeaking, setIsSpeaking] = useState(false);
  const hasAutoSpokenRef = useRef(false);
  const prevContentLenRef = useRef(0);

  useEffect(() => {
    if (!autoSpeak || isUser || !content || isStreaming) return;
    if (content.length < prevContentLenRef.current) {
      hasAutoSpokenRef.current = false;
    }
    prevContentLenRef.current = content.length;
  }, [content, isStreaming, autoSpeak, isUser]);

  useEffect(() => {
    if (!autoSpeak || isUser || !content || isStreaming || hasAutoSpokenRef.current) return;
    
    hasAutoSpokenRef.current = true;
    setIsSpeaking(true);
    speakText(content, () => {
      setIsSpeaking(false);
      onSpeakingDone?.();
    });
  }, [isStreaming, autoSpeak, isUser, content, onSpeakingDone]);

  const handleSpeak = useCallback(() => {
    if (!content || isStreaming) return;

    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
      return;
    }

    setIsSpeaking(true);
    speakText(content, () => {
      setIsSpeaking(false);
    });
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
