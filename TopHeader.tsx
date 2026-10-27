import React, { useMemo } from 'react';
import {
  useShopAndInventory,
  findEquippedFrameItem,
} from '../data/shopCatalog';
import { ItemAssetView } from './ItemAssetView';

export interface TopHeaderProps {
  gold?: number;
  gems?: number;
  onProfileClick?: () => void;
  onShopClick?: () => void;
}

/**
 * Number formatting logic:
 * - Small amounts shown with commas (e.g., 1,250)
 * - Amounts >= 10K shortened (e.g., 10K, 1.5M)
 * - 0 or uninitialized defaults to '0'
 */
export function formatCurrency(amount: number): string {
  if (amount == null || isNaN(amount) || amount <= 0) return '0';
  if (amount >= 1_000_000) {
    const formatted = (amount / 1_000_000).toFixed(1).replace(/\.0$/, '');
    return `${formatted}M`;
  }
  if (amount >= 10_000) {
    const formatted = (amount / 1_000).toFixed(1).replace(/\.0$/, '');
    return `${formatted}K`;
  }
  return amount.toLocaleString('en-US');
}

/**
 * Top Header Component with Enhanced Profile Icon & Natural Equipped Frame Wrapping:
 * - Sticky at top of mobile container (Height: 72px for generous frame canvas space)
 * - Left: Enlarged Profile Avatar stage (60px x 60px when Frame equipped; 48px x 48px default).
 *   When a Frame is equipped from Showcase or Vault, the inner profile icon sits cleanly inside
 *   with zero competing background/border rings so the PNG Frame wraps around it naturally.
 * - Right: Real-time Gold (🪙) and Gem (💎) currency counters from Firestore user wallet.
 */
export const TopHeader: React.FC<TopHeaderProps> = ({
  gold: propGold,
  gems: propGems,
  onProfileClick,
  onShopClick,
}) => {
  const {
    displayName,
    walletGold,
    walletGems,
    homeSlots,
    vaultSlots,
    catalogMap,
  } = useShopAndInventory();

  const equippedFrame = useMemo(
    () => findEquippedFrameItem(homeSlots, vaultSlots, catalogMap),
    [homeSlots, vaultSlots, catalogMap]
  );

  const displayGold = propGold !== undefined ? propGold : walletGold;
  const displayGems = propGems !== undefined ? propGems : walletGems;

  const handleProfilePress = () => {
    if (onProfileClick) {
      onProfileClick();
    }
  };

  const handleShopPress = () => {
    if (onShopClick) {
      onShopClick();
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full h-[72px] bg-[#FAF8F5] border-b border-[#E2E8F0] px-[14px] py-[6px] flex items-center justify-between select-none box-border">
      {/* --- Left Side: Enlarged User Profile Icon (with Natural Frame Overlay) & Name --- */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleProfilePress}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleProfilePress();
          }
        }}
        className="flex items-center gap-[8px] cursor-pointer focus:outline-none min-w-0 min-h-[48px] pr-1.5 rounded-[12px] hover:bg-[#F3EFE9] transition-colors"
        aria-label={
          equippedFrame
            ? `Open Player Profile (${displayName}, ${equippedFrame.item_name} equipped)`
            : `Open Player Profile (${displayName})`
        }
        title={`Player Profile & Account (${displayName})`}
      >
        {equippedFrame ? (
          /* Frame-Equipped Stage: 60x60 transparent unclipped canvas, clean inner avatar without competing rings */
          <div
            className="relative w-[60px] h-[60px] flex items-center justify-center shrink-0"
          >
            {/* Inner circular avatar sized to sit cleanly inside the frame's inner opening with zero border ring */}
            <div className="w-[38px] h-[38px] rounded-full bg-[#EFECE6] flex items-center justify-center text-[19px] leading-none">
              <span>👤</span>
            </div>

            {/* PNG Frame Overlay wrapping naturally around the profile icon without box clipping or shimmer flashes */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <ItemAssetView
                item={equippedFrame}
                size="headerFrame"
                isEquipped={false}
                enableFloat={false}
                enableShimmer={false}
              />
            </div>
          </div>
        ) : (
          /* Default Unframed Avatar: Clean enlarged 48x48 circle */
          <div className="w-[48px] h-[48px] rounded-full border-2 border-[#E65C65] bg-[#FFFFFF] flex items-center justify-center shrink-0 text-[22px] leading-none">
            <span>👤</span>
          </div>
        )}

        {/* User Name Display */}
        <span
          className="text-[14px] font-semibold text-[#2C3E50] max-w-[105px] whitespace-nowrap overflow-hidden text-ellipsis inline-block"
        >
          {displayName}
        </span>
      </div>

      {/* --- Center Section: Clean breathing room --- */}
      <div className="flex-1 min-w-[6px]" aria-hidden="true" />

      {/* --- Right Side: Gold & Gem Currency Counters --- */}
      <div className="flex items-center gap-[6px] shrink-0">
        {/* Gold Counter */}
        <div
          role="button"
          tabIndex={0}
          onClick={handleShopPress}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              handleShopPress();
            }
          }}
          className="h-[32px] bg-[#FFFFFF] border border-[#E2E8F0] rounded-[20px] px-[10px] py-[4px] flex items-center gap-[4px] cursor-pointer focus:outline-none tabular-nums"
          aria-label={`Gold: ${displayGold}`}
        >
          <span className="text-[14px] leading-none">🪙</span>
          <span className="text-[13px] font-bold text-[#2C3E50] leading-none">
            {formatCurrency(displayGold)}
          </span>
        </div>

        {/* Gem Counter */}
        <div
          role="button"
          tabIndex={0}
          onClick={handleShopPress}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              handleShopPress();
            }
          }}
          className="h-[32px] bg-[#FFFFFF] border border-[#E2E8F0] rounded-[20px] px-[10px] py-[4px] flex items-center gap-[4px] cursor-pointer focus:outline-none tabular-nums"
          aria-label={`Gems: ${displayGems}`}
        >
          <span className="text-[14px] leading-none">💎</span>
          <span className="text-[13px] font-bold text-[#2C3E50] leading-none">
            {formatCurrency(displayGems)}
          </span>
        </div>
      </div>
    </header>
  );
};

export default TopHeader;
