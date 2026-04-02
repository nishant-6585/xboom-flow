import { supabase } from '@/integrations/supabase/client';
import { playGeneratedAudio } from '@/lib/audioPlayback';

const VOICE_PREF_KEY = 'xboom_voice_enabled';
const VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Sarah - natural female voice
const TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`;
const MAX_TTS_LENGTH = 900; // ElevenLabs limit safety margin

let currentAudioController: AbortController | null = null;

/** Strip markdown into speech-friendly plain text */
function stripForSpeech(md: string): string {
  let text = md;
  text = text.replace(/```chart[\s\S]*?```/g, '');
  text = text.replace(/```[\s\S]*?```/g, '');
  text = text.replace(/`([^`]+)`/g, '$1');
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/#{1,6}\s+/g, '');
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  const lines = text.split('\n');
  const spokenLines: string[] = [];
  let inTable = false;
  let headers: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed.split('|').filter(c => c.trim()).map(c => c.trim());
      if (cells.every(c => /^[-:]+$/.test(c))) continue;
      if (!inTable) { headers = cells; inTable = true; }
      else {
        const parts = cells.map((cell, i) => {
          const header = headers[i] || '';
          return `${header}: ${cell}`;
        });
        spokenLines.push(parts.join(', ') + '.');
      }
    } else {
      if (inTable) { inTable = false; headers = []; }
      if (trimmed) spokenLines.push(trimmed);
    }
  }

  text = spokenLines.join(' ');
  text = text.replace(/^[-•*]\s+/gm, '');
  text = text.replace(/[🔴📊⚡📦🔥✅❌⚠️🌟💰📈📉🎯👥📅⏸▶🔇🔁🔊]/g, '');
  text = text.replace(/\n+/g, '. ');
  text = text.replace(/\s+/g, ' ');
  text = text.replace(/\.\s*\./g, '.');
  return text.trim();
}

export function isVoiceEnabled(): boolean {
  try {
    return localStorage.getItem(VOICE_PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setVoiceEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(VOICE_PREF_KEY, enabled ? 'on' : 'off');
  } catch { /* ignore */ }
}

/** Speak text using ElevenLabs TTS via edge function */
export async function speakWithElevenLabs(
  text: string,
  onEnd?: () => void,
  signal?: AbortSignal
): Promise<void> {
  const plainText = stripForSpeech(text);
  if (!plainText) { onEnd?.(); return; }

  // Truncate if too long for TTS
  const speechText = plainText.length > MAX_TTS_LENGTH
    ? plainText.slice(0, MAX_TTS_LENGTH) + '...'
    : plainText;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');

    if (signal?.aborted) { onEnd?.(); return; }

    const response = await fetch(TTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ text: speechText, voiceId: VOICE_ID }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`TTS failed [${response.status}]`);
    }

    const audioBuffer = await response.arrayBuffer();

    if (signal?.aborted) { onEnd?.(); return; }

    await playGeneratedAudio(audioBuffer, 0.9);
    onEnd?.();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      // Intentional stop
    } else {
      console.error('[ElevenLabs TTS] Error:', error);
    }
    onEnd?.();
  }
}

/** Stop any currently playing ElevenLabs audio */
export function stopElevenLabsSpeaking(): void {
  if (currentAudioController) {
    currentAudioController.abort();
    currentAudioController = null;
  }
}

/** High-level speak function that manages the abort controller */
export function speakText(text: string, onEnd?: () => void): void {
  stopElevenLabsSpeaking();
  const controller = new AbortController();
  currentAudioController = controller;

  speakWithElevenLabs(text, () => {
    if (currentAudioController === controller) {
      currentAudioController = null;
    }
    onEnd?.();
  }, controller.signal);
}

/** Alias for stopElevenLabsSpeaking for backward compat */
export function stopSpeaking(): void {
  stopElevenLabsSpeaking();
}
