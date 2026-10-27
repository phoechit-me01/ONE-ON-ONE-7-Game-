import React, { useState, useMemo } from 'react';
import { Star, Crown, Square } from 'lucide-react';
import { ShopItem, isPreciousShimmerItem } from '../data/shopCatalog';
import { transformGoogleDriveImageUrl } from './LevelDetailModal';

export type ItemAssetSize =
  | 'sm'
  | 'md'
  | 'headerFrame'
  | 'lg'
  | 'showcase'
  | 'xl';

interface ItemAssetViewProps {
  item: ShopItem;
  size?: ItemAssetSize;
  isEquipped?: boolean;
  enableFloat?: boolean;
  enableShimmer?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<
  ItemAssetSize,
  {
    box: string;
    pad: string;
    radius: string;
    iconPx: number;
    largeBob: boolean;
    highRes: boolean;
    driveThumbSz: string;
  }
> = {
  sm: {
    box: 'w-[38px] h-[38px]',
    pad: 'p-[2px]',
    radius: 'rounded-[6px]',
    iconPx: 22,
    largeBob: false,
    highRes: false,
    driveThumbSz: 'w400',
  },
  md: {
    box: 'w-[44px] h-[44px]',
    pad: 'p-[3px]',
    radius: 'rounded-[6px]',
    iconPx: 26,
    largeBob: false,
    highRes: false,
    driveThumbSz: 'w400',
  },
  headerFrame: {
    box: 'w-[60px] h-[60px]',
    pad: 'p-0',
    radius: 'rounded-none',
    iconPx: 52,
    largeBob: false,
    highRes: true,
    driveThumbSz: 'w800',
  },
  lg: {
    box: 'w-[58px] h-[58px]',
    pad: 'p-[4px]',
    radius: 'rounded-[6px]',
    iconPx: 34,
    largeBob: true,
    highRes: false,
    driveThumbSz: 'w600',
  },
  showcase: {
    box: 'w-[78px] h-[78px]',
    pad: 'p-[4px]',
    radius: 'rounded-[8px]',
    iconPx: 46,
    largeBob: true,
    highRes: true,
    driveThumbSz: 'w800',
  },
  xl: {
    box: 'w-[132px] h-[132px]',
    pad: 'p-[8px]',
    radius: 'rounded-[10px]',
    iconPx: 72,
    largeBob: true,
    highRes: true,
    driveThumbSz: 'w1000',
  },
};

function extractDriveFileId(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;
  const m1 = rawUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1?.[1]) return m1[1];
  const m2 = rawUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2?.[1]) return m2[1];
  const m3 = rawUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m3?.[1]) return m3[1];
  return null;
}

function getTierIconClass(tier: ShopItem['tier']): string {
  switch (tier) {
    case 'Bronze':
      return 'text-[#CD7F32]';
    case 'Silver':
      return 'text-[#CBD5E1]';
    case 'Gold':
      return 'text-[#FBBF24]';
    case 'Diamond':
      return 'text-[#38BDF8]';
    case 'Royal':
      return 'text-[#F43F5E]';
    case 'Special':
    default:
      return 'text-[#A78BFA]';
  }
}

/**
 * Renders a PNG Shop/Showcase/Vault/HeaderFrame asset with:
 * - High-res Google Drive direct URL resolution + secondary thumbnail fallback + crisp vector fallback
 * - Vivid Floating / Bobbing animation (.item-float-bob / .item-float-bob-lg) without edge clipping
 * - Soft Pulse / Breathing animation when equipped (.item-equipped-pulse)
 * - Shimmer / Shine Sweep overlay on precious items (.item-shimmer-sweep)
 */
export const ItemAssetView: React.FC<ItemAssetViewProps> = ({
  item,
  size = 'sm',
  isEquipped = false,
  enableFloat = true,
  enableShimmer = true,
  className = '',
}) => {
  const [urlAttempt, setUrlAttempt] = useState<number>(0);
  const { box, pad, radius, iconPx, largeBob, highRes, driveThumbSz } =
    SIZE_CLASSES[size];

  const candidateUrls = useMemo(() => {
    const urls: string[] = [];
    const primary = transformGoogleDriveImageUrl(item.image_url);
    if (primary) {
      urls.push(highRes ? `${primary}=w1000` : primary);
      if (highRes) urls.push(primary);
    }
    const fileId = extractDriveFileId(item.image_url);
    if (fileId) {
      urls.push(`https://drive.google.com/thumbnail?id=${fileId}&sz=${driveThumbSz}`);
    }
    if (item.image_url && !urls.includes(item.image_url)) {
      urls.push(item.image_url);
    }
    return urls;
  }, [item.image_url, highRes, driveThumbSz]);

  const activeSrc = urlAttempt < candidateUrls.length ? candidateUrls[urlAttempt] : null;
  const showShimmer = enableShimmer && isPreciousShimmerItem(item);
  const iconColorClass = getTierIconClass(item.tier);
  const floatClass = enableFloat
    ? largeBob
      ? 'item-float-bob-lg'
      : 'item-float-bob'
    : '';

  return (
    <div
      className={`relative flex items-center justify-center select-none ${radius} ${box} ${pad} ${
        isEquipped ? 'item-equipped-pulse' : ''
      } ${className}`}
    >
      {activeSrc ? (
        <img
          src={activeSrc}
          alt={item.item_name}
          referrerPolicy="no-referrer"
          loading="lazy"
          draggable={false}
          onError={() => setUrlAttempt((prev) => prev + 1)}
          className={`w-full h-full object-contain pointer-events-none ${floatClass}`}
        />
      ) : (
        <div
          className={`w-full h-full flex items-center justify-center ${iconColorClass} ${floatClass}`}
          aria-label={item.item_name}
        >
          {item.category === 'crown' ? (
            <Crown size={iconPx} strokeWidth={2.2} />
          ) : item.category === 'frame' ? (
            <Square size={iconPx} strokeWidth={2.2} />
          ) : (
            <Star size={iconPx} fill="currentColor" strokeWidth={1.8} />
          )}
        </div>
      )}

      {showShimmer && <div className="item-shimmer-sweep" aria-hidden="true" />}
    </div>
  );
};

export default ItemAssetView;
