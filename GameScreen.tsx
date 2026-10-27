import React, { useState, useEffect, useRef, useCallback } from 'react';
import { doc, onSnapshot, setDoc, increment, runTransaction } from 'firebase/firestore';
import { db, auth, resolveActiveUserId } from '../firebase';
import { transformGoogleDriveImageUrl } from './LevelDetailModal';
import { ArrowLeft, CheckCircle2, RotateCcw, Flag } from 'lucide-react';

interface GameScreenProps {
  level: number;
  onExitGame: () => void;
  onLevelUnlocked?: (nextLevel: number) => void;
}

type GridType = '4x3' | '6x4';

interface GridConfig {
  cols: number;
  rows: number;
  total: number;
  aspectRatio: string;
}

const GRID_CONFIGS: Record<GridType, GridConfig> = {
  '4x3': { cols: 4, rows: 3, total: 12, aspectRatio: '4 / 3' },
  '6x4': { cols: 6, rows: 4, total: 24, aspectRatio: '3 / 2' },
};

function formatMMSS(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Generate shuffled array of indices [0 ... count-1]
function generateShuffledTiles(count: number): number[] {
  const arr = Array.from({ length: count }, (_, i) => i);
  let isSorted = true;
  let attempts = 0;
  while (isSorted && attempts < 100) {
    attempts++;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    let matches = 0;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] === i) matches++;
    }
    if (matches < count - 2) {
      isSorted = false;
    }
  }
  return arr;
}

/**
 * Section 3 & 4: Gameplay Screen & Database Sync Engine
 * Strict specifications:
 * - Max-width 430px, height 100vh, pure black background (#000000), vertical flex layout
 * - Top Header: Top-Left thumbnail (60x60, 1px solid #334155, radius 6px) + Metrics cluster (Time, Moves)
 * - Puzzle Board: Width 90%, #0F172A, border 2px solid #334155, radius 8px, cut lines 1px solid #475569
 * - Interaction: Tap-and-swap and drag/slide. Selected tile: border 2px solid #FEF08A & rgba(254,240,138,0.15)
 * - Special Level (level % 6 === 0): Numbers 1-12/24 overlay badge (rgba(0,0,0,0.5), 12px, weight 700, #FFFFFF)
 * - Zone 1: 4x3 & 6x4 Grid selector
 * - Zone 2: Restart (R++) & Give Up buttons
 * - Zone 3: "🔢 Show Number: Active" indicator on level % 6 === 0
 * - Section 4 Database Sync: Computes S_base, S_final, Gold, Gems, and writes to Firestore
 */
export const GameScreen: React.FC<GameScreenProps> = ({ level, onExitGame, onLevelUnlocked }) => {
  const [gridType, setGridType] = useState<GridType>('4x3');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [tiles, setTiles] = useState<number[]>(() => generateShuffledTiles(GRID_CONFIGS['4x3'].total));
  const [selectedTileIndex, setSelectedTileIndex] = useState<number | null>(null);

  // Gameplay Metrics
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [movesCount, setMovesCount] = useState<number>(0);
  const [restartsCount, setRestartsCount] = useState<number>(0);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [isGivenUp, setIsGivenUp] = useState<boolean>(false);

  // Result Metrics
  const [finalScore, setFinalScore] = useState<number>(0);
  const [earnedGold, setEarnedGold] = useState<number>(0);
  const [earnedGems, setEarnedGems] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const isSpecialLevel = level % 6 === 0;
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const levelStartTimeMsRef = useRef<number>(Date.now());
  const pendingSyncRef = useRef<Promise<void> | null>(null);

  // Synchronous refs for 0ms event handling without side effects inside React state updaters
  const tilesRef = useRef<number[]>(tiles);
  const elapsedTimeRef = useRef<number>(0);
  const movesCountRef = useRef<number>(0);
  const restartsCountRef = useRef<number>(0);
  const gridTypeRef = useRef<GridType>('4x3');
  const isFinishedRef = useRef<boolean>(false);

  tilesRef.current = tiles;
  elapsedTimeRef.current = elapsedTime;
  movesCountRef.current = movesCount;
  restartsCountRef.current = restartsCount;
  gridTypeRef.current = gridType;

  useEffect(() => {
    levelStartTimeMsRef.current = Date.now();
  }, [level]);

  // Instant Touch & Directional Gesture Mechanics Tracking
  const touchStartRef = useRef<{
    x: number;
    y: number;
    slot: number;
    swapped: boolean;
    hasMoved: boolean;
  } | null>(null);
  const lastTouchHandledTime = useRef<number>(0);

  // 1. Fetch Source Puzzle Image from `levels_master`
  useEffect(() => {
    let isMounted = true;
    let unsubscribeFallback: (() => void) | null = null;
    const docRefPrimary = doc(db, 'levels_master', `level_${level}`);
    const docRefFallback = doc(db, 'levels_master', String(level));

    const unsubscribePrimary = onSnapshot(
      docRefPrimary,
      (docSnap) => {
        if (!isMounted) return;
        if (docSnap.exists() && docSnap.data()?.image_url) {
          const direct = transformGoogleDriveImageUrl(docSnap.data().image_url);
          setImageUrl(direct);
          return;
        }

        if (!unsubscribeFallback) {
          unsubscribeFallback = onSnapshot(
            docRefFallback,
            (fbSnap) => {
              if (!isMounted) return;
              if (fbSnap.exists() && fbSnap.data()?.image_url) {
                const direct = transformGoogleDriveImageUrl(fbSnap.data().image_url);
                setImageUrl(direct);
              }
            },
            () => {}
          );
        }
      },
      (err) => {
        console.warn('levels_master fetch notice:', err.message);
      }
    );

    return () => {
      isMounted = false;
      unsubscribePrimary();
      if (unsubscribeFallback) {
        unsubscribeFallback();
      }
    };
  }, [level]);

  // 2. Timer
  useEffect(() => {
    if (isCompleted || isGivenUp) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setElapsedTime((prev) => {
        const next = prev + 1;
        elapsedTimeRef.current = next;
        return next;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isCompleted, isGivenUp]);

  // Active user determination
  const getActiveUserId = useCallback((): string => {
    return resolveActiveUserId(auth.currentUser);
  }, []);

  // Safe exit handler that ensures any in-flight Firestore write finishes before unmounting
  const handleSafeExit = useCallback(async () => {
    if (pendingSyncRef.current) {
      try {
        await Promise.race([
          pendingSyncRef.current,
          new Promise((resolve) => setTimeout(resolve, 2500)),
        ]);
      } catch {
        // Proceed to exit even if network timed out
      }
    }
    onExitGame();
  }, [onExitGame]);

  // 3. Section 4: Reward Calculation Engine and Firestore Sync + Level Progression Unlock
  const handleLevelCompleted = useCallback(
    async (finalTime: number, finalMoves: number, finalRestarts: number, activeGrid: GridType) => {
      setIsCompleted(true);
      if (timerRef.current) clearInterval(timerRef.current);

      // Compute non-zero real elapsed seconds, moves, and restarts
      const wallSeconds = Math.max(
        1,
        Math.round((Date.now() - levelStartTimeMsRef.current) / 1000)
      );
      const actualTimeSeconds = Math.max(1, finalTime > 0 ? finalTime : wallSeconds);
      const actualMoves = Math.max(1, finalMoves);
      const actualRestarts = Math.max(0, finalRestarts);

      // Multipliers
      const Gm = activeGrid === '6x4' ? 1.5 : 1.0;
      const Sm = isSpecialLevel ? 1.5 : 1.0;
      // Show Number Deduction Multiplier: 0.75 if used, else 1.0
      const Dm = isSpecialLevel ? 0.75 : 1.0;

      // Base & Final Score (always >= 100)
      const Sbase = Math.max(
        100,
        1000 - actualTimeSeconds * 2 - actualMoves * 5 - actualRestarts * 50
      );
      const Sfinal = Math.max(100, Math.floor(Sbase * Gm * Sm * Dm));

      // Currency Rewards (non-zero Gold & Gems upon every level completion)
      let gold = Math.max(10, Math.floor(Sfinal * 0.1));
      let gems = 1;

      if (isSpecialLevel) {
        // Special level with number active (+50 gold, 2 gems)
        gold += 50;
        gems = 2;
      } else if (actualRestarts === 0 && actualTimeSeconds <= 120 && actualMoves <= 30) {
        // Perfect run bonus gem
        gems = 2;
      }

      // Sync UI state 1:1 with persisted Firestore values
      elapsedTimeRef.current = actualTimeSeconds;
      movesCountRef.current = actualMoves;
      restartsCountRef.current = actualRestarts;
      setElapsedTime(actualTimeSeconds);
      setMovesCount(actualMoves);
      setRestartsCount(actualRestarts);
      setFinalScore(Sfinal);
      setEarnedGold(gold);
      setEarnedGems(gems);

      // Immediate Level Unlock for Level L + 1
      const nextLevel = level < 600 ? level + 1 : level;

      // Immediate local state callback (0ms lag, zero blocking)
      onLevelUnlocked?.(nextLevel);

      const userId = getActiveUserId();

      // Immediate local persistence scoped to active user
      try {
        localStorage.setItem(`one_on_one_unlocked_level_${userId}`, String(nextLevel));
        localStorage.setItem('one_on_one_unlocked_level', String(nextLevel));
      } catch {
        // Safe fallback
      }

      // Atomic 1:1 Database Sync to Firestore (/users/{userId}/level_progress/level_{L} & /users/{userId})
      const syncOperation = (async () => {
        setIsSyncing(true);
        const userDocRef = doc(db, 'users', userId);
        const levelDocRef = doc(db, 'users', userId, 'level_progress', `level_${level}`);
        const nextLevelDocRef =
          nextLevel > level
            ? doc(db, 'users', userId, 'level_progress', `level_${nextLevel}`)
            : null;

        const completedPayload = {
          score: Sfinal,
          time_seconds: actualTimeSeconds,
          moves_count: actualMoves,
          restarts_count: actualRestarts,
          grid_used: activeGrid,
          show_number_used: Boolean(isSpecialLevel),
          status: 'completed',
          gold,
          gems,
        };

        try {
          await runTransaction(db, async (tx) => {
            const userSnap = await tx.get(userDocRef);
            const nextSnap = nextLevelDocRef ? await tx.get(nextLevelDocRef) : null;

            const userData = userSnap.exists() ? userSnap.data() : {};
            const existingWallet =
              userData.wallet && typeof userData.wallet === 'object' ? userData.wallet : {};

            const currentGold = Number(userData.gold ?? existingWallet.gold ?? 0) || 0;
            const currentGems = Number(userData.gems ?? existingWallet.gems ?? 0) || 0;
            const newTotalGold = currentGold + gold;
            const newTotalGems = currentGems + gems;

            const currentUnlocked =
              Number(userData.unlocked_level ?? userData.highest_level_unlocked ?? 1) || 1;
            const newUnlockedLevel = Math.max(currentUnlocked, nextLevel);

            const prevLifetimeGold = Number(userData.lifetime_gold_earned ?? 0) || 0;
            const prevLifetimeGems = Number(userData.lifetime_gems_earned ?? 0) || 0;
            const prevTotalScore = Number(userData.total_score ?? 0) || 0;
            const prevMatchesPlayed = Number(userData.total_matches_played ?? 0) || 0;
            const prevHighScore = Number(userData.high_score ?? 0) || 0;
            const prevBestTime =
              typeof userData.best_time_seconds === 'number' && userData.best_time_seconds > 0
                ? userData.best_time_seconds
                : null;
            const prevBestMoves =
              typeof userData.best_moves_count === 'number' && userData.best_moves_count > 0
                ? userData.best_moves_count
                : null;

            const nextBestTime =
              prevBestTime !== null
                ? Math.min(prevBestTime, actualTimeSeconds)
                : actualTimeSeconds;
            const nextBestMoves =
              prevBestMoves !== null ? Math.min(prevBestMoves, actualMoves) : actualMoves;

            // 1. Write exact non-zero gameplay metrics to /users/{userId}/level_progress/level_{level}
            tx.set(levelDocRef, completedPayload, { merge: true });

            // 2. Unlock next level ONLY if currently locked or missing (never write default zeros or overwrite completed data)
            if (nextLevelDocRef) {
              if (!nextSnap || !nextSnap.exists() || nextSnap.data()?.status === 'locked') {
                tx.set(nextLevelDocRef, { status: 'unlocked' }, { merge: true });
              }
            }

            // 3. Accumulate Gold, Gems (root + wallet), and Lifetime Leaderboard Stats in user's main document
            tx.set(
              userDocRef,
              {
                gold: newTotalGold,
                gems: newTotalGems,
                wallet: {
                  ...existingWallet,
                  gold: newTotalGold,
                  gems: newTotalGems,
                },
                unlocked_level: newUnlockedLevel,
                current_level: newUnlockedLevel,
                lifetime_gold_earned: prevLifetimeGold + gold,
                lifetime_gems_earned: prevLifetimeGems + gems,
                total_score: prevTotalScore + Sfinal,
                total_matches_played: prevMatchesPlayed + 1,
                high_score: Math.max(prevHighScore, Sfinal),
                best_time_seconds: nextBestTime,
                best_moves_count: nextBestMoves,
                updatedAt: Date.now(),
              },
              { merge: true }
            );
          });
        } catch (txErr) {
          console.warn(
            'Transaction fallback triggered for level completion:',
            txErr instanceof Error ? txErr.message : String(txErr)
          );
          try {
            await Promise.all([
              setDoc(levelDocRef, completedPayload, { merge: true }),
              setDoc(
                userDocRef,
                {
                  wallet: {
                    gold: increment(gold),
                    gems: increment(gems),
                  },
                  unlocked_level: nextLevel,
                  updatedAt: Date.now(),
                },
                { merge: true }
              ),
              ...(nextLevelDocRef
                ? [setDoc(nextLevelDocRef, { status: 'unlocked' }, { merge: true })]
                : []),
            ]);
          } catch (fallbackErr) {
            console.error(
              'Firestore completion sync error:',
              fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
            );
          }
        } finally {
          setIsSyncing(false);
        }
      })();

      pendingSyncRef.current = syncOperation;
      await syncOperation;
    },
    [level, isSpecialLevel, getActiveUserId, onLevelUnlocked]
  );

  // Swap two tiles with 0ms transition delay (pure event handler, zero setState-in-render)
  const handleSwap = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex || isCompleted || isGivenUp || isFinishedRef.current) return;

      const currentTiles = tilesRef.current;
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= currentTiles.length ||
        toIndex >= currentTiles.length
      ) {
        return;
      }

      const newTiles = [...currentTiles];
      [newTiles[fromIndex], newTiles[toIndex]] = [newTiles[toIndex], newTiles[fromIndex]];
      tilesRef.current = newTiles;

      const nextMoves = movesCountRef.current + 1;
      movesCountRef.current = nextMoves;

      setTiles(newTiles);
      setMovesCount(nextMoves);
      setSelectedTileIndex(null);

      const isSolved = newTiles.every((val, idx) => val === idx);
      if (isSolved) {
        isFinishedRef.current = true;
        void handleLevelCompleted(
          elapsedTimeRef.current,
          nextMoves,
          restartsCountRef.current,
          gridTypeRef.current
        );
      }
    },
    [isCompleted, isGivenUp, handleLevelCompleted]
  );

  // Instant Tap-and-Swap handler (0ms response)
  const handleTileClick = useCallback(
    (index: number) => {
      if (isCompleted || isGivenUp || isFinishedRef.current) return;

      if (selectedTileIndex === null) {
        setSelectedTileIndex(index);
      } else if (selectedTileIndex === index) {
        setSelectedTileIndex(null); // Instant deselect
      } else {
        handleSwap(selectedTileIndex, index);
      }
    },
    [isCompleted, isGivenUp, selectedTileIndex, handleSwap]
  );

  const currentConfig = GRID_CONFIGS[gridType];

  // Touch Gesture Handlers: Directional Slide (Left, Right, Up, Down) & Drag-and-Drop
  const handleTouchStart = (e: React.TouchEvent, slot: number) => {
    if (isCompleted || isGivenUp) return;
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      slot,
      swapped: false,
      hasMoved: false,
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isCompleted || isGivenUp || !touchStartRef.current || touchStartRef.current.swapped) return;

    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 8) {
      touchStartRef.current.hasMoved = true;
    }

    // Directional Slide Threshold: 20px
    if (dist >= 20) {
      const slot = touchStartRef.current.slot;
      const cols = currentConfig.cols;
      const rows = currentConfig.rows;
      const col = slot % cols;
      const row = Math.floor(slot / cols);

      let targetSlot: number | null = null;

      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal slide
        if (dx > 0 && col < cols - 1) {
          targetSlot = slot + 1; // Slide Right
        } else if (dx < 0 && col > 0) {
          targetSlot = slot - 1; // Slide Left
        }
      } else {
        // Vertical slide
        if (dy > 0 && row < rows - 1) {
          targetSlot = slot + cols; // Slide Down
        } else if (dy < 0 && row > 0) {
          targetSlot = slot - cols; // Slide Up
        }
      }

      if (targetSlot !== null && targetSlot >= 0 && targetSlot < currentConfig.total) {
        handleSwap(slot, targetSlot);
        touchStartRef.current.swapped = true;
        lastTouchHandledTime.current = Date.now();
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (isCompleted || isGivenUp || !touchStartRef.current) return;

    const currentTouch = touchStartRef.current;
    touchStartRef.current = null;
    lastTouchHandledTime.current = Date.now();

    // If directional slide already swapped tiles, do not re-swap
    if (currentTouch.swapped) {
      return;
    }

    // If user dragged to another target tile and released (drag & drop)
    if (currentTouch.hasMoved && e.changedTouches && e.changedTouches.length > 0) {
      const touch = e.changedTouches[0];
      const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
      const tileContainer = targetElement?.closest('[data-slot-index]');
      if (tileContainer) {
        const dropSlotStr = tileContainer.getAttribute('data-slot-index');
        if (dropSlotStr !== null) {
          const dropSlot = Number(dropSlotStr);
          if (!isNaN(dropSlot) && dropSlot !== currentTouch.slot) {
            handleSwap(currentTouch.slot, dropSlot);
            return;
          }
        }
      }
    }

    // If pure tap without significant move, execute instant selection or swap (0ms lag)
    if (!currentTouch.hasMoved) {
      handleTileClick(currentTouch.slot);
    }
  };

  // Restart Handler
  const handleRestart = () => {
    if (isCompleted || isGivenUp || isFinishedRef.current) return;
    const nextRestarts = restartsCountRef.current + 1;
    restartsCountRef.current = nextRestarts;
    setRestartsCount(nextRestarts);
    setSelectedTileIndex(null);
    const freshTiles = generateShuffledTiles(GRID_CONFIGS[gridType].total);
    tilesRef.current = freshTiles;
    setTiles(freshTiles);
  };

  // Grid Type Switcher
  const handleGridChange = (type: GridType) => {
    if (type === gridType || isCompleted || isGivenUp || isFinishedRef.current) return;
    gridTypeRef.current = type;
    setGridType(type);
    setSelectedTileIndex(null);
    const freshTiles = generateShuffledTiles(GRID_CONFIGS[type].total);
    tilesRef.current = freshTiles;
    setTiles(freshTiles);
  };

  // Give Up Handler: Records actual attempt metrics, unlocks Level L + 1, and preserves any prior completion
  const handleGiveUp = async () => {
    if (isCompleted || isGivenUp || isFinishedRef.current) return;
    isFinishedRef.current = true;
    setIsGivenUp(true);
    if (timerRef.current) clearInterval(timerRef.current);

    const wallSeconds = Math.max(
      1,
      Math.round((Date.now() - levelStartTimeMsRef.current) / 1000)
    );
    const actualTimeSeconds = Math.max(
      1,
      elapsedTimeRef.current > 0 ? elapsedTimeRef.current : wallSeconds
    );
    const actualMoves = movesCountRef.current;
    const actualRestarts = restartsCountRef.current;
    const activeGrid = gridTypeRef.current;

    elapsedTimeRef.current = actualTimeSeconds;
    setElapsedTime(actualTimeSeconds);

    // Dynamic next sequential level unlock calculation for universal level progression
    const nextLevel = level < 600 ? level + 1 : level;

    // Immediately trigger local state unlock (0ms delay, zero blocking)
    onLevelUnlocked?.(nextLevel);

    const userId = getActiveUserId();

    try {
      localStorage.setItem(`one_on_one_unlocked_level_${userId}`, String(nextLevel));
      localStorage.setItem('one_on_one_unlocked_level', String(nextLevel));
    } catch {
      // Safe fallback
    }

    const syncOperation = (async () => {
      setIsSyncing(true);
      const userDocRef = doc(db, 'users', userId);
      const levelDocRef = doc(db, 'users', userId, 'level_progress', `level_${level}`);
      const nextLevelDocRef =
        nextLevel > level
          ? doc(db, 'users', userId, 'level_progress', `level_${nextLevel}`)
          : null;

      try {
        await runTransaction(db, async (tx) => {
          const userSnap = await tx.get(userDocRef);
          const levelSnap = await tx.get(levelDocRef);
          const nextSnap = nextLevelDocRef ? await tx.get(nextLevelDocRef) : null;

          const existingLevel = levelSnap.exists() ? levelSnap.data() : null;

          // Only mark as given_up if not already completed previously (never overwrite completed scores/rewards with 0)
          if (existingLevel?.status !== 'completed') {
            tx.set(
              levelDocRef,
              {
                time_seconds: actualTimeSeconds,
                moves_count: actualMoves,
                restarts_count: actualRestarts,
                grid_used: activeGrid,
                show_number_used: Boolean(isSpecialLevel),
                status: 'given_up',
              },
              { merge: true }
            );
          }

          // Unlock next sequential level ONLY if currently locked or missing
          if (nextLevelDocRef) {
            if (!nextSnap || !nextSnap.exists() || nextSnap.data()?.status === 'locked') {
              tx.set(nextLevelDocRef, { status: 'unlocked' }, { merge: true });
            }
          }

          const userData = userSnap.exists() ? userSnap.data() : {};
          const currentUnlocked =
            Number(userData.unlocked_level ?? userData.highest_level_unlocked ?? 1) || 1;
          const newUnlockedLevel = Math.max(currentUnlocked, nextLevel);
          const prevForfeits = Number(userData.forfeited_matches ?? 0) || 0;
          const prevMatchesPlayed = Number(userData.total_matches_played ?? 0) || 0;

          tx.set(
            userDocRef,
            {
              unlocked_level: newUnlockedLevel,
              current_level: newUnlockedLevel,
              forfeited_matches: prevForfeits + 1,
              total_matches_played: prevMatchesPlayed + 1,
              updatedAt: Date.now(),
            },
            { merge: true }
          );
        });
      } catch (txErr) {
        console.warn(
          'Transaction fallback triggered for give-up:',
          txErr instanceof Error ? txErr.message : String(txErr)
        );
        try {
          await Promise.all([
            setDoc(
              levelDocRef,
              {
                time_seconds: actualTimeSeconds,
                moves_count: actualMoves,
                restarts_count: actualRestarts,
                grid_used: activeGrid,
                show_number_used: Boolean(isSpecialLevel),
                status: 'given_up',
              },
              { merge: true }
            ),
            setDoc(
              userDocRef,
              {
                unlocked_level: nextLevel,
                updatedAt: Date.now(),
              },
              { merge: true }
            ),
            ...(nextLevelDocRef
              ? [setDoc(nextLevelDocRef, { status: 'unlocked' }, { merge: true })]
              : []),
          ]);
        } catch (fallbackErr) {
          console.error(
            'Firestore give-up sync error:',
            fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
          );
        }
      } finally {
        setIsSyncing(false);
      }
    })();

    pendingSyncRef.current = syncOperation;
    await syncOperation;
  };

  return (
    <div
      style={{
        maxWidth: '430px',
        height: '100vh',
        backgroundColor: '#000000',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        color: '#FFFFFF',
        userSelect: 'none',
      }}
      className="w-full mx-auto relative overflow-y-auto"
    >
      {/* --- TOP HEADER PANEL --- */}
      {/* style: display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 12px 16px; */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          padding: '12px 16px',
          boxSizing: 'border-box',
          borderBottom: '1px solid #1E293B',
        }}
      >
        {/* Top-Left: Original Image Thumbnail (60px x 60px, border 1px solid #334155, radius 6px) */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleSafeExit}
            className="text-[#94A3B8] hover:text-[#FFFFFF] p-1 cursor-pointer focus:outline-none"
            aria-label="Exit Game"
            title="Exit Game"
          >
            <ArrowLeft size={20} />
          </button>

          <div
            style={{
              width: '60px',
              height: '60px',
              border: '1px solid #334155',
              borderRadius: '6px',
              overflow: 'hidden',
              backgroundColor: '#0F172A',
            }}
            className="flex items-center justify-center shrink-0"
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="Source Puzzle Preview"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span className="text-[10px] text-[#64748B]">Thumbnail</span>
            )}
          </div>
        </div>

        {/* Top-Right: Gameplay Metrics Cluster (display: flex; gap: 8px;) */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Time Box: Height 36px, padding 0 12px, bg #1E293B, border 1px solid #334155, radius 6px, 14px 600 #FFFFFF */}
          <div
            style={{
              height: '36px',
              padding: '0 12px',
              backgroundColor: '#1E293B',
              border: '1px solid #334155',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            ⏱️ {formatMMSS(elapsedTime)}
          </div>

          {/* Move Box: Height 36px, padding 0 12px, bg #1E293B, border 1px solid #334155, radius 6px, 14px 600 #FFFFFF */}
          <div
            style={{
              height: '36px',
              padding: '0 12px',
              backgroundColor: '#1E293B',
              border: '1px solid #334155',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            🔄 {movesCount}
          </div>
        </div>
      </div>

      {/* --- MAIN PUZZLE BOARD --- */}
      {/* Width 90%, aspect ratio mapped to standard dimensions, margin: 10px auto, Frame: bg #0F172A, border 2px solid #334155, radius 8px */}
      <div
        style={{
          width: '90%',
          aspectRatio: currentConfig.aspectRatio,
          margin: '10px auto',
          backgroundColor: '#0F172A',
          border: '2px solid #334155',
          borderRadius: '8px',
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: `repeat(${currentConfig.cols}, 1fr)`,
          gridTemplateRows: `repeat(${currentConfig.rows}, 1fr)`,
          boxSizing: 'border-box',
          position: 'relative',
          touchAction: 'none',
          userSelect: 'none',
        }}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {tiles.map((origIndex, currentSlot) => {
          const isSelected = selectedTileIndex === currentSlot;
          const origCol = origIndex % currentConfig.cols;
          const origRow = Math.floor(origIndex / currentConfig.cols);

          // Slicing math
          const bgPosX =
            currentConfig.cols > 1 ? (origCol / (currentConfig.cols - 1)) * 100 : 0;
          const bgPosY =
            currentConfig.rows > 1 ? (origRow / (currentConfig.rows - 1)) * 100 : 0;

          return (
            <div
              key={currentSlot}
              data-slot-index={currentSlot}
              role="button"
              tabIndex={0}
              onTouchStart={(e) => handleTouchStart(e, currentSlot)}
              onClick={() => {
                if (Date.now() - lastTouchHandledTime.current < 400) return;
                handleTileClick(currentSlot);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleTileClick(currentSlot);
                }
              }}
              draggable={!isCompleted && !isGivenUp}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', String(currentSlot));
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const from = Number(e.dataTransfer.getData('text/plain'));
                handleSwap(from, currentSlot);
              }}
              style={{
                width: '100%',
                height: '100%',
                boxSizing: 'border-box',
                border: isSelected ? '2px solid #FEF08A' : '1px solid #475569',
                backgroundColor: isSelected ? 'rgba(254, 240, 138, 0.15)' : '#1E293B',
                backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
                backgroundSize: `${currentConfig.cols * 100}% ${currentConfig.rows * 100}%`,
                backgroundPosition: `${bgPosX}% ${bgPosY}%`,
                backgroundRepeat: 'no-repeat',
                position: 'relative',
                cursor: 'pointer',
                touchAction: 'none',
                transition: 'none',
              }}
            >
              {/* Selected Overlay highlight */}
              {isSelected && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundColor: 'rgba(254, 240, 138, 0.15)',
                    pointerEvents: 'none',
                    transition: 'none',
                  }}
                />
              )}

              {/* Special Level Number Overlay (Level Number % 6 === 0):
                  Display sequential numbers (1-12 for 4x3; 1-24 for 6x4) at the top-left of each tile
                  with semi-transparent dark background badge (rgba(0,0,0,0.5)), font size 12px, weight 700, color #FFFFFF */}
              {isSpecialLevel && (
                <div
                  style={{
                    position: 'absolute',
                    top: '2px',
                    left: '2px',
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#FFFFFF',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    lineHeight: '1.2',
                    pointerEvents: 'none',
                    transition: 'none',
                  }}
                >
                  {origIndex + 1}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* --- ZONE 1: GRID SELECTOR --- */}
      {/* 4x3 and 6x4 buttons (display: flex; gap: 12px; width: 90%; margin: 12px auto 6px auto) */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          width: '90%',
          margin: '12px auto 6px auto',
          boxSizing: 'border-box',
        }}
      >
        {/* 4x3 Button */}
        <button
          type="button"
          onClick={() => handleGridChange('4x3')}
          style={{
            flex: 1,
            height: '40px',
            borderRadius: '6px',
            fontWeight: 700,
            fontSize: '14px',
            cursor: 'pointer',
            backgroundColor: gridType === '4x3' ? '#FFFFFF' : '#1E293B',
            color: gridType === '4x3' ? '#000000' : '#64748B',
            border: gridType === '4x3' ? 'none' : '1px solid #334155',
          }}
        >
          4x3
        </button>

        {/* 6x4 Button */}
        <button
          type="button"
          onClick={() => handleGridChange('6x4')}
          style={{
            flex: 1,
            height: '40px',
            borderRadius: '6px',
            fontWeight: 700,
            fontSize: '14px',
            cursor: 'pointer',
            backgroundColor: gridType === '6x4' ? '#FFFFFF' : '#1E293B',
            color: gridType === '6x4' ? '#000000' : '#64748B',
            border: gridType === '6x4' ? 'none' : '1px solid #334155',
          }}
        >
          6x4
        </button>
      </div>

      {/* --- ZONE 2: GAME CONTROLS --- */}
      {/* Width 90%, margin 6px auto, flex-direction column, gap 8px */}
      <div
        style={{
          width: '90%',
          margin: '6px auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          boxSizing: 'border-box',
        }}
      >
        {/* Restart Button: bg #334155, text #FFFFFF, height 42px, label "🔄 Restart" */}
        <button
          type="button"
          onClick={handleRestart}
          disabled={isCompleted || isGivenUp}
          style={{
            backgroundColor: '#334155',
            color: '#FFFFFF',
            height: '42px',
            borderRadius: '6px',
            fontWeight: 600,
            fontSize: '14px',
            border: 'none',
            cursor: isCompleted || isGivenUp ? 'not-allowed' : 'pointer',
            opacity: isCompleted || isGivenUp ? 0.6 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <RotateCcw size={15} />
          <span>Restart</span>
        </button>

        {/* Give Up Button: bg #991B1B, text #FFFFFF, height 42px, label "🏳️ Give Up" */}
        <button
          type="button"
          onClick={handleGiveUp}
          disabled={isCompleted || isGivenUp}
          style={{
            backgroundColor: '#991B1B',
            color: '#FFFFFF',
            height: '42px',
            borderRadius: '6px',
            fontWeight: 600,
            fontSize: '14px',
            border: 'none',
            cursor: isCompleted || isGivenUp ? 'not-allowed' : 'pointer',
            opacity: isCompleted || isGivenUp ? 0.6 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <Flag size={15} />
          <span>Give Up</span>
        </button>
      </div>

      {/* --- ZONE 3: SPECIAL LEVEL INDICATOR --- */}
      {/* Visible strictly on levels where Level Number % 6 === 0 */}
      {isSpecialLevel && (
        <div
          style={{
            backgroundColor: '#0F172A',
            border: '1px solid #0284C7',
            color: '#38BDF8',
            fontSize: '13px',
            fontWeight: 600,
            height: '36px',
            width: '90%',
            margin: '6px auto 14px auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '6px',
            boxSizing: 'border-box',
          }}
        >
          🔢 Show Number: Active
        </div>
      )}

      {/* --- COMPLETION MODAL --- */}
      {isCompleted && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '90%',
              maxWidth: '360px',
              backgroundColor: '#1E293B',
              borderRadius: '16px',
              border: '2px solid #334155',
              padding: '24px 20px',
              color: '#FFFFFF',
              textAlign: 'center',
            }}
          >
            <div className="w-14 h-14 rounded-full bg-[#10B981]/20 border border-[#10B981] flex items-center justify-center text-[#10B981] mx-auto mb-3">
              <CheckCircle2 size={32} />
            </div>

            <h2 className="text-[20px] font-bold text-white mb-1">
              Level {level} Completed!
            </h2>
            <p className="text-[12px] text-[#94A3B8] mb-4">
              {isSyncing ? 'Syncing results to database...' : 'Results successfully synced to database'}
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs mb-3 text-left">
              <div className="bg-[#0F172A] p-2.5 rounded-[8px] border border-[#334155]">
                <span className="text-[10px] text-[#94A3B8] uppercase block">Final Score</span>
                <span className="text-[15px] font-bold text-white">{finalScore.toLocaleString()}</span>
              </div>
              <div className="bg-[#0F172A] p-2.5 rounded-[8px] border border-[#334155]">
                <span className="text-[10px] text-[#94A3B8] uppercase block">Time</span>
                <span className="text-[15px] font-bold text-white">{formatMMSS(elapsedTime)}</span>
              </div>
              <div className="bg-[#0F172A] p-2.5 rounded-[8px] border border-[#334155]">
                <span className="text-[10px] text-[#94A3B8] uppercase block">Moves</span>
                <span className="text-[15px] font-bold text-white">{movesCount}</span>
              </div>
              <div className="bg-[#0F172A] p-2.5 rounded-[8px] border border-[#334155]">
                <span className="text-[10px] text-[#94A3B8] uppercase block">Restarts</span>
                <span className="text-[15px] font-bold text-white">{restartsCount}</span>
              </div>
            </div>

            {/* Currency Rewards Card */}
            <div className="bg-[#0F172A] p-3 rounded-[8px] border border-[#334155] mb-5 flex items-center justify-between text-xs">
              <span className="text-[#94A3B8] uppercase font-semibold">Rewards Earned</span>
              <div className="flex items-center gap-3">
                <span className="font-bold text-white flex items-center gap-1">
                  🪙 +{earnedGold.toLocaleString()}
                </span>
                <span className="font-bold text-white flex items-center gap-1">
                  💎 +{earnedGems.toLocaleString()}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSafeExit}
              className="w-full h-[44px] bg-[#E65C65] text-white font-bold rounded-[8px] cursor-pointer hover:bg-[#d44851] focus:outline-none"
            >
              {isSyncing ? 'Saving Progress...' : 'Continue to Level Map'}
            </button>
          </div>
        </div>
      )}

      {/* --- GIVE UP MODAL --- */}
      {isGivenUp && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '90%',
              maxWidth: '360px',
              backgroundColor: '#1E293B',
              borderRadius: '16px',
              border: '2px solid #334155',
              padding: '24px 20px',
              color: '#FFFFFF',
              textAlign: 'center',
            }}
          >
            <div className="w-14 h-14 rounded-full bg-[#991B1B]/20 border border-[#EF4444] flex items-center justify-center text-[#EF4444] mx-auto mb-3">
              <Flag size={28} />
            </div>

            <h2 className="text-[20px] font-bold text-white mb-1">
              Stage Surrendered
            </h2>
            <p className="text-[12px] text-[#94A3B8] mb-5">
              {isSyncing
                ? 'Syncing attempt metrics to database...'
                : `Level ${level} attempt recorded (${formatMMSS(elapsedTime)}, ${movesCount} moves).`}
            </p>

            <button
              type="button"
              onClick={handleSafeExit}
              className="w-full h-[44px] bg-[#334155] text-white font-bold rounded-[8px] cursor-pointer hover:bg-[#475569] focus:outline-none"
            >
              {isSyncing ? 'Saving Progress...' : 'Return to Level Map'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameScreen;
