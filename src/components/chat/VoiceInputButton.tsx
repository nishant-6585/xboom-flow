import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  autoListen?: boolean;
  variant?: 'default' | 'large';
  onListeningChange?: (listening: boolean) => void;
}

export function VoiceInputButton({ onTranscript, disabled, autoListen, variant = 'default', onListeningChange }: VoiceInputButtonProps) {
  const [isListening, setIsListening] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    onListeningChange?.(isListening);
  }, [isListening, onListeningChange]);

  const isSupported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const startListening = useCallback(async () => {
    if (!isSupported || isListening) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch (err) {
      console.error('Microphone permission error:', err);
      setPermissionDenied(true);
      if (err instanceof Error && err.name === 'NotAllowedError') {
        toast.error('Microphone access denied. Please allow microphone in your browser settings, or open the app in a new tab.');
      } else {
        toast.error('Could not access microphone. Try opening the app in a new tab.');
      }
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-IN';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) {
        onTranscriptRef.current(transcript);
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        setPermissionDenied(true);
        toast.error('Microphone access denied. Please enable it in browser settings.');
      } else if (event.error === 'aborted') {
        toast.error('Voice input unavailable here. Try opening the app in a new tab.');
      } else if (event.error === 'network') {
        toast.error('Voice recognition requires an internet connection.');
      } else if (event.error !== 'no-speech') {
        toast.error('Voice input failed. Please try again.');
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
    } catch (e) {
      console.error('Failed to start speech recognition:', e);
      toast.error('Voice input failed to start. Try opening the app in a new tab.');
      setIsListening(false);
    }
  }, [isSupported, isListening]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  // Auto-listen when voice mode triggers it
  useEffect(() => {
    if (autoListen && !isListening && !disabled && !permissionDenied && isSupported) {
      const timer = setTimeout(() => {
        startListening();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoListen, isListening, disabled, permissionDenied, isSupported, startListening]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  if (!isSupported || permissionDenied) return null;

  // Large variant for voice mode overlay
  if (variant === 'large') {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={isListening ? stopListening : startListening}
        className={cn(
          "relative flex items-center justify-center rounded-full transition-all duration-300 focus:outline-none",
          "w-16 h-16",
          isListening
            ? "bg-emerald-500/15 text-emerald-500 ring-2 ring-emerald-500/30"
            : "bg-primary/10 text-primary hover:bg-primary/20 ring-2 ring-primary/20 hover:ring-primary/30",
          disabled && "opacity-40 pointer-events-none"
        )}
        title={isListening ? "Stop listening" : "Tap to speak"}
      >
        {/* Pulse rings when listening */}
        {isListening && (
          <>
            <span className="absolute inset-0 rounded-full border-2 border-emerald-500/30 animate-[voicePing_2s_ease-out_infinite]" />
            <span className="absolute inset-0 rounded-full border-2 border-emerald-500/20 animate-[voicePing_2s_ease-out_0.7s_infinite]" />
          </>
        )}
        {isListening ? <MicOff className="w-6 h-6 relative z-10" /> : <Mic className="w-6 h-6" />}
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={disabled}
      onClick={isListening ? stopListening : startListening}
      className={cn(
        "h-8 w-8 rounded-lg transition-all duration-200 shrink-0",
        isListening
          ? "bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/20 ring-1 ring-emerald-500/30"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      )}
      title={isListening ? "Stop listening" : "Voice input"}
    >
      {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
    </Button>
  );
}
