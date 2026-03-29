import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Volume2, X, Bot, Loader2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function VoiceChatBot() {
  const { user, profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [transcript, setTranscript] = useState('');
  const [currentResponse, setCurrentResponse] = useState('');
  const [statusText, setStatusText] = useState('Tap mic to talk');
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isOpenRef = useRef(false);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentResponse]);

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const startListeningInternal = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    stopSpeaking();

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setStatusText('Listening... tap to send');
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      setTranscript(finalTranscript || interimTranscript);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      setStatusText('Tap mic to talk');
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        toast.error('Microphone error: ' + event.error);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [stopSpeaking]);

  const sendToVoiceChat = useCallback(async (userText: string) => {
    if (!userText.trim()) return;

    const userMsg: Message = { role: 'user', content: userText };
    setMessages(prev => {
      const updated = [...prev, userMsg];
      // Send request with updated messages
      doSend(updated);
      return updated;
    });
    setTranscript('');
    setIsProcessing(true);
    setStatusText('Thinking...');
    setCurrentResponse('');
  }, []);

  const doSend = useCallback(async (allMessages: Message[]) => {
    // Cancel any previous in-flight request
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
          body: JSON.stringify({
            messages: allMessages.slice(-10),
          }),
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
      setCurrentResponse(data.text);
      setIsProcessing(false);

      // Play audio
      if (data.audioContent) {
        const audioUrl = `data:audio/mpeg;base64,${data.audioContent}`;
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        setIsSpeaking(true);
        setStatusText('Speaking...');
        audio.onended = () => {
          setIsSpeaking(false);
          audioRef.current = null;
          setStatusText('Tap mic to talk');
          // Auto-start listening after response finishes
          if (isOpenRef.current) {
            setTimeout(() => {
              if (isOpenRef.current) startListeningInternal();
            }, 500);
          }
        };
        audio.onerror = () => {
          setIsSpeaking(false);
          audioRef.current = null;
          setStatusText('Tap mic to talk');
        };
        await audio.play().catch(() => {
          setIsSpeaking(false);
          setStatusText('Tap mic to talk');
        });
      } else {
        setStatusText('Tap mic to talk');
        // Auto-start listening even if no audio
        if (isOpenRef.current) {
          setTimeout(() => {
            if (isOpenRef.current) startListeningInternal();
          }, 500);
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      console.error('Voice chat error:', error);
      toast.error(error.message || 'Voice chat failed');
      setIsProcessing(false);
      setStatusText('Tap mic to talk');
    }
  }, [startListeningInternal]);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Speech recognition is not supported in this browser');
      return;
    }
    startListeningInternal();
  }, [startListeningInternal]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    if (transcript.trim()) {
      sendToVoiceChat(transcript);
    } else {
      setStatusText('Tap mic to talk');
    }
  }, [transcript, sendToVoiceChat]);

  const handleToggle = () => {
    if (isOpen) {
      stopSpeaking();
      if (recognitionRef.current) recognitionRef.current.stop();
      if (abortRef.current) abortRef.current.abort();
      setIsListening(false);
      setIsProcessing(false);
      setStatusText('Tap mic to talk');
    }
    setIsOpen(!isOpen);
  };

  const handleCancel = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    stopSpeaking();
    setIsProcessing(false);
    setStatusText('Tap mic to talk');
  }, [stopSpeaking]);

  if (!user) return null;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={handleToggle}
        className={`fixed bottom-24 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 ${
          isOpen
            ? 'bg-destructive text-destructive-foreground'
            : isSpeaking || isProcessing
              ? 'bg-gradient-to-br from-violet-500 to-purple-600 text-white animate-pulse'
              : 'bg-gradient-to-br from-violet-500 to-purple-600 text-white hover:scale-110'
        }`}
        title="Voice Chat"
      >
        {isOpen ? <X className="w-6 h-6" /> : isSpeaking ? <Volume2 className="w-6 h-6" /> : <Bot className="w-6 h-6" />}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-40 right-6 z-50 w-[380px] max-h-[500px] bg-background border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4">
          {/* Header */}
          <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-4 py-3 flex items-center gap-3">
            <div className={`w-9 h-9 bg-white/20 rounded-full flex items-center justify-center ${isSpeaking ? 'animate-pulse' : ''}`}>
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-white font-semibold text-sm">Xboom Voice AI</h3>
              <p className="text-white/70 text-xs">{statusText}</p>
            </div>
            <div className="flex items-center gap-1">
              {isSpeaking && (
                <Button size="icon" variant="ghost" className="text-white hover:bg-white/20 h-8 w-8" onClick={stopSpeaking}>
                  <Square className="w-4 h-4" />
                </Button>
              )}
              {isProcessing && (
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
                <Volume2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>Hi {profile?.name?.split(' ')[0] || 'there'}! 👋</p>
                <p className="text-xs mt-1">Tap the microphone and ask me anything</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${
                  msg.role === 'user'
                    ? 'bg-violet-500 text-white rounded-br-sm'
                    : 'bg-muted text-foreground rounded-bl-sm'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {isProcessing && (
              <div className="flex justify-start">
                <div className="bg-muted px-3 py-2 rounded-xl rounded-bl-sm flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Transcript preview */}
          {transcript && (
            <div className="px-4 py-2 bg-violet-50 dark:bg-violet-950/30 text-sm text-violet-700 dark:text-violet-300 border-t border-border">
              {transcript}
            </div>
          )}

          {/* Controls */}
          <div className="p-4 border-t border-border flex items-center justify-center gap-4">
            <button
              onClick={isListening ? stopListening : startListening}
              disabled={isProcessing}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 ${
                isListening
                  ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30'
                  : isProcessing
                    ? 'bg-muted text-muted-foreground cursor-not-allowed'
                    : 'bg-gradient-to-br from-violet-500 to-purple-600 text-white hover:scale-105 shadow-lg'
              }`}
            >
              {isProcessing ? (
                <Loader2 className="w-7 h-7 animate-spin" />
              ) : isListening ? (
                <MicOff className="w-7 h-7" />
              ) : (
                <Mic className="w-7 h-7" />
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
