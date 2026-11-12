type Mood = 'default' | 'happy' | 'thinking' | 'alert';

// Domi — the Domio AI Assistant mascot. A little house-shaped robot.
// viewBox is always 0 0 120 130; `size` drives the rendered width/height.
export default function Domi({
  mood = 'default',
  size = 64,
  className,
}: {
  mood?: Mood;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={(size * 130) / 120}
      viewBox="0 0 120 130"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Happy: glow circles above the roof */}
      {mood === 'happy' && (
        <g>
          <circle cx="60" cy="30" r="6" fill="#223144" opacity="0.6" />
          <circle cx="76" cy="22" r="4" fill="#223144" opacity="0.4" />
          <circle cx="44" cy="22" r="4" fill="#223144" opacity="0.4" />
        </g>
      )}

      {/* Arms (drawn before the body so they tuck behind it) */}
      {mood === 'happy' ? (
        <>
          <rect x="100" y="68" width="14" height="10" rx="5" fill="#223144" transform="rotate(-20 107 65)" />
          <rect x="6" y="68" width="14" height="10" rx="5" fill="#223144" transform="rotate(20 13 65)" />
        </>
      ) : mood === 'alert' ? (
        <>
          <rect x="6" y="72" width="14" height="10" rx="5" fill="#223144" />
          <rect x="100" y="72" width="14" height="10" rx="5" fill="#223144" />
        </>
      ) : (
        <>
          <rect x="6" y="68" width="14" height="10" rx="5" fill="#223144" />
          <rect x="100" y="68" width="14" height="10" rx="5" fill="#223144" />
        </>
      )}

      {/* Legs */}
      <rect x="44" y="116" width="12" height="14" rx="4" fill="#8D3B32" />
      <rect x="64" y="116" width="12" height="14" rx="4" fill="#8D3B32" />

      {/* Golden triangle roof */}
      <polygon points="60,10 14,52 106,52" fill="#223144" />

      {/* Violet body */}
      <rect x="22" y="52" width="76" height="64" rx="8" fill="#A4473D" />

      {/* Eye windows */}
      <rect x="36" y="66" width="18" height="18" rx="4" fill="#223144" />
      <rect x="66" y="66" width="18" height="18" rx="4" fill="#223144" />

      {/* Eyebrows */}
      {mood === 'thinking' && (
        <>
          <rect x="40" y="63" width="8" height="3" rx="1" fill="#8D3B32" />
          <rect x="70" y="63" width="8" height="3" rx="1" fill="#8D3B32" />
        </>
      )}
      {mood === 'alert' && (
        <>
          <line x1="38" y1="63" x2="52" y2="67" stroke="#E85555" strokeWidth="2" strokeLinecap="round" />
          <line x1="68" y1="63" x2="82" y2="67" stroke="#E85555" strokeWidth="2" strokeLinecap="round" />
        </>
      )}

      {/* Eyes */}
      {mood === 'thinking' ? (
        <>
          <ellipse cx="44" cy="75" rx="5" ry="3" fill="#fff" />
          <ellipse cx="74" cy="75" rx="5" ry="3" fill="#fff" />
          <circle cx="45.5" cy="72" r="1.5" fill="#223144" />
          <circle cx="75.5" cy="72" r="1.5" fill="#223144" />
        </>
      ) : (
        <>
          <circle cx="44" cy="73" r="5" fill="#fff" />
          <circle cx="74" cy="73" r="5" fill="#fff" />
          {mood === 'happy' ? (
            <>
              <circle cx="43" cy="72" r="2" fill="#223144" />
              <circle cx="73" cy="72" r="2" fill="#223144" />
            </>
          ) : mood === 'alert' ? (
            <>
              <circle cx="45.5" cy="74" r="2" fill="#223144" />
              <circle cx="75.5" cy="74" r="2" fill="#223144" />
            </>
          ) : (
            <>
              <circle cx="45.5" cy="72" r="2" fill="#223144" />
              <circle cx="75.5" cy="72" r="2" fill="#223144" />
            </>
          )}
        </>
      )}

      {/* Mouth */}
      {mood === 'happy' ? (
        <path d="M42 88 Q60 102 78 88" fill="none" stroke="#223144" strokeWidth="3" strokeLinecap="round" />
      ) : mood === 'thinking' ? (
        <path d="M46 91 Q60 88 74 91" fill="none" stroke="#8D3B32" strokeWidth="2" strokeLinecap="round" />
      ) : mood === 'alert' ? (
        <path d="M46 93 Q60 89 74 93" fill="none" stroke="#E85555" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path d="M44 90 Q60 100 76 90" fill="none" stroke="#8D3B32" strokeWidth="2.5" strokeLinecap="round" />
      )}
    </svg>
  );
}
