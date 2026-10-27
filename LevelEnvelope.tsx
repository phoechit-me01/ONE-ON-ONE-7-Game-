import React from 'react';
import { Lock } from 'lucide-react';

export type LevelState = 'locked' | 'unlocked' | 'completed';

interface LevelEnvelopeProps {
  level: number;
  state: LevelState;
  onClick?: () => void;
}

/**
 * Section 2B: Envelope Component (Level 1 to Level 100)
 * Strict specifications:
 * - Dimensions: Width 100px, height 80px, border-radius 12px
 * - Visual Style: Flap-sealed envelope vector featuring a center heart seal stamp
 * - Completely static: Zero animation, transitions, blur, glow, or shadow effects
 * - States:
 *   * Locked (Levels 2+): Bg #E2E8F0, Center padlock (🔒), Level number #94A3B8, pointer-events: none
 *   * Unlocked (Level 1 / Current): Bg #E65C65, Center heart seal stamp, Level number #FFFFFF, cursor: pointer, triggers modal
 *   * Completed: Bg #FFF3BF, Center heart seal stamp (zero star badges), Level number #2C3E50, cursor: pointer, triggers modal
 */
export const LevelEnvelope: React.FC<LevelEnvelopeProps> = ({
  level,
  state,
  onClick,
}) => {
  const isLocked = state === 'locked';
  const isUnlocked = state === 'unlocked';
  const isCompleted = state === 'completed';

  // State-specific color configurations
  const backgroundColor = isLocked
    ? '#E2E8F0'
    : isUnlocked
    ? '#E65C65'
    : '#FFF3BF';

  const numberColor = isLocked
    ? '#94A3B8'
    : isUnlocked
    ? '#FFFFFF'
    : '#2C3E50';

  const flapStrokeColor = isLocked
    ? '#CBD5E1'
    : isUnlocked
    ? '#F87171'
    : '#FDE047';

  const handleClick = () => {
    if (!isLocked && onClick) {
      onClick();
    }
  };

  return (
    <div
      role={isLocked ? undefined : 'button'}
      tabIndex={isLocked ? undefined : 0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (!isLocked && (e.key === 'Enter' || e.key === ' ')) {
          handleClick();
        }
      }}
      style={{
        width: '100px',
        height: '80px',
        backgroundColor,
        borderRadius: '12px',
        pointerEvents: isLocked ? 'none' : 'auto',
        cursor: isLocked ? 'default' : 'pointer',
        boxSizing: 'border-box',
      }}
      className="relative select-none flex flex-col justify-between p-2 border border-[#CBD5E1]/40"
      aria-label={`Level ${level} - ${state}`}
    >
      {/* --- Flap-sealed envelope vector lines --- */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 100 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Top diagonal flap fold */}
        <path
          d="M 2 2 L 50 42 L 98 2"
          stroke={flapStrokeColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Bottom corner diagonal fold lines */}
        <path
          d="M 2 78 L 36 38"
          stroke={flapStrokeColor}
          strokeWidth="1"
          strokeLinecap="round"
        />
        <path
          d="M 98 78 L 64 38"
          stroke={flapStrokeColor}
          strokeWidth="1"
          strokeLinecap="round"
        />
      </svg>

      {/* Top Header: Level Number */}
      <div className="z-10 flex items-center justify-between w-full">
        <span
          className="text-[12px] font-bold leading-none tracking-tight"
          style={{ color: numberColor }}
        >
          Level {level}
        </span>
      </div>

      {/* Center Element */}
      <div className="z-10 absolute inset-0 flex items-center justify-center pointer-events-none">
        {isLocked ? (
          /* Locked State: Padlock icon */
          <div className="w-7 h-7 rounded-full bg-[#CBD5E1] flex items-center justify-center text-[#64748B]">
            <Lock size={14} className="text-[#64748B]" />
          </div>
        ) : (
          /* Unlocked or Completed State: Center Heart Seal Stamp */
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: isUnlocked ? '#FFFFFF' : '#E65C65',
              border: isUnlocked ? '1.5px solid #FCA5A5' : '1.5px solid #DC2626',
            }}
          >
            {/* Heart Seal Stamp Icon */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                fill={isUnlocked ? '#E65C65' : '#FFFFFF'}
              />
            </svg>
          </div>
        )}
      </div>

      {/* Empty bottom spacer to keep layout balanced */}
      <div className="z-10 h-2" aria-hidden="true" />
    </div>
  );
};

export default LevelEnvelope;
