import React from 'react';

interface HeartLogoProps {
  size?: number;
  className?: string;
}

/**
 * Animated Heart Logo for "ONE ON ONE 7"
 * Features:
 * - Continuous infinite loop animation
 * - Progressive step-by-step stroke drawing in Warm Rose Red (#E65C65)
 * - Progressive, natural line-by-line / smooth sweep watercolor-staining fill in tandem
 * - Subtle heartbeat pulse before seamless infinite loop restart
 */
export const HeartLogo: React.FC<HeartLogoProps> = ({ size = 76, className = '' }) => {
  // SVG viewBox is 0 0 100 100
  // Symmetrical heart geometry with smooth organic curves
  const heartPath =
    'M 50 31 C 50 19 24 9 14 25 C 4 43 18 67 50 90 C 82 67 96 43 86 25 C 76 9 50 19 50 31 Z';

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      aria-label="One on One 7 Animated Heart Logo"
    >
      {/* Ambient background soft glow */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none opacity-40 blur-xl transition-all"
        style={{
          background: 'radial-gradient(circle, rgba(230, 92, 101, 0.45) 0%, rgba(255, 143, 163, 0) 70%)',
        }}
      />

      <svg
        viewBox="0 0 100 100"
        className="w-full h-full relative z-10 heart-glow-filter"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Main linear gradient for the heart fill and stain */}
          <linearGradient id="warmRoseGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#E65C65" />
            <stop offset="60%" stopColor="#FA7280" />
            <stop offset="100%" stopColor="#FF8FA3" />
          </linearGradient>

          {/* Shimmer sweep gradient for line-by-line staining highlight */}
          <linearGradient id="stainSweepGrad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#E65C65" stopOpacity="0.95" />
            <stop offset="45%" stopColor="#F56975" stopOpacity="0.9" />
            <stop offset="75%" stopColor="#FF8FA3" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#FFD1DC" stopOpacity="0.8" />
          </linearGradient>

          {/* Clip path defining the interior of the heart */}
          <clipPath id="heartInteriorClip">
            <path d={heartPath} />
          </clipPath>

          {/* Mask for line-by-line horizontal watercolor staining pattern */}
          <pattern id="stainLinesPattern" width="100" height="4" patternUnits="userSpaceOnUse">
            <line x1="0" y1="1" x2="100" y2="1" stroke="#ffffff" strokeWidth="2.5" />
            <line x1="0" y1="3" x2="100" y2="3" stroke="#ffffff" strokeWidth="1" strokeOpacity="0.6" />
          </pattern>
        </defs>

        {/* --- FILL PHASE: Progressively fills line by line and sweeps upward smoothly --- */}
        <g clipPath="url(#heartInteriorClip)" className="heart-pulse-container">
          {/* Rising liquid & stain layer with smooth sweep */}
          <g className="heart-fill-sweep-group">
            <rect
              x="0"
              y="0"
              width="100"
              height="100"
              fill="url(#stainSweepGrad)"
            />
            {/* Fine natural watercolor texture & line lines sweeping in tandem */}
            <rect
              x="0"
              y="0"
              width="100"
              height="100"
              fill="url(#warmRoseGradient)"
              opacity="0.35"
              className="heart-stain-lines"
            />
            {/* Subtle romantic inner highlight curve */}
            <path
              d="M 22 34 C 20 44 26 56 38 68"
              stroke="#FFFFFF"
              strokeWidth="2.5"
              strokeLinecap="round"
              opacity="0.35"
            />
          </g>
        </g>

        {/* --- STROKE PHASE: Outlined progressively step-by-step in Warm Rose Red (#E65C65) --- */}
        <g className="heart-pulse-container">
          <path
            d={heartPath}
            stroke="#E65C65"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength="100"
            className="heart-stroke-drawing"
          />
        </g>
      </svg>
    </div>
  );
};
