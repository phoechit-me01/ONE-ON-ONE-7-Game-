import React, { useState, useMemo } from 'react';
import { Gift } from 'lucide-react';
import {
  GiftVisualTierGroup,
  resolveGiftVisualTierGroup,
} from '../services/giftService';
import { transformGoogleDriveImageUrl } from './LevelDetailModal';

export type GiftAssetStageSize = 'grid' | 'modal';

export interface GiftAssetViewProps {
  itemName: string;
  tierTitle: string;
  itemAssetUrl: string;
  fileId?: string;
  size?: GiftAssetStageSize;
  className?: string;
}

function extractDriveFileIdFromUrl(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;
  const m1 = rawUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1?.[1]) return m1[1];
  const m2 = rawUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2?.[1]) return m2[1];
  const m3 = rawUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m3?.[1]) return m3[1];
  return null;
}

function getFallbackIconColor(tierGroup: GiftVisualTierGroup): string {
  switch (tierGroup) {
    case 'legendary-max':
      return 'text-[#F43F5E]';
    case 'gold-diamond':
      return 'text-[#FBBF24]';
    case 'bronze-silver':
    default:
      return 'text-[#CBD5E1]';
  }
}

/**
 * Square-shaped Gift PNG Stage with GPU-accelerated CSS tier animations (`transform` & `opacity` only):
 * - Bronze/Silver/Rare/Deluxe: Subtle shimmer effect + soft pulse
 * - Gold/Diamond/Epic/Mythical: Floating & glowing aura + border gradient animation
 * - Legendary/Celestial/Royal/Max: Full holographic shine + burst sparkle particles
 */
export const GiftAssetView: React.FC<GiftAssetViewProps> = ({
  itemName,
  tierTitle,
  itemAssetUrl,
  fileId,
  size = 'grid',
  className = '',
}) => {
  const [urlIndex, setUrlIndex] = useState<number>(0);

  const tierGroup = useMemo(
    () => resolveGiftVisualTierGroup(tierTitle),
    [tierTitle]
  );

  const candidateUrls = useMemo(() => {
    const urls: string[] = [];
    const targetRes = size === 'modal' ? 'w1000' : 'w400';

    const resolvedId = fileId?.trim() || extractDriveFileIdFromUrl(itemAssetUrl);
    const transformed = transformGoogleDriveImageUrl(itemAssetUrl);

    if (transformed) {
      urls.push(size === 'modal' ? `${transformed}=w1000` : transformed);
      if (size === 'modal') urls.push(transformed);
    }

    if (resolvedId) {
      const lh3 = `https://lh3.googleusercontent.com/d/${resolvedId}=${targetRes}`;
      if (!urls.includes(lh3)) urls.push(lh3);
      const thumb = `https://drive.google.com/thumbnail?id=${resolvedId}&sz=${targetRes}`;
      if (!urls.includes(thumb)) urls.push(thumb);
    }

    if (itemAssetUrl && !urls.includes(itemAssetUrl)) {
      urls.push(itemAssetUrl);
    }

    return urls;
  }, [itemAssetUrl, fileId, size]);

  const activeSrc = urlIndex < candidateUrls.length ? candidateUrls[urlIndex] : null;
  const fallbackColor = getFallbackIconColor(tierGroup);

  const fxWrapperClass =
    tierGroup === 'legendary-max'
      ? 'gift-fx-legendary-max'
      : tierGroup === 'gold-diamond'
      ? 'gift-fx-gold-diamond'
      : 'gift-fx-bronze-silver border border-[#334155]';

  const padClass = size === 'modal' ? 'p-3' : 'p-1.5';
  const radiusClass = size === 'modal' ? 'rounded-[16px]' : 'rounded-[8px]';
  const iconPx = size === 'modal' ? 64 : 28;

  return (
    <div
      className={`relative aspect-square bg-[#000000] flex items-center justify-center overflow-hidden select-none ${radiusClass} ${fxWrapperClass} ${className}`}
    >
      {/* Animated Border Ring (Gold/Diamond & Legendary/Max) */}
      {tierGroup === 'gold-diamond' && (
        <div className="gift-border-anim-ring" aria-hidden="true" />
      )}
      {tierGroup === 'legendary-max' && (
        <div className="gift-border-holo-ring" aria-hidden="true" />
      )}

      {/* Glowing Radial Aura (Gold/Diamond & Legendary/Max) */}
      {tierGroup === 'gold-diamond' && (
        <div className="gift-aura-disc" aria-hidden="true" />
      )}
      {tierGroup === 'legendary-max' && (
        <div className="gift-aura-legendary" aria-hidden="true" />
      )}

      {/* Main PNG Gift Asset */}
      <div
        className={`relative z-10 w-full h-full flex items-center justify-center ${padClass}`}
      >
        {activeSrc ? (
          <img
            src={activeSrc}
            alt={itemName}
            referrerPolicy="no-referrer"
            loading="lazy"
            draggable={false}
            onError={() => setUrlIndex((prev) => prev + 1)}
            className="w-full h-full object-contain pointer-events-none gift-asset-motion"
          />
        ) : (
          <div
            className={`w-full h-full flex items-center justify-center ${fallbackColor} gift-asset-motion`}
            aria-label={itemName}
          >
            <Gift size={iconPx} strokeWidth={2} />
          </div>
        )}
      </div>

      {/* Tier 1: Subtle Shimmer Sweep */}
      {tierGroup === 'bronze-silver' && (
        <div className="gift-shimmer-subtle" aria-hidden="true" />
      )}

      {/* Tier 2: Subtle Shimmer Sweep on Gold/Diamond */}
      {tierGroup === 'gold-diamond' && (
        <div className="gift-shimmer-subtle" aria-hidden="true" />
      )}

      {/* Tier 3: Full Holographic Shine + Burst Sparkle Particles */}
      {tierGroup === 'legendary-max' && (
        <>
          <div className="gift-holo-sheen" aria-hidden="true" />
          <svg
            viewBox="0 0 16 16"
            className="gift-sparkle-dot gift-sparkle-dot-1 text-[#FDE047]"
            aria-hidden="true"
          >
            <path
              fill="currentColor"
              d="M8 0L9.8 6.2L16 8L9.8 9.8L8 16L6.2 9.8L0 8L6.2 6.2Z"
            />
          </svg>
          <svg
            viewBox="0 0 16 16"
            className="gift-sparkle-dot gift-sparkle-dot-2 text-[#38BDF8]"
            aria-hidden="true"
          >
            <path
              fill="currentColor"
              d="M8 0L9.8 6.2L16 8L9.8 9.8L8 16L6.2 9.8L0 8L6.2 6.2Z"
            />
          </svg>
          <svg
            viewBox="0 0 16 16"
            className="gift-sparkle-dot gift-sparkle-dot-3 text-[#F472B6]"
            aria-hidden="true"
          >
            <path
              fill="currentColor"
              d="M8 0L9.8 6.2L16 8L9.8 9.8L8 16L6.2 9.8L0 8L6.2 6.2Z"
            />
          </svg>
        </>
      )}
    </div>
  );
};

export default GiftAssetView;
