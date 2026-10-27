import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, auth, resolvePartnerInfo } from '../firebase';

interface LevelDetailModalProps {
  level: number;
  isCompleted?: boolean;
  onClose: () => void;
  onStartLevel?: (level: number) => void;
}

interface PartnerProgressData {
  played: boolean;
  timeString: string;
  moves: number;
  restarts: number;
  score: number;
  gridType: string;
  rewardsGold: number;
  rewardsGems: number;
  numberUsed: 'Yes' | 'No' | null;
}

/**
 * Transforms Google Drive shared/view links into direct, renderable image URLs.
 * Handles formats:
 * - https://drive.google.com/file/d/{FILE_ID}/view...
 * - https://drive.google.com/open?id={FILE_ID}
 * - https://drive.google.com/uc?id={FILE_ID}
 * - https://docs.google.com/...
 * Returns: https://lh3.googleusercontent.com/d/{FILE_ID}
 */
export function transformGoogleDriveImageUrl(rawUrl?: string | null): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  // Check if it is a Google Drive or Google Docs link
  if (
    trimmed.includes('drive.google.com') ||
    trimmed.includes('docs.google.com') ||
    trimmed.includes('googleusercontent.com')
  ) {
    if (trimmed.includes('lh3.googleusercontent.com/d/')) {
      return trimmed;
    }

    // Pattern 1: /file/d/{FILE_ID}
    const match1 = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (match1 && match1[1]) {
      return `https://lh3.googleusercontent.com/d/${match1[1]}`;
    }

    // Pattern 2: id={FILE_ID}
    const match2 = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match2 && match2[1]) {
      return `https://lh3.googleusercontent.com/d/${match2[1]}`;
    }

    // Pattern 3: /d/{FILE_ID}
    const match3 = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match3 && match3[1]) {
      return `https://lh3.googleusercontent.com/d/${match3[1]}`;
    }
  }

  // Already a direct image URL (Firebase Storage, S3, Cloudinary, etc.)
  return trimmed;
}

/**
 * Format raw seconds or strings to MM:SS format
 */
function formatTimeToMMSS(timeVal: unknown): string {
  if (typeof timeVal === 'string' && timeVal.includes(':')) {
    return timeVal;
  }
  const totalSeconds = Number(timeVal);
  if (isNaN(totalSeconds) || totalSeconds <= 0) return '00:00';
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Section 2C: Level Detail Modal Component
 * Strict specifications:
 * - Backdrop: Fixed, inset 0, rgba(0, 0, 0, 0.6), z-index 1000
 * - Modal Box: 90% width, max-width 380px, max-height 85vh, overflow-y-auto, bg #FFFFFF,
 *   radius 16px, padding 20px, 2px solid border #CBD5E1
 * - Header Section: "Level [X] Details" (18px, 700, #1E293B) + Absolute Close Button at top-right (32x32px, bg #E2E8F0, #475569)
 * - Preview Image Section: Container width 100%, height 160px, bg #F1F5F9, radius 8px, margin 12px 0, object-fit: cover
 *   Pulls single puzzle source image from `levels_master/{level_id}` (e.g. `level_1`) with Google Drive transformer
 * - Partner Performance Section:
 *   Real-time onSnapshot listener from `/users/{partner_id}/level_progress/{level_id}`
 *   Single sub-card layout: bg #F8FAFC, border #E2E8F0 (1px), radius 8px, padding 10px
 *   No Play: "No Play" (14px, 700, #94A3B8, centered) with all numeric/reward metrics hidden
 *   Played: Time (MM:SS), moves count, restarts count, score, grid type (4x3 or 6x4), rewards (Gold & Gems)
 *   Level modulo 6 special rule: Number usage status string ("Yes" or "No") based on DB, omitted on non-special levels
 * - Footer Action Buttons: Flex gap 10px, Start/Replay (h: 44px, bg #E65C65, text #FFFFFF, radius 8px, weight 600, border none),
 *   Cancel (h: 44px, bg #E2E8F0, text #334155, radius 8px, weight 600, border none)
 */
export const LevelDetailModal: React.FC<LevelDetailModalProps> = ({
  level,
  isCompleted = false,
  onClose,
  onStartLevel,
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState<boolean>(true);
  const [partnerProgress, setPartnerProgress] = useState<PartnerProgressData | null>(null);
  const [isLoadingPartner, setIsLoadingPartner] = useState<boolean>(true);

  // Active user & partner determination
  const { partnerId, partnerName } = resolvePartnerInfo(auth.currentUser);

  const isSpecialLevel = level % 6 === 0;

  // 1. Fetch preview image from `levels_master` collection (`image_url`)
  // Firestore documents use `level_${level}` format (e.g. `level_1`, `level_10`)
  useEffect(() => {
    let isMounted = true;
    let unsubscribeFallback: (() => void) | null = null;
    setIsImageLoading(true);

    const docRefPrimary = doc(db, 'levels_master', `level_${level}`);
    const docRefFallback = doc(db, 'levels_master', String(level));

    const unsubscribePrimary = onSnapshot(
      docRefPrimary,
      (docSnap) => {
        if (!isMounted) return;
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data?.image_url) {
            const transformed = transformGoogleDriveImageUrl(data.image_url);
            setImageUrl(transformed);
            setIsImageLoading(false);
            return;
          }
        }

        // Check fallback with plain number ID
        if (!unsubscribeFallback) {
          unsubscribeFallback = onSnapshot(
            docRefFallback,
            (fbSnap) => {
              if (!isMounted) return;
              if (fbSnap.exists()) {
                const fbData = fbSnap.data();
                if (fbData?.image_url) {
                  const transformed = transformGoogleDriveImageUrl(fbData.image_url);
                  setImageUrl(transformed);
                }
              }
              setIsImageLoading(false);
            },
            () => {
              if (isMounted) setIsImageLoading(false);
            }
          );
        }
      },
      (error) => {
        console.warn('levels_master fetch notice:', error.message);
        if (isMounted) setIsImageLoading(false);
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

  // 2. Real-time Firestore onSnapshot listener for partner performance:
  // /users/{partner_id}/level_progress/level_{N}
  useEffect(() => {
    setIsLoadingPartner(true);
    let isMounted = true;
    const progressDocRefPrimary = doc(db, 'users', partnerId, 'level_progress', `level_${level}`);
    const progressDocRefFallback = doc(db, 'users', partnerId, 'level_progress', String(level));

    const parsePartnerData = (data: Record<string, any>): PartnerProgressData | null => {
      const status = typeof data.status === 'string' ? data.status.toLowerCase() : '';
      const hasRealPlayStatus =
        status === 'completed' ||
        status === 'given_up' ||
        status === 'played' ||
        data.completed === true ||
        data.played === true;

      if (hasRealPlayStatus) {
        const timeRaw = data.time_seconds ?? data.time_spent ?? data.time ?? data.duration ?? 0;
        const timeString = formatTimeToMMSS(timeRaw);
        const moves = Number(data.moves_count ?? data.moves ?? 0);
        const restarts = Number(data.restarts_count ?? data.restarts ?? 0);
        const score = Number(data.score ?? 0);
        const gridType = String(data.grid_used ?? data.grid_type ?? data.grid ?? '4x3');
        const rewardsGold = Number(data.gold ?? data.rewards?.gold ?? data.reward_gold ?? 0);
        const rewardsGems = Number(data.gems ?? data.rewards?.gems ?? data.reward_gems ?? 0);

        let numberUsed: 'Yes' | 'No' | null = null;
        if (isSpecialLevel) {
          if (typeof data.show_number_used === 'boolean') {
            numberUsed = data.show_number_used ? 'Yes' : 'No';
          } else if (typeof data.show_number_used === 'string') {
            numberUsed = data.show_number_used.toLowerCase() === 'yes' || data.show_number_used.toLowerCase() === 'true' ? 'Yes' : 'No';
          } else if (typeof data.number_used === 'string') {
            numberUsed = data.number_used.toLowerCase() === 'yes' ? 'Yes' : 'No';
          } else if (typeof data.number_used === 'boolean') {
            numberUsed = data.number_used ? 'Yes' : 'No';
          } else if (typeof data.special_number_used === 'boolean') {
            numberUsed = data.special_number_used ? 'Yes' : 'No';
          } else {
            numberUsed = 'Yes';
          }
        }

        return {
          played: true,
          timeString,
          moves,
          restarts,
          score,
          gridType,
          rewardsGold,
          rewardsGems,
          numberUsed,
        };
      }
      return null;
    };

    let unsubscribeFallback: (() => void) | null = null;

    const unsubscribePrimary = onSnapshot(
      progressDocRefPrimary,
      (docSnap) => {
        if (!isMounted) return;
        if (docSnap.exists()) {
          const parsed = parsePartnerData(docSnap.data());
          if (parsed) {
            setPartnerProgress(parsed);
            setIsLoadingPartner(false);
            return;
          }
        }

        // Try fallback with plain number ID
        if (!unsubscribeFallback) {
          unsubscribeFallback = onSnapshot(
            progressDocRefFallback,
            (fbSnap) => {
              if (!isMounted) return;
              if (fbSnap.exists()) {
                const parsedFb = parsePartnerData(fbSnap.data());
                if (parsedFb) {
                  setPartnerProgress(parsedFb);
                  setIsLoadingPartner(false);
                  return;
                }
              }
              setPartnerProgress({
                played: false,
                timeString: '00:00',
                moves: 0,
                restarts: 0,
                score: 0,
                gridType: '4x3',
                rewardsGold: 0,
                rewardsGems: 0,
                numberUsed: null,
              });
              setIsLoadingPartner(false);
            },
            () => {
              if (isMounted) setIsLoadingPartner(false);
            }
          );
        }
      },
      () => {
        if (isMounted) setIsLoadingPartner(false);
      }
    );

    return () => {
      isMounted = false;
      unsubscribePrimary();
      if (unsubscribeFallback) unsubscribeFallback();
    };
  }, [level, partnerId, isSpecialLevel]);

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center select-none"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="level-detail-modal-title"
    >
      {/* Modal Box */}
      {/* Width 90%, maximum width 380px, maximum height 85vh, vertical overflow scrollable,
          background #FFFFFF, border-radius 16px, padding 20px, solid border #CBD5E1 (2px) */}
      <div
        className="w-[90%] max-w-[380px] max-h-[85vh] bg-[#FFFFFF] rounded-[16px] p-[20px] border-2 border-[#CBD5E1] overflow-y-auto flex flex-col relative"
        style={{ boxSizing: 'border-box' }}
      >
        {/* --- Header Section --- */}
        {/* Title "Level [X] Details" (Font size 18px, font weight 700, color #1E293B) */}
        <div className="w-full flex items-center pr-10">
          <h2
            id="level-detail-modal-title"
            className="text-[18px] font-bold text-[#1E293B]"
          >
            Level {level} Details
          </h2>
        </div>

        {/* Close Button at top-right (absolute: top 16px, right 16px, 32x32px, bg #E2E8F0, radius 50%, font size 16px, color #475569) */}
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            width: '32px',
            height: '32px',
            backgroundColor: '#E2E8F0',
            borderRadius: '50%',
            fontSize: '16px',
            color: '#475569',
            border: 'none',
          }}
          className="flex items-center justify-center cursor-pointer hover:bg-[#CBD5E1] focus:outline-none"
          aria-label="Close modal"
        >
          <X size={16} />
        </button>

        {/* --- Preview Image Section --- */}
        {/* Exact CSS styling: width 100%, height 160px, background color #F1F5F9, border-radius 8px, margin 12px 0, with object-fit: cover */}
        <div
          style={{
            width: '100%',
            height: '160px',
            backgroundColor: '#F1F5F9',
            borderRadius: '8px',
            margin: '12px 0',
          }}
          className="overflow-hidden flex items-center justify-center relative border border-[#E2E8F0]"
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={`Level ${level} Puzzle Preview`}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
              className="rounded-[8px]"
              onError={(e) => {
                // Fallback to Google Drive thumbnail endpoint if lh3 encounters issue
                const currentSrc = e.currentTarget.src;
                const match = currentSrc.match(/\/d\/([a-zA-Z0-9_-]+)/);
                if (match && match[1] && !currentSrc.includes('thumbnail')) {
                  e.currentTarget.src = `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`;
                }
              }}
            />
          ) : isImageLoading ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-[#8E9AAF] text-xs">
              <span className="font-medium">Loading puzzle preview...</span>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-[#8E9AAF] text-xs">
              <span className="font-medium">Puzzle Preview</span>
            </div>
          )}
        </div>

        {/* --- Partner Performance Split Section --- */}
        {/* Single Sub-Card Layout for the partner: bg #F8FAFC, border #E2E8F0 (1px), border-radius 8px, padding 10px */}
        <div className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-[8px] p-[10px] mb-[20px]">
          {/* Partner Card Header */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#E2E8F0]">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px]">👤</span>
              <span className="text-[12px] font-bold text-[#2C3E50]">{partnerName}</span>
            </div>
            <span className="text-[10px] font-semibold text-[#8E9AAF] uppercase tracking-wider">
              Partner Performance
            </span>
          </div>

          {isLoadingPartner ? (
            <div className="py-4 flex items-center justify-center text-[12px] text-[#8E9AAF]">
              Loading partner data...
            </div>
          ) : !partnerProgress || !partnerProgress.played ? (
            /* No Play Condition: If the partner has no record or unplayed status,
               display text "No Play" (Color #94A3B8, font size 14px, font weight 700, centered).
               Hide all numeric and reward metrics completely. */
            <div className="py-5 flex items-center justify-center">
              <span
                style={{
                  color: '#94A3B8',
                  fontSize: '14px',
                  fontWeight: 700,
                  textAlign: 'center',
                }}
              >
                No Play
              </span>
            </div>
          ) : (
            /* Completed / Played Condition: Display exact database values */
            <div className="flex flex-col gap-2">
              {/* Row 1: Time & Score */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex flex-col bg-[#FFFFFF] p-2 rounded-[6px] border border-[#E2E8F0]">
                  <span className="text-[10px] text-[#8E9AAF] uppercase font-semibold">
                    Time (MM:SS)
                  </span>
                  <span className="text-[13px] font-bold text-[#2C3E50]">
                    {partnerProgress.timeString}
                  </span>
                </div>
                <div className="flex flex-col bg-[#FFFFFF] p-2 rounded-[6px] border border-[#E2E8F0]">
                  <span className="text-[10px] text-[#8E9AAF] uppercase font-semibold">
                    Score
                  </span>
                  <span className="text-[13px] font-bold text-[#2C3E50]">
                    {partnerProgress.score.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Row 2: Moves, Restarts & Grid Type */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="flex flex-col bg-[#FFFFFF] p-2 rounded-[6px] border border-[#E2E8F0]">
                  <span className="text-[10px] text-[#8E9AAF] uppercase font-semibold">
                    Moves
                  </span>
                  <span className="text-[13px] font-bold text-[#2C3E50]">
                    {partnerProgress.moves}
                  </span>
                </div>
                <div className="flex flex-col bg-[#FFFFFF] p-2 rounded-[6px] border border-[#E2E8F0]">
                  <span className="text-[10px] text-[#8E9AAF] uppercase font-semibold">
                    Restarts
                  </span>
                  <span className="text-[13px] font-bold text-[#2C3E50]">
                    {partnerProgress.restarts}
                  </span>
                </div>
                <div className="flex flex-col bg-[#FFFFFF] p-2 rounded-[6px] border border-[#E2E8F0]">
                  <span className="text-[10px] text-[#8E9AAF] uppercase font-semibold">
                    Grid
                  </span>
                  <span className="text-[13px] font-bold text-[#2C3E50]">
                    {partnerProgress.gridType}
                  </span>
                </div>
              </div>

              {/* Row 3: Rewards (Gold and Gems) */}
              <div className="flex items-center justify-between bg-[#FFFFFF] px-3 py-2 rounded-[6px] border border-[#E2E8F0] text-xs">
                <span className="text-[10px] text-[#8E9AAF] uppercase font-semibold">
                  Rewards Earned
                </span>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-[#2C3E50] flex items-center gap-1">
                    🪙 {partnerProgress.rewardsGold.toLocaleString()}
                  </span>
                  <span className="font-bold text-[#2C3E50] flex items-center gap-1">
                    💎 {partnerProgress.rewardsGems.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Special Level Condition: level_id % 6 === 0 -> Show Number usage status string ("Yes" or "No") */}
              {isSpecialLevel && partnerProgress.numberUsed !== null && (
                <div className="flex items-center justify-between bg-[#FEF3C7] border border-[#FDE68A] px-3 py-2 rounded-[6px] text-xs">
                  <span className="text-[11px] font-bold text-[#92400E]">
                    Special Number Used (Rule % 6)
                  </span>
                  <span className="text-[12px] font-bold text-[#92400E]">
                    {partnerProgress.numberUsed}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* --- Footer Action Buttons --- */}
        {/* Layout: Flex container, gap 10px */}
        <div className="flex gap-[10px] mt-auto">
          {/* Start / Replay Button: Flex 1, height 44px, background color #E65C65, text color #FFFFFF,
              border-radius 8px, font weight 600, border none */}
          <button
            type="button"
            onClick={() => {
              if (onStartLevel) {
                onStartLevel(level);
              }
              onClose();
            }}
            style={{
              flex: 1,
              height: '44px',
              backgroundColor: '#E65C65',
              color: '#FFFFFF',
              borderRadius: '8px',
              fontWeight: 600,
              border: 'none',
            }}
            className="flex items-center justify-center cursor-pointer hover:bg-[#d44851] focus:outline-none"
          >
            {isCompleted ? 'Replay' : 'Start'}
          </button>

          {/* Cancel Button: Flex 1, height 44px, background color #E2E8F0, text color #334155,
              border-radius 8px, font weight 600, border none (action unmounts modal) */}
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              height: '44px',
              backgroundColor: '#E2E8F0',
              color: '#334155',
              borderRadius: '8px',
              fontWeight: 600,
              border: 'none',
            }}
            className="flex items-center justify-center cursor-pointer hover:bg-[#CBD5E1] focus:outline-none"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default LevelDetailModal;
