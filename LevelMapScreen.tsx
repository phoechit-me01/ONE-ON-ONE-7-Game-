import React, { useState, useMemo, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db, auth, resolveActiveUserId, SESSION_CHANGE_EVENT } from '../firebase';
import { LevelEnvelope, LevelState } from './LevelEnvelope';
import { LevelDetailModal } from './LevelDetailModal';

interface LevelMapScreenProps {
  onBackToHome: () => void;
  completedLevels?: number[];
  unlockedLevel?: number;
  onStartLevel?: (level: number) => void;
}

interface LevelCoord {
  level: number;
  x: number;
  y: number;
  state: LevelState;
}

const ROW_HEIGHT = 120;
const CANVAS_WIDTH = 400; // coordinate space inside mobile container
const X_LEFT = 75;
const X_CENTER = 200;
const X_RIGHT = 325;

/**
 * Section 2B: Main Winding Level Map Structure
 * Strict specifications:
 * - Max-width 430px, aspect ratio 9:16 portrait, vertical scroll enabled
 * - Background: #FAF8F5 (Soft Warm Cream)
 * - Strict Zero-Animation Policy: Absolutely NO animations, transitions, blur, glow, or shadows
 * - Zig-zag winding snake path spanning alternating left, center, and right alignments
 * - Solid line connector color #CBD5E1, line thickness 2px
 * - Initial render strictly restricted to Level 1 to 30; subsequent 30 levels load automatically
 *   upon scrolling past Level 30. Page buttons and auxiliary pagination text are prohibited.
 * - Envelope Width 100px, height 80px, border-radius 12px
 * - Unlocked levels: Red (#E65C65) with heart seal; Completed: Yellow (#FFF3BF); Locked: Gray (#E2E8F0)
 */
export const LevelMapScreen: React.FC<LevelMapScreenProps> = ({
  onBackToHome,
  completedLevels: propCompletedLevels = [],
  unlockedLevel: propUnlockedLevel = 1,
  onStartLevel,
}) => {
  // Pagination: strictly Level 1 through 30 initially, batch loads 30 upon scrolling
  const [visibleCount, setVisibleCount] = useState<number>(30);
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [completedLevels, setCompletedLevels] = useState<number[]>(propCompletedLevels);
  const [unlockedLevels, setUnlockedLevels] = useState<number[]>([]);
  const [maxUnlockedLevel, setMaxUnlockedLevel] = useState<number>(() => {
    try {
      const userId = resolveActiveUserId(auth.currentUser);
      const saved = localStorage.getItem(`one_on_one_unlocked_level_${userId}`);
      const parsed = saved ? parseInt(saved, 10) : 1;
      return Math.max(propUnlockedLevel || 1, !isNaN(parsed) ? parsed : 1);
    } catch {
      return propUnlockedLevel || 1;
    }
  });

  // Sync prop changes immediately
  useEffect(() => {
    if (propUnlockedLevel) {
      setMaxUnlockedLevel((prev) => Math.max(prev, propUnlockedLevel));
    }
  }, [propUnlockedLevel]);

  useEffect(() => {
    if (propCompletedLevels && propCompletedLevels.length > 0) {
      setCompletedLevels((prev) => Array.from(new Set([...prev, ...propCompletedLevels])));
    }
  }, [propCompletedLevels]);

  // Sync real-time completed and unlocked levels from Firestore
  useEffect(() => {
    let unsubUser: (() => void) | null = null;
    let unsubProgress: (() => void) | null = null;

    const bindLevelSubscriptions = (currentUser = auth.currentUser) => {
      if (unsubUser) {
        unsubUser();
        unsubUser = null;
      }
      if (unsubProgress) {
        unsubProgress();
        unsubProgress = null;
      }

      const userId = resolveActiveUserId(currentUser);
      setCompletedLevels([]);
      setUnlockedLevels([]);
      setMaxUnlockedLevel(1);

      const userDocRef = doc(db, 'users', userId);
      const progressColRef = collection(db, 'users', userId, 'level_progress');

      // 1. Listen to aggregate unlocked_level in user doc
      unsubUser = onSnapshot(
        userDocRef,
        (userSnap) => {
          if (userSnap.exists()) {
            const uData = userSnap.data();
            const highest = Number(uData.unlocked_level || uData.highest_level_unlocked || 1);
            if (!isNaN(highest) && highest >= 1) {
              setMaxUnlockedLevel((prev) => Math.max(prev, highest));
            }
          }
        },
        () => {}
      );

      // 2. Listen to individual level progress records
      unsubProgress = onSnapshot(
        progressColRef,
        (snapshot) => {
          const completed: number[] = [];
          const unlocked: number[] = [];
          let dynamicHighest = 1;

          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (!docSnap.id.startsWith('level_')) return;
            const lvlId = docSnap.id.replace('level_', '');
            const lvlNum = parseInt(lvlId, 10);
            if (!isNaN(lvlNum)) {
              if (data.status === 'completed' || data.completed === true) {
                completed.push(lvlNum);
                dynamicHighest = Math.max(dynamicHighest, lvlNum + 1);
              } else if (
                data.status === 'given_up' ||
                data.status === 'unlocked' ||
                data.unlocked === true
              ) {
                unlocked.push(lvlNum);
                if (data.status === 'given_up') {
                  dynamicHighest = Math.max(dynamicHighest, lvlNum + 1);
                } else {
                  dynamicHighest = Math.max(dynamicHighest, lvlNum);
                }
              }
            }
          });

          setCompletedLevels(completed);
          setUnlockedLevels(unlocked);
          setMaxUnlockedLevel((prev) => Math.max(prev, dynamicHighest));
        },
        (err) => {
          console.warn('Level progress subscription notice:', err.message);
        }
      );
    };

    const unsubscribeAuth = auth.onAuthStateChanged((currentUser) => {
      bindLevelSubscriptions(currentUser);
    });

    const handleSessionChange = () => {
      bindLevelSubscriptions(auth.currentUser);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(SESSION_CHANGE_EVENT, handleSessionChange);
    }

    return () => {
      unsubscribeAuth();
      if (typeof window !== 'undefined') {
        window.removeEventListener(SESSION_CHANGE_EVENT, handleSessionChange);
      }
      if (unsubUser) unsubUser();
      if (unsubProgress) unsubProgress();
    };
  }, []);

  // Pre-calculate coordinates for all 100 levels
  const allLevelCoords: LevelCoord[] = useMemo(() => {
    const list: LevelCoord[] = [];
    for (let i = 1; i <= 100; i++) {
      const k = i - 1;
      // Zig-zag winding snake pattern: Left -> Center -> Right -> Center -> Left...
      let x = X_CENTER;
      const mod = k % 4;
      if (mod === 0) x = X_LEFT;
      else if (mod === 1) x = X_CENTER;
      else if (mod === 2) x = X_RIGHT;
      else if (mod === 3) x = X_CENTER;

      const y = k * ROW_HEIGHT + 60; // center Y

      let state: LevelState = 'locked';
      if (completedLevels.includes(i)) {
        state = 'completed';
      } else if (i <= maxUnlockedLevel || unlockedLevels.includes(i) || i === 1) {
        state = 'unlocked';
      }

      list.push({ level: i, x, y, state });
    }
    return list;
  }, [completedLevels, unlockedLevels, maxUnlockedLevel]);

  // Current visible slice according to scroll pagination
  const visibleLevels = useMemo(() => {
    return allLevelCoords.slice(0, visibleCount);
  }, [allLevelCoords, visibleCount]);

  // Automatic infinite scroll batch loading (no page buttons, no auxiliary text)
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 350) {
      setVisibleCount((prev) => {
        if (prev < 100) {
          return Math.min(prev + 30, 100);
        }
        return prev;
      });
    }
  };

  const totalMapHeight = visibleLevels.length * ROW_HEIGHT + 40;

  return (
    <div className="w-full flex-1 flex flex-col bg-[#FAF8F5] select-none relative overflow-hidden">
      {/* --- Top Header / Navigation --- */}
      <header className="sticky top-0 z-30 w-full h-[60px] bg-[#FAF8F5] border-b border-[#E2E8F0] px-4 flex items-center justify-between shrink-0">
        <button
          type="button"
          onClick={onBackToHome}
          className="flex items-center gap-1.5 text-[14px] font-bold text-[#2563EB] cursor-pointer focus:outline-none"
          aria-label="Back to Home"
        >
          <ArrowLeft size={18} />
          <span>Back to Home</span>
        </button>

        <h1 className="text-[17px] font-bold text-[#2C3E50] tracking-wide uppercase">
          LEVEL MAP
        </h1>

        <div className="w-24" aria-hidden="true" />
      </header>

      {/* --- Vertical Scrollable Level Map Container --- */}
      <div
        onScroll={handleScroll}
        className="flex-1 w-full overflow-y-auto relative"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div
          className="relative mx-auto"
          style={{
            width: `${CANVAS_WIDTH}px`,
            minHeight: `${totalMapHeight}px`,
          }}
        >
          {/* --- Path Connector Lines (Solid #CBD5E1, line thickness 2px) --- */}
          <svg
            className="absolute inset-0 pointer-events-none"
            style={{
              width: `${CANVAS_WIDTH}px`,
              height: `${totalMapHeight}px`,
            }}
          >
            {visibleLevels.map((coord, idx) => {
              if (idx === visibleLevels.length - 1) return null;
              const next = visibleLevels[idx + 1];
              return (
                <line
                  key={`line-${coord.level}-${next.level}`}
                  x1={coord.x}
                  y1={coord.y}
                  x2={next.x}
                  y2={next.y}
                  stroke="#CBD5E1"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              );
            })}
          </svg>

          {/* --- Envelopes (Width 100px, height 80px, border-radius 12px) --- */}
          {visibleLevels.map((coord) => (
            <div
              key={coord.level}
              className="absolute z-10"
              style={{
                left: `${coord.x}px`,
                top: `${coord.y - 40}px`,
                transform: 'translateX(-50%)',
              }}
            >
              <LevelEnvelope
                level={coord.level}
                state={coord.state}
                onClick={() => setSelectedLevel(coord.level)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* --- Section 2C: Level Detail Modal --- */}
      {selectedLevel !== null && (
        <LevelDetailModal
          level={selectedLevel}
          isCompleted={completedLevels.includes(selectedLevel)}
          onClose={() => setSelectedLevel(null)}
          onStartLevel={(lvl) => {
            setSelectedLevel(null);
            onStartLevel?.(lvl);
          }}
        />
      )}
    </div>
  );
};

export default LevelMapScreen;
