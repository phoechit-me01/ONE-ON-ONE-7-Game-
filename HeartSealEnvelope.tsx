import React from 'react';

interface HeartSealEnvelopeProps {
  isLocked?: boolean;
  size?: number;
  className?: string;
}

/**
 * Visual asset showing an envelope sealed with a heart (Heart Seal icon).
 * - Level 1 (Unlocked): Crisp envelope with Warm Rose Red (#E65C65) heart seal.
 * - Levels 2-100 (Locked): Dimmed grayscale envelope with muted slate seal.
 */
export const HeartSealEnvelope: React.FC<HeartSealEnvelopeProps> = ({
  isLocked = false,
  size = 36,
  className = '',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 34"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-label={isLocked ? 'Locked Heart-Sealed Envelope' : 'Unlocked Heart-Sealed Envelope'}
    >
      {/* Envelope Body */}
      <rect
        x="2"
        y="4"
        width="36"
        height="26"
        rx="4"
        fill={isLocked ? '#F1F5F9' : '#FFFFFF'}
        stroke={isLocked ? '#CBD5E1' : '#E2E8F0'}
        strokeWidth="1.5"
      />

      {/* Flap Diagonal Fold Lines */}
      <path
        d="M 3 6 L 20 18 L 37 6"
        stroke={isLocked ? '#CBD5E1' : '#E2E8F0'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 3 28 L 13 18"
        stroke={isLocked ? '#CBD5E1' : '#E2E8F0'}
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path
        d="M 37 28 L 27 18"
        stroke={isLocked ? '#CBD5E1' : '#E2E8F0'}
        strokeWidth="1"
        strokeLinecap="round"
      />

      {/* Heart Wax Seal positioned at the center fold */}
      <circle
        cx="20"
        cy="18"
        r="7.5"
        fill={isLocked ? '#94A3B8' : '#E65C65'}
        stroke={isLocked ? '#64748B' : '#D14952'}
        strokeWidth="0.8"
      />

      {/* Heart imprint inside the seal */}
      <path
        d="M 20 16.2 C 20 14.5 17.5 13.5 16.5 14.8 C 15.5 16.2 17.4 18.2 20 20.2 C 22.6 18.2 24.5 16.2 23.5 14.8 C 22.5 13.5 20 14.5 20 16.2 Z"
        fill="#FFFFFF"
      />
    </svg>
  );
};

export default HeartSealEnvelope;
