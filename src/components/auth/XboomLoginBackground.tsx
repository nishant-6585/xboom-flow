import { useMemo } from "react";

export default function XboomLoginBackground() {
  const particles = useMemo(
    () =>
      Array.from({ length: 42 }, (_, i) => ({
        id: i,
        left: `${Math.random() * 100}%`,
        top: `${25 + Math.random() * 65}%`,
        duration: `${6 + Math.random() * 10}s`,
        delay: `${Math.random() * 8}s`,
        opacity: 0.15 + Math.random() * 0.45,
        size: 2 + Math.random() * 3,
      })),
    []
  );

  return (
    <div className="absolute inset-0 overflow-hidden select-none pointer-events-none">
      {/* Deep gradient sky */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0e1a] via-[#101624] to-[#181e2e]" />

      {/* Subtle aurora / glow at top */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120%] h-[40%] bg-gradient-to-b from-[#f97316]/8 via-[#3b82f6]/5 to-transparent rounded-full blur-3xl" />

      {/* Warm glow at horizon */}
      <div className="absolute bottom-0 left-0 right-0 h-[38%] bg-gradient-to-t from-[#f97316]/10 via-[#f97316]/4 to-transparent" />

      {/* Fog layers */}
      <div
        className="absolute bottom-[8%] left-0 right-0 h-[18%] bg-gradient-to-t from-[#f97316]/6 to-transparent opacity-70"
        style={{ animation: "fogFloat 12s ease-in-out infinite alternate" }}
      />
      <div
        className="absolute bottom-[4%] left-0 right-0 h-[10%] bg-gradient-to-t from-[#0a0e1a]/80 to-transparent opacity-80"
        style={{ animation: "fogFloat 16s ease-in-out infinite alternate-reverse" }}
      />

      {/* Grid / ground pattern */}
      <svg className="absolute bottom-0 left-0 w-full h-[32%] opacity-10" viewBox="0 0 800 260" preserveAspectRatio="none">
        <defs>
          <linearGradient id="gridFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0" />
            <stop offset="60%" stopColor="#f97316" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        {/* Horizontal lines */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <line key={`h${i}`} x1="0" y1={60 + i * 28} x2="800" y2={60 + i * 28} stroke="url(#gridFade)" strokeWidth="0.7" />
        ))}
        {/* Vertical lines */}
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
          <line key={`v${i}`} x1={80 * i} y1="60" x2={80 * i} y2="260" stroke="url(#gridFade)" strokeWidth="0.5" />
        ))}
      </svg>

      {/* Star field */}
      <svg className="absolute inset-0 w-full h-full opacity-60" viewBox="0 0 800 600" preserveAspectRatio="none">
        {[
          [120, 60], [250, 90], [400, 40], [550, 110], [680, 55],
          [80, 180], [310, 160], [520, 200], [700, 170], [160, 260],
          [440, 250], [620, 300], [60, 350], [360, 330], [740, 360],
          [200, 400],
        ].map(([cx, cy], i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={0.7 + (i % 3) * 0.4}
            fill="white"
            opacity={0.3 + (i % 4) * 0.15}
            style={{ animation: `blink ${2 + (i % 3)}s ease-in-out ${(i % 5) * 0.7}s infinite` }}
          />
        ))}
      </svg>

      {/* Drones / floating shapes */}
      {[
        "left-[42%] top-[10%] h-[6vw] min-h-[70px] w-[9vw] min-w-[110px] max-w-[150px]",
        "right-[18%] top-[13%] h-[5vw] min-h-[55px] w-[7vw] min-w-[85px] blur-[0.6px]",
        "left-[18%] top-[8%] h-[4.4vw] min-h-[48px] w-[6vw] min-w-[76px] blur-[1px] opacity-80",
      ].map((cls, i) => (
        <div
          key={`drone-${i}`}
          className={`absolute ${cls} ${i > 0 ? "hidden sm:block" : ""}`}
          style={{ animation: `hover ${5 + i * 1.5}s ease-in-out infinite` }}
        >
          <svg viewBox="0 0 120 56" fill="none" className="w-full h-full">
            <ellipse cx="60" cy="40" rx="38" ry="8" fill="#f97316" opacity="0.08" />
            <rect x="36" y="22" width="48" height="16" rx="8" fill="#1e293b" stroke="#f97316" strokeWidth="1.2" opacity="0.85" />
            <rect x="20" y="26" width="16" height="3" rx="1.5" fill="#334155" opacity="0.7" />
            <rect x="84" y="26" width="16" height="3" rx="1.5" fill="#334155" opacity="0.7" />
            <circle cx="60" cy="30" r="3" fill="#f97316" opacity="0.9" style={{ animation: "glowBreath 2s ease-in-out infinite" }} />
            <circle cx="48" cy="30" r="1.5" fill="#3b82f6" opacity="0.7" />
            <circle cx="72" cy="30" r="1.5" fill="#3b82f6" opacity="0.7" />
          </svg>
        </div>
      ))}

      {/* Robot silhouette */}
      <div className="absolute bottom-[12%] left-[12%] opacity-40" style={{ animation: "idleRobot 4s ease-in-out infinite" }}>
        <svg width="54" height="72" viewBox="0 0 54 72" fill="none">
          <rect x="14" y="18" width="26" height="22" rx="7" fill="#1e293b" stroke="#f97316" strokeWidth="1" />
          <circle cx="22" cy="28" r="3" fill="#f97316" opacity="0.8" />
          <circle cx="32" cy="28" r="3" fill="#f97316" opacity="0.8" />
          <rect x="18" y="42" width="18" height="18" rx="4" fill="#1e293b" stroke="#334155" strokeWidth="0.8" />
          <rect x="10" y="44" width="6" height="12" rx="3" fill="#334155" />
          <rect x="38" y="44" width="6" height="12" rx="3" fill="#334155" />
          <rect x="20" y="62" width="5" height="8" rx="2" fill="#334155" />
          <rect x="29" y="62" width="5" height="8" rx="2" fill="#334155" />
          <line x1="27" y1="8" x2="27" y2="18" stroke="#f97316" strokeWidth="1" />
          <circle cx="27" cy="6" r="3" fill="#f97316" opacity="0.6" style={{ animation: "glowBreath 3s ease-in-out infinite" }} />
        </svg>
      </div>

      {/* Dog silhouette */}
      <div className="absolute bottom-[11%] right-[14%] opacity-35" style={{ animation: "idleDog 3.5s ease-in-out infinite" }}>
        <svg width="56" height="40" viewBox="0 0 56 40" fill="none">
          <ellipse cx="28" cy="24" rx="16" ry="10" fill="#1e293b" stroke="#334155" strokeWidth="0.8" />
          <ellipse cx="14" cy="18" rx="6" ry="8" fill="#1e293b" stroke="#334155" strokeWidth="0.7" />
          <circle cx="12" cy="16" r="2" fill="#f97316" opacity="0.8" />
          <circle cx="16" cy="16" r="2" fill="#f97316" opacity="0.8" />
          <rect x="6" y="10" width="4" height="7" rx="2" fill="#1e293b" transform="rotate(-15 6 10)" />
          <rect x="16" y="9" width="4" height="7" rx="2" fill="#1e293b" transform="rotate(10 16 9)" />
          <path d="M44 24 Q52 22 50 28" stroke="#334155" strokeWidth="1.2" fill="none" />
          <rect x="18" y="32" width="4" height="7" rx="2" fill="#334155" />
          <rect x="26" y="32" width="4" height="7" rx="2" fill="#334155" />
          <rect x="34" y="32" width="4" height="7" rx="2" fill="#334155" />
        </svg>
      </div>

      {/* Subtitle float */}
      <div
        className="absolute bottom-[18%] left-1/2 -translate-x-1/2 text-center opacity-60"
        style={{ animation: "subFloat 6s ease-in-out infinite" }}
      >
        <div className="text-[0.7rem] tracking-[0.35em] uppercase text-orange-400/70 font-medium">
          Xboom Robotics
        </div>
        <div className="text-[0.55rem] tracking-[0.2em] text-blue-300/40 mt-1">
          Workflow Intelligence
        </div>
      </div>

      {/* Floating particles */}
      <div className="absolute inset-0">
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute rounded-full bg-orange-400"
            style={{
              left: p.left,
              top: p.top,
              width: p.size,
              height: p.size,
              opacity: p.opacity,
              animation: `floatUp ${p.duration} ease-in ${p.delay} infinite`,
            }}
          />
        ))}
      </div>

      {/* Vignette overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.5)_100%)]" />

      {/* Animations */}
      <style>{`
        @keyframes fogFloat {
          from { transform: translateY(0px) scale(1); }
          to { transform: translateY(-10px) scale(1.03); }
        }
        @keyframes idleRobot {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        @keyframes idleDog {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }
        @keyframes hover {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(8px); }
        }
        @keyframes subFloat {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(-8px); }
        }
        @keyframes glowBreath {
          0%, 100% { opacity: 0.72; }
          50% { opacity: 1; }
        }
        @keyframes blink {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes floatUp {
          from { transform: translateY(18px); opacity: 0; }
          20% { opacity: 0.55; }
          to { transform: translateY(-120px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
