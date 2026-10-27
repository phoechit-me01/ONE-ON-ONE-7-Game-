import React, { useState, useMemo, useEffect } from 'react';
import {
  Check,
  Archive,
  Sparkles,
  ShoppingBag,
  AlertTriangle,
  X,
  Gift,
} from 'lucide-react';
import {
  ShopItem,
  ItemCategory,
  ItemTier,
  useShopAndInventory,
  purchaseShopItemTransaction,
  formatItemPriceLabel,
  findItemEquippedLocation,
} from '../data/shopCatalog';
import { ItemAssetView } from './ItemAssetView';
import { ItemDetailModal } from './ItemDetailModal';
import { GiftShopCatalogView } from './GiftShopCatalogView';

interface ShopScreenProps {
  onOpenVault: () => void;
  onOpenOwnedGifts?: () => void;
  onOpenSentHistory?: () => void;
  initialView?: 'prestige' | 'gift';
}

type CategoryFilter = 'all' | ItemCategory | 'owned';
type TierFilter = 'all' | ItemTier;

/**
 * GDD Section 6: Complete Shop Catalog & Tiered Pricing for All 56 Items
 * - Tapping any item opens ItemDetailModal with large high-res preview, tier, price, and Buy / Equip action.
 * - All unowned Shop items are enabled and interactive (never grayed out or locked unless already owned).
 * - Strict wallet balance validation (`wallet.gold >= price_gold` & `wallet.gems >= price_gems`) with clear Insufficient Gold / Gems alert.
 */
export const ShopScreen: React.FC<ShopScreenProps> = ({
  onOpenVault,
  onOpenOwnedGifts,
  onOpenSentHistory,
  initialView = 'prestige',
}) => {
  const {
    userId,
    displayName,
    catalog,
    walletGold,
    walletGems,
    ownedItemIds,
    homeSlots,
    vaultSlots,
  } = useShopAndInventory();

  const [shopMode, setShopMode] = useState<'prestige' | 'gift'>(initialView);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [alertBanner, setAlertBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    setShopMode(initialView);
  }, [initialView]);

  const ownedSet = useMemo(() => new Set(ownedItemIds), [ownedItemIds]);

  const counts = useMemo(() => {
    let stars = 0;
    let crowns = 0;
    let frames = 0;
    for (const item of catalog) {
      if (item.category === 'star') stars++;
      else if (item.category === 'crown') crowns++;
      else if (item.category === 'frame') frames++;
    }
    return { total: catalog.length, stars, crowns, frames, owned: ownedSet.size };
  }, [catalog, ownedSet]);

  const filteredItems = useMemo(() => {
    return catalog.filter((item) => {
      if (categoryFilter === 'owned') {
        if (!ownedSet.has(item.item_id)) return false;
      } else if (categoryFilter !== 'all' && item.category !== categoryFilter) {
        return false;
      }
      if (tierFilter !== 'all' && item.tier !== tierFilter) {
        return false;
      }
      return true;
    });
  }, [catalog, categoryFilter, tierFilter, ownedSet]);

  const activeDetailItem = useMemo(
    () => (detailItemId ? catalog.find((x) => x.item_id === detailItemId) || null : null),
    [catalog, detailItemId]
  );

  const triggerAlert = (type: 'success' | 'error', text: string) => {
    setAlertBanner({ type, text });
    window.setTimeout(() => {
      setAlertBanner((prev) => (prev?.text === text ? null : prev));
    }, 3600);
  };

  const handleDirectBuy = async (e: React.MouseEvent, item: ShopItem) => {
    e.stopPropagation();
    if (purchasingId) return;

    const reqGold = Math.max(0, Number(item.price_gold) || 0);
    const reqGems = Math.max(0, Number(item.price_gems) || 0);

    // 1. Strict client-side wallet check before executing transaction
    if (reqGems > 0 && walletGems < reqGems) {
      triggerAlert(
        'error',
        `Insufficient Gems! Need 💎 ${reqGems.toLocaleString(
          'en-US'
        )} (Your balance: 💎 ${walletGems.toLocaleString('en-US')}).`
      );
      return;
    }

    if (reqGold > 0 && walletGold < reqGold) {
      triggerAlert(
        'error',
        `Insufficient Gold! Need 🪙 ${reqGold.toLocaleString(
          'en-US'
        )} (Your balance: 🪙 ${walletGold.toLocaleString('en-US')}).`
      );
      return;
    }

    // 2. Transactional Firestore deduction + inventory write
    setPurchasingId(item.item_id);
    try {
      const res = await purchaseShopItemTransaction(userId, item);
      if (res.ok) {
        triggerAlert(
          'success',
          `Purchased ${item.item_name}! Tap Equip to place it in Showcase or Vault.`
        );
        setDetailItemId(item.item_id);
      } else {
        triggerAlert('error', res.error || 'Insufficient Gold / Gems!');
      }
    } finally {
      setPurchasingId(null);
    }
  };

  if (shopMode === 'gift') {
    return (
      <GiftShopCatalogView
        senderId={userId}
        senderName={displayName}
        walletGold={walletGold}
        walletGems={walletGems}
        onBackToPrestigeShop={() => setShopMode('prestige')}
        onOpenOwnedGifts={onOpenOwnedGifts}
        onOpenSentHistory={onOpenSentHistory}
      />
    );
  }

  return (
    <div className="w-full flex-1 flex flex-col bg-[#0B0F19] text-[#F8FAFC] select-none pb-6 relative">
      {/* Shop Header & Filter Controls */}
      <div className="px-4 pt-3.5 pb-3 border-b border-[#1E293B] bg-[#0F172A] sticky top-[72px] z-30">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-[15px] font-bold text-[#F8FAFC] tracking-tight truncate">
              Prestige Shop
            </h1>
            <p className="text-[11px] text-[#94A3B8] mt-0.5 tabular-nums truncate">
              {counts.owned}/{counts.total} Collected · Tap any item for preview
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShopMode('gift')}
              className="px-2.5 py-1.5 rounded-[8px] bg-[#E11D48] hover:bg-[#BE123C] text-white text-[11px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer slot-tap-feedback"
            >
              <Gift size={13} />
              <span>Gift</span>
            </button>

            <button
              type="button"
              onClick={onOpenVault}
              className="px-2.5 py-1.5 rounded-[8px] bg-[#1E293B] border border-[#334155] text-[#E2E8F0] text-[11px] font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer slot-tap-feedback"
            >
              <Archive size={13} />
              <span>Vault</span>
            </button>
          </div>
        </div>

        {/* Primary Category Tabs */}
        <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {(
            [
              { id: 'all', label: `All (${counts.total})` },
              { id: 'star', label: `Stars (${counts.stars})` },
              { id: 'crown', label: `Crowns (${counts.crowns})` },
              { id: 'frame', label: `Frames (${counts.frames})` },
              { id: 'owned', label: `Owned (${counts.owned})` },
            ] as { id: CategoryFilter; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCategoryFilter(tab.id)}
              className={`px-2.5 py-1.5 rounded-[7px] text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer slot-tap-feedback ${
                categoryFilter === tab.id
                  ? 'bg-[#2563EB] text-white'
                  : 'bg-[#1E293B] text-[#94A3B8]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Secondary Tier Filter */}
        <div className="mt-2 flex items-center gap-1 overflow-x-auto">
          {(
            ['all', 'Bronze', 'Silver', 'Gold', 'Diamond', 'Royal', 'Special'] as TierFilter[]
          ).map((tier) => (
            <button
              key={tier}
              type="button"
              onClick={() => setTierFilter(tier)}
              className={`px-2 py-0.5 rounded-[5px] text-[10px] font-medium whitespace-nowrap shrink-0 cursor-pointer slot-tap-feedback ${
                tierFilter === tier
                  ? 'bg-[#334155] text-[#F8FAFC]'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              {tier === 'all' ? 'All Tiers' : tier}
            </button>
          ))}
        </div>

        {/* High-Visibility Insufficient Funds / Purchase Notification Alert */}
        {alertBanner && (
          <div
            role="alert"
            className={`mt-2.5 px-3 py-2 rounded-[10px] text-[12px] font-semibold flex items-center justify-between gap-2 ${
              alertBanner.type === 'success'
                ? 'bg-[#064E3B] text-[#6EE7B7] border border-[#10B981]'
                : 'bg-[#450A0A] text-[#FCA5A5] border border-[#EF4444]'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {alertBanner.type === 'error' ? (
                <AlertTriangle size={15} className="text-[#F87171] shrink-0" />
              ) : (
                <Check size={15} className="text-[#34D399] shrink-0" />
              )}
              <span className="leading-snug">{alertBanner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setAlertBanner(null)}
              className="p-1 text-current opacity-80 hover:opacity-100 cursor-pointer shrink-0"
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* 2-Column Interactive Catalog Grid */}
      <div className="p-3.5 grid grid-cols-2 gap-3">
        {filteredItems.map((item) => {
          const isOwned = ownedSet.has(item.item_id);
          const equippedLoc = isOwned
            ? findItemEquippedLocation(item.item_id, homeSlots, vaultSlots)
            : null;
          const isBuying = purchasingId === item.item_id;

          return (
            <div
              key={item.item_id}
              role="button"
              tabIndex={0}
              onClick={() => setDetailItemId(item.item_id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setDetailItemId(item.item_id);
                }
              }}
              className={`rounded-[12px] p-3 border flex flex-col items-center text-center cursor-pointer slot-tap-feedback focus:outline-none ${
                equippedLoc
                  ? 'bg-[#111827] border-[#38BDF8]'
                  : isOwned
                  ? 'bg-[#0F172A] border-[#10B981]/60'
                  : 'bg-[#111827] border-[#334155] hover:border-[#60A5FA]'
              }`}
            >
              {/* Clean Unboxed Kicker Metadata */}
              <div className="w-full flex items-center justify-between text-[10px] text-[#94A3B8] mb-2">
                <span className="capitalize font-medium text-[#CBD5E1]">
                  {item.tier} · {item.category}
                </span>
                {equippedLoc ? (
                  <span className="text-[#38BDF8] font-semibold">
                    {equippedLoc.label}
                  </span>
                ) : isOwned ? (
                  <span className="text-[#34D399] font-semibold flex items-center gap-0.5">
                    <Check size={10} /> Owned
                  </span>
                ) : null}
              </div>

              {/* Pure Black Preview Frame with Vivid Floating & Shimmer PNG */}
              <div className="w-[78px] h-[78px] rounded-[10px] bg-[#000000] border border-[#334155] flex items-center justify-center mb-2.5">
                <ItemAssetView
                  item={item}
                  size="lg"
                  isEquipped={Boolean(equippedLoc)}
                  enableFloat={true}
                  enableShimmer={true}
                />
              </div>

              {/* Item Name */}
              <h3 className="w-full text-[12px] font-bold text-[#F8FAFC] truncate">
                {item.item_name}
              </h3>

              {/* Price Reference */}
              <div className="text-[11px] text-[#E2E8F0] font-semibold tabular-nums mt-0.5 mb-2.5">
                {formatItemPriceLabel(item)}
              </div>

              {/* Always-Interactive Primary CTA (Buy or Equip) */}
              {isOwned ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDetailItemId(item.item_id);
                  }}
                  className="w-full h-[36px] rounded-[8px] bg-[#065F46] hover:bg-[#047857] border border-[#10B981]/60 text-[#ECFDF5] text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer slot-tap-feedback whitespace-nowrap"
                >
                  <Sparkles size={12} />
                  <span>{equippedLoc ? 'Move / Equip' : 'Equip Item'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={Boolean(purchasingId)}
                  onClick={(e) => {
                    void handleDirectBuy(e, item);
                  }}
                  className="w-full h-[36px] rounded-[8px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[11px] font-bold flex items-center justify-center gap-1 tabular-nums whitespace-nowrap cursor-pointer slot-tap-feedback"
                >
                  <ShoppingBag size={12} />
                  <span>
                    {isBuying ? 'Buying...' : `Buy · ${formatItemPriceLabel(item)}`}
                  </span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Item Detail Popup Modal (Large High-Res Preview + Buy / Equip) */}
      <ItemDetailModal
        item={activeDetailItem}
        userId={userId}
        walletGold={walletGold}
        walletGems={walletGems}
        isOwned={activeDetailItem ? ownedSet.has(activeDetailItem.item_id) : false}
        homeSlots={homeSlots}
        vaultSlots={vaultSlots}
        onClose={() => setDetailItemId(null)}
        onOpenVault={onOpenVault}
        onActionFeedback={(type, message) => triggerAlert(type, message)}
      />
    </div>
  );
};

export default ShopScreen;
