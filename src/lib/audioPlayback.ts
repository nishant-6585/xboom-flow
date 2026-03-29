let audioContextPromise: Promise<AudioContext | null> | null = null;

type ExtendedWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

async function getSharedAudioContext(): Promise<AudioContext | null> {
  if (typeof window === "undefined") return null;

  if (!audioContextPromise) {
    audioContextPromise = Promise.resolve().then(() => {
      const AudioContextConstructor =
        window.AudioContext || (window as ExtendedWindow).webkitAudioContext;

      if (!AudioContextConstructor) {
        return null;
      }

      return new AudioContextConstructor();
    });
  }

  return audioContextPromise;
}

export async function unlockAppAudio() {
  const context = await getSharedAudioContext();
  if (!context) return false;

  if (context.state === "suspended") {
    await context.resume();
  }

  const buffer = context.createBuffer(1, 1, 22050);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start(0);

  return true;
}

export async function playGeneratedAudio(audioBuffer: ArrayBuffer, volume = 0.9) {
  const context = await getSharedAudioContext();

  if (!context) {
    const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    audio.volume = volume;

    try {
      await audio.play();
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("Audio element playback failed"));
      });
    } finally {
      URL.revokeObjectURL(audioUrl);
    }

    return;
  }

  if (context.state === "suspended") {
    await context.resume();
  }

  const decodedBuffer = await context.decodeAudioData(audioBuffer.slice(0));

  await new Promise<void>((resolve, reject) => {
    const source = context.createBufferSource();
    const gainNode = context.createGain();

    gainNode.gain.value = volume;
    source.buffer = decodedBuffer;
    source.connect(gainNode);
    gainNode.connect(context.destination);

    source.onended = () => resolve();

    try {
      source.start(0);
    } catch (error) {
      reject(error instanceof Error ? error : new Error("Web Audio playback failed"));
    }
  });
}