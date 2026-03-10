import { cn } from '@/lib/utils';

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface VoiceVisualizerProps {
  state: VoiceState;
  className?: string;
}

const stateConfig = {
  idle: {
    label: 'Tap mic to speak',
    sublabel: 'Voice mode active',
    color: 'from-primary/20 to-primary/5',
    ringColor: 'border-primary/20',
    dotColor: 'bg-primary/40',
  },
  listening: {
    label: 'Listening...',
    sublabel: 'Speak now',
    color: 'from-emerald-500/25 to-emerald-500/5',
    ringColor: 'border-emerald-500/30',
    dotColor: 'bg-emerald-500',
  },
  thinking: {
    label: 'Processing...',
    sublabel: 'Analyzing your query',
    color: 'from-amber-500/20 to-amber-500/5',
    ringColor: 'border-amber-500/25',
    dotColor: 'bg-amber-500',
  },
  speaking: {
    label: 'Speaking...',
    sublabel: 'Tap to interrupt',
    color: 'from-primary/25 to-violet-500/10',
    ringColor: 'border-primary/30',
    dotColor: 'bg-primary',
  },
};

export function VoiceVisualizer({ state, className }: VoiceVisualizerProps) {
  const config = stateConfig[state];
  const isActive = state !== 'idle';

  return (
    <div className={cn('flex flex-col items-center justify-center gap-6', className)}>
      {/* Visualizer orb */}
      <div className="relative flex items-center justify-center">
        {/* Outer pulse rings */}
        {isActive && (
          <>
            <div
              className={cn(
                'absolute w-36 h-36 rounded-full border-2 opacity-0',
                config.ringColor,
                state === 'listening' && 'animate-[voicePing_2s_ease-out_infinite]',
                state === 'speaking' && 'animate-[voicePing_1.5s_ease-out_infinite]',
                state === 'thinking' && 'animate-[voicePing_2.5s_ease-out_infinite]',
              )}
            />
            <div
              className={cn(
                'absolute w-36 h-36 rounded-full border-2 opacity-0',
                config.ringColor,
                state === 'listening' && 'animate-[voicePing_2s_ease-out_0.6s_infinite]',
                state === 'speaking' && 'animate-[voicePing_1.5s_ease-out_0.5s_infinite]',
                state === 'thinking' && 'animate-[voicePing_2.5s_ease-out_0.8s_infinite]',
              )}
            />
          </>
        )}

        {/* Glow backdrop */}
        <div
          className={cn(
            'absolute w-28 h-28 rounded-full bg-gradient-radial blur-xl transition-all duration-700',
            config.color,
            isActive ? 'opacity-80 scale-100' : 'opacity-30 scale-75'
          )}
        />

        {/* Main orb */}
        <div
          className={cn(
            'relative w-24 h-24 rounded-full bg-gradient-to-br flex items-center justify-center transition-all duration-500',
            config.color,
            'border-2',
            config.ringColor,
            'shadow-lg',
            state === 'listening' && 'scale-105',
            state === 'speaking' && 'scale-110',
          )}
        >
          {/* Inner waveform bars */}
          <div className="flex items-center gap-[3px]">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className={cn(
                  'w-[3px] rounded-full transition-all duration-300',
                  config.dotColor,
                  state === 'idle' && 'h-1.5 opacity-40',
                  state === 'listening' && 'animate-[waveBar_0.8s_ease-in-out_infinite] opacity-90',
                  state === 'thinking' && 'animate-[waveBar_1.2s_ease-in-out_infinite] opacity-60',
                  state === 'speaking' && 'animate-[waveBar_0.5s_ease-in-out_infinite] opacity-90',
                )}
                style={{
                  animationDelay: `${i * 0.1}s`,
                  height: state === 'idle' ? '6px' : undefined,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Status text */}
      <div className="text-center space-y-1">
        <p
          className={cn(
            'text-sm font-semibold tracking-wide transition-colors duration-300',
            state === 'listening' && 'text-emerald-500',
            state === 'thinking' && 'text-amber-500',
            state === 'speaking' && 'text-primary',
            state === 'idle' && 'text-muted-foreground',
          )}
        >
          {config.label}
        </p>
        <p className="text-[11px] text-muted-foreground">{config.sublabel}</p>
      </div>
    </div>
  );
}
