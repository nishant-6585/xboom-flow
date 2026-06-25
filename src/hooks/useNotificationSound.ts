import { useCallback, useRef } from 'react';

type SoundType = 'hot_lead' | 'mega_deal';

export function useNotificationSound() {
  const audioContextRef = useRef<AudioContext | null>(null);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  const primeAudio = useCallback(async () => {
    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') await ctx.resume();
      // play a silent buffer to fully unlock on iOS/Safari
      const buffer = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start(0);
    } catch {}
  }, [getAudioContext]);

  const playNotificationSound = useCallback(async (type: SoundType = 'hot_lead') => {
    try {
      const audioContext = getAudioContext();
      
      // Resume context if suspended (browser autoplay policy)
      if (audioContext.state === 'suspended') {
        try { await audioContext.resume(); } catch {}
      }

      const now = audioContext.currentTime;
      
      // Create oscillators for a pleasant chime
      const oscillator1 = audioContext.createOscillator();
      const oscillator2 = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator1.connect(gainNode);
      oscillator2.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Different tones for different notification types
      if (type === 'mega_deal') {
        // Triumphant major chord arpeggio for mega deals
        oscillator1.frequency.setValueAtTime(523.25, now); // C5
        oscillator1.frequency.setValueAtTime(659.25, now + 0.1); // E5
        oscillator1.frequency.setValueAtTime(783.99, now + 0.2); // G5
        oscillator1.frequency.setValueAtTime(1046.50, now + 0.3); // C6
        
        oscillator2.frequency.setValueAtTime(261.63, now); // C4
        oscillator2.frequency.setValueAtTime(329.63, now + 0.1); // E4
        oscillator2.frequency.setValueAtTime(392.00, now + 0.2); // G4
        oscillator2.frequency.setValueAtTime(523.25, now + 0.3); // C5
        
        oscillator1.type = 'sine';
        oscillator2.type = 'triangle';
        
        // Envelope for mega deal - longer, more impactful
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.3, now + 0.05);
        gainNode.gain.setValueAtTime(0.3, now + 0.35);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.6);
        
        oscillator1.start(now);
        oscillator2.start(now);
        oscillator1.stop(now + 0.6);
        oscillator2.stop(now + 0.6);
      } else {
        // Quick attention-grabbing two-tone for hot leads
        oscillator1.frequency.setValueAtTime(880, now); // A5
        oscillator1.frequency.setValueAtTime(1174.66, now + 0.1); // D6
        
        oscillator2.frequency.setValueAtTime(440, now); // A4
        oscillator2.frequency.setValueAtTime(587.33, now + 0.1); // D5
        
        oscillator1.type = 'sine';
        oscillator2.type = 'triangle';
        
        // Quick envelope for hot lead
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.25, now + 0.02);
        gainNode.gain.setValueAtTime(0.25, now + 0.15);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.3);
        
        oscillator1.start(now);
        oscillator2.start(now);
        oscillator1.stop(now + 0.3);
        oscillator2.stop(now + 0.3);
      }
    } catch (error) {
      console.warn('Could not play notification sound:', error);
    }
  }, [getAudioContext]);

  return { playNotificationSound, primeAudio };
}
