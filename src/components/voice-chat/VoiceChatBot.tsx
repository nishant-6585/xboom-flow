import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Volume2, X, Bot, Loader2, Square, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

export function VoiceChatBot() {
  const { user, profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<VoiceState>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isOpenRef = useRef(false);
  const autoListenAfterSpeakRef = useRef(true);

  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Audio ───
  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (state === 'speaking') setState('idle');
  }, [state]);

  // ─── Send to AI ───
  const sendToAI = useCallback(async (userText: string, allMessages: Message[]) => {
    setState('processing');
    setLiveTranscript('');
    setFinalTranscript('');

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ messages: allMessages.slice(-10) }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed: ${response.status}`);
      }

      const data = await response.json();
      const assistantMsg: Message = { role: 'assistant', content: data.text };
      setMessages(prev => [...prev, assistantMsg]);

      // Play audio
      if (data.audioContent) {
        const audioUrl = `data:audio/mpeg;base64,${data.audioContent}`;
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        setState('speaking');

        audio.onended = () => {
          audioRef.current = null;
          setState('idle');
          // Auto-listen again after AI finishes speaking
          if (isOpenRef.current && autoListenAfterSpeakRef.current) {
            setTimeout(() => {
              if (isOpenRef.current) startListeningInternal();
            }, 400);
          }
        };
        audio.onerror = () => {
          audioRef.current = null;
          setState('idle');
        };
        await audio.play().catch(() => setState('idle'));
      } else {
        setState('idle');
        // Auto-listen even without audio
        if (isOpenRef.current && autoListenAfterSpeakRef.current) {
          setTimeout(() => {
            if (isOpenRef.current) startListeningInternal();
          }, 400);
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      console.error('Voice chat error:', error);
      toast.error(error.message || 'Voice chat failed');
      setState('idle');
    }
  }, []);

  // ─── Speech Recognition ───
  const startListeningInternal = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    // Stop any existing
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-IN';
    recognition.maxAlternatives = 1;

    let lastFinal = '';

    recognition.onstart = () => {
      setState('listening');
      setLiveTranscript('');
      setFinalTranscript('');
      lastFinal = '';
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      if (final) {
        lastFinal = final;
        setFinalTranscript(final);
        setLiveTranscript('');
      } else {
        setLiveTranscript(interim);
      }
    };

    // KEY FIX: Auto-send when recognition naturally ends (after user stops speaking)
    recognition.onend = () => {
      recognitionRef.current = null;
      const textToSend = lastFinal.trim();
      if (textToSend) {
        // Auto-send the transcript
        const userMsg: Message = { role: 'user', content: textToSend };
        setMessages(prev => {
          const updated = [...prev, userMsg];
          sendToAI(textToSend, updated);
          return updated;
        });
      } else {
        setState('idle');
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech error:', event.error);
      recognitionRef.current = null;
      if (event.error === 'no-speech') {
        setState('idle');
      } else if (event.error === 'not-allowed') {
        toast.error('Microphone access denied. Please allow it in browser settings.');
        setState('idle');
      } else if (event.error !== 'aborted') {
        toast.error('Mic error: ' + event.error);
        setState('idle');
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      console.error('Failed to start recognition:', e);
      setState('idle');
    }
  }, [sendToAI]);

  const startListening = useCallback(async () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error('Speech recognition not supported in this browser');
      return;
    }
    // Request mic permission first
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch {
      toast.error('Microphone access denied');
      return;
    }
    startListeningInternal();
  }, [startListeningInternal]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop(); // This triggers onend which auto-sends
    }
  }, []);

  const handleMicPress = useCallback(() => {
    if (state === 'listening') {
      stopListening();
    } else if (state === 'idle') {
      startListening();
    } else if (state === 'speaking') {
      stopSpeaking();
      // Start listening after stopping
      setTimeout(() => startListening(), 300);
    }
  }, [state, startListening, stopListening, stopSpeaking]);

  const handleToggle = () => {
    if (isOpen) {
      stopSpeaking();
      if (recognitionRef.current) recognitionRef.current.abort();
      if (abortRef.current) abortRef.current.abort();
      setState('idle');
      setLiveTranscript('');
      setFinalTranscript('');
    }
    setIsOpen(!isOpen);
  };

  const handleCancel = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    stopSpeaking();
    setState('idle');
  }, [stopSpeaking]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) recognitionRef.current.abort();
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  if (!user) return null;

  const statusMap: Record<VoiceState, string> = {
    idle: '🎙️ Tap to speak',
    listening: '🎤 Listening… speak now',
    processing: '⚡ Thinking…',
    speaking: '🔊 Speaking…',
  };

  const displayTranscript = liveTranscript || finalTranscript;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={handleToggle}
        className={cn(
          "fixed bottom-24 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300",
          isOpen
            ? "bg-destructive text-destructive-foreground"
            : state === 'speaking' || state === 'processing'
              ? "bg-gradient-to-br from-violet-500 to-purple-600 text-white animate-pulse"
              : "bg-gradient-to-br from-violet-500 to-purple-600 text-white hover:scale-110"
        )}
        title="Voice Chat"
      >
        {isOpen ? <X className="w-6 h-6" /> : state === 'speaking' ? <Volume2 className="w-6 h-6" /> : <Bot className="w-6 h-6" />}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-40 right-6 z-50 w-[400px] max-h-[520px] bg-background border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4">
          {/* Header */}
          <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-4 py-3 flex items-center gap-3">
            <div className={cn(
              "w-9 h-9 bg-white/20 rounded-full flex items-center justify-center transition-all",
              state === 'speaking' && "animate-pulse",
              state === 'listening' && "ring-2 ring-white/40 ring-offset-1 ring-offset-transparent"
            )}>
              {state === 'listening' ? <Mic className="w-5 h-5 text-white" /> :
               state === 'speaking' ? <Volume2 className="w-5 h-5 text-white" /> :
               <Bot className="w-5 h-5 text-white" />}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-semibold text-sm">Xboom Voice AI</h3>
              <p className="text-white/70 text-xs truncate">{statusMap[state]}</p>
            </div>
            <div className="flex items-center gap-1">
              {state === 'speaking' && (
                <Button size="icon" variant="ghost" className="text-white hover:bg-white/20 h-8 w-8" onClick={stopSpeaking} title="Stop speaking">
                  <Square className="w-4 h-4" />
                </Button>
              )}
              {state === 'processing' && (
                <Button size="icon" variant="ghost" className="text-white hover:bg-white/20 h-8 w-8" onClick={handleCancel} title="Cancel">
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px] max-h-[300px]">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-8">
                <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center">
                  <Mic className="w-7 h-7 text-violet-500 opacity-60" />
                </div>
                <p className="font-medium text-foreground">Hi {profile?.name?.split(' ')[0] || 'there'}! 👋</p>
                <p className="text-xs mt-1.5">Just tap the mic and start talking.<br/>I'll listen, respond, and keep the conversation going.</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={cn("flex", msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  "max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed",
                  msg.role === 'user'
                    ? 'bg-violet-500 text-white rounded-br-sm'
                    : 'bg-muted text-foreground rounded-bl-sm'
                )}>
                  {msg.content}
                </div>
              </div>
            ))}
            {state === 'processing' && (
              <div className="flex justify-start">
                <div className="bg-muted px-3 py-2.5 rounded-xl rounded-bl-sm flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Live transcript preview */}
          {displayTranscript && (
            <div className="px-4 py-2 bg-violet-50 dark:bg-violet-950/30 text-sm text-violet-700 dark:text-violet-300 border-t border-border/50 flex items-center gap-2">
              <Mic className="w-3.5 h-3.5 shrink-0 animate-pulse" />
              <span className="truncate">{displayTranscript}</span>
            </div>
          )}

          {/* Controls */}
          <div className="p-4 border-t border-border/40 flex flex-col items-center gap-2">
            {/* Main mic button */}
            <button
              onClick={handleMicPress}
              disabled={state === 'processing'}
              className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 relative",
                state === 'listening' && "bg-red-500 text-white shadow-lg shadow-red-500/30",
                state === 'processing' && "bg-muted text-muted-foreground cursor-not-allowed",
                state === 'speaking' && "bg-violet-400 text-white hover:bg-violet-500",
                state === 'idle' && "bg-gradient-to-br from-violet-500 to-purple-600 text-white hover:scale-105 shadow-lg shadow-violet-500/25",
              )}
            >
              {/* Pulse ring for listening */}
              {state === 'listening' && (
                <>
                  <span className="absolute inset-0 rounded-full border-2 border-red-400/40 animate-ping" />
                  <span className="absolute inset-[-4px] rounded-full border-2 border-red-400/20 animate-[ping_2s_ease-out_infinite]" />
                </>
              )}
              {state === 'processing' ? (
                <Loader2 className="w-7 h-7 animate-spin" />
              ) : state === 'listening' ? (
                <MicOff className="w-7 h-7 relative z-10" />
              ) : state === 'speaking' ? (
                <Mic className="w-7 h-7" />
              ) : (
                <Mic className="w-7 h-7" />
              )}
            </button>
            <p className="text-[10px] text-muted-foreground">
              {state === 'idle' && 'Tap to speak'}
              {state === 'listening' && 'Tap to send · or just pause speaking'}
              {state === 'processing' && 'Getting your answer…'}
              {state === 'speaking' && 'Tap mic to interrupt'}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
