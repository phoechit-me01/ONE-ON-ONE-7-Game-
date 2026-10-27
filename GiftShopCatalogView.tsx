import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Gift,
  Check,
  AlertTriangle,
  X,
} from 'lucide-react';
import {
  GiftShopItem,
  GiftCurrencyType,
  subscribeToGiftShopItems,
  formatGiftPriceLabel,
  DEFAULT_PLATFORM_FEE_PERCENT,
} from '../services/giftService';
import { GiftAssetView } from './GiftAssetView';
import { GiftCatalogDetailModal } from './GiftCatalogDetailModal';
import { SendGiftFlowModal } from './SendGiftFlowModal';

export interface GiftShopCatalogViewProps {
  senderId: string;
  senderName: string;
  walletGold: number;
  walletGems: number;
  onBackToPrestigeShop: () => void;
  onOpenOwnedGifts?: () => void;
  onOpenSentHistory?: () => void;
}

type CurrencyFilter = 'ALL' | GiftCurrencyType;

function buildFallback110GiftItems(): GiftShopItem[] {
  const tiers = ['Bronze', 'Silver', 'Gold', 'Diamond', 'Legendary', 'Max'];
  const items: GiftShopItem[] = [];
  for (let i = 0; i < 110; i++) {
    const numStr = String(i + 1).padStart(3, '0');
    const tierIdx = Math.min(tiers.length - 1, Math.floor((i / 110) * tiers.length));
    const tierTitle = tiers[tierIdx];
    const isGems = i >= 82;
    const currencyType: GiftCurrencyType = isGems ? 'GEMS' : 'GOLD';
    const basePrice = isGems
      ? 25 + (i - 81) * 15
      : 250 + i * 125;
    const giftPoints = isGems ? basePrice * 12 : Math.max(10, Math.round(basePrice / 10));
    items.push({
      itemId: `ONE_GIFT_${numStr}`,
      itemName: `${tierTitle} Gift #${numStr}`,
      category: 'Exclusive Gift',
      tierTitle,
      currencyType,
      basePrice,
      giftPoints,
      platformFeePercent: DEFAULT_PLATFORM_FEE_PERCENT,
      resaleEligible: true,
      animationType: tierIdx >= 4 ? 'floating' : tierIdx >= 2 ? 'pulse' : 'shimmer',
      fileId: '',
      itemAssetUrl: '',
      slotIndex: i,
    });
  }
  return items;
}

/**
 * 110-Item Gift Shop Catalog (`ONE_GIFT_001` to `ONE_GIFT_110`)
 * - Responsive 4-column square-card grid (`grid-cols-4 gap-2`).
 * - Each card displays: PNG asset image (with GPU tier FX), item name, price (Gold/Gems),
 *   tier, gift points, "Send" button, and "See More" button.
 */
export const GiftShopCatalogView: React.FC<GiftShopCatalogViewProps> = ({
  senderId,
  senderName,
  walletGold,
  walletGems,
  onBackToPrestigeShop,
  onOpenOwnedGifts,
  onOpenSentHistory,
}) => {
  const targetRecipientName =
    senderId === 'user_tin_moe_hlaing' ? 'PHOE CHIT' : 'Tin Moe Hlaing';
  const [giftItems, setGiftItems] = useState<GiftShopItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [currencyFilter, setCurrencyFilter] = useState<CurrencyFilter>('ALL');
  const [tierFilter, setTierFilter] = useState<string>('ALL');
  const [detailItem, setDetailItem] = useState<GiftShopItem | null>(null);
  const [sendingItem, setSendingItem] = useState<GiftShopItem | null>(null);
  const [banner, setBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    const unsub = subscribeToGiftShopItems(
      (items) => {
        if (items.length > 0) {
          setGiftItems(items);
        } else {
          setGiftItems(buildFallback110GiftItems());
        }
        setIsLoading(false);
      },
      () => {
        setGiftItems(buildFallback110GiftItems());
        setIsLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const availableTiers = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const it of giftItems) {
      if (it.tierTitle && !seen.has(it.tierTitle)) {
        seen.add(it.tierTitle);
        list.push(it.tierTitle);
      }
    }
    return list;
  }, [giftItems]);

  const filteredItems = useMemo(() => {
    return giftItems.filter((it) => {
      if (currencyFilter !== 'ALL' && it.currencyType !== currencyFilter) {
        return false;
      }
      if (tierFilter !== 'ALL' && it.tierTitle !== tierFilter) {
        return false;
      }
      return true;
    });
  }, [giftItems, currencyFilter, tierFilter]);

  const showBanner = (type: 'success' | 'error', text: string) => {
    setBanner({ type, text });
    window.setTimeout(() => {
      setBanner((prev) => (prev?.text === text ? null : prev));
    }, 3800);
  };

  return (
    <div className="w-full flex-1 flex flex-col bg-[#0B0F19] text-[#F8FAFC] select-none pb-6 relative">
      {/* Sticky Gift Shop Header */}
      <div className="px-3.5 pt-3 pb-2.5 border-b border-[#1E293B] bg-[#0F172A] sticky top-[72px] z-30">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onBackToPrestigeShop}
              className="h-[34px] px-2.5 rounded-[8px] bg-[#1E293B] border border-[#334155] text-[#E2E8F0] text-[11px] font-semibold flex items-center gap-1 cursor-pointer slot-tap-feedback shrink-0 whitespace-nowrap"
              aria-label="Back to Prestige Shop"
            >
              <ArrowLeft size={13} />
              <span>Shop</span>
            </button>

            <div className="min-w-0">
              <h1 className="text-[14px] font-bold text-[#F8FAFC] tracking-tight truncate">
                Gift Shop ({giftItems.length})
              </h1>
              <p className="text-[10px] text-[#94A3B8] truncate">
                Send to {targetRecipientName} · 110 Exclusive Gifts
              </p>
            </div>
          </div>

          {onOpenOwnedGifts && (
            <button
              type="button"
              onClick={onOpenOwnedGifts}
              className="h-[34px] px-2.5 rounded-[8px] bg-[#1E293B] border border-[#334155] text-[#F8FAFC] text-[11px] font-semibold flex items-center gap-1 cursor-pointer slot-tap-feedback shrink-0 whitespace-nowrap"
            >
              <Gift size={13} className="text-[#F43F5E]" />
              <span>My Gifts</span>
            </button>
          )}
        </div>

        {/* Currency Filter Controls */}
        <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {(
            [
              { id: 'ALL', label: `All (${giftItems.length})` },
              {
                id: 'GOLD',
                label: `🪙 Gold (${
                  giftItems.filter((x) => x.currencyType === 'GOLD').length
                })`,
              },
              {
                id: 'GEMS',
                label: `💎 Gems (${
                  giftItems.filter((x) => x.currencyType === 'GEMS').length
                })`,
              },
            ] as { id: CurrencyFilter; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCurrencyFilter(tab.id)}
              className={`px-2.5 py-1 rounded-[7px] text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer slot-tap-feedback ${
                currencyFilter === tab.id
                  ? 'bg-[#E11D48] text-white'
                  : 'bg-[#1E293B] text-[#94A3B8]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tier Filter Controls */}
        {availableTiers.length > 0 && (
          <div className="mt-2 flex items-center gap-1 overflow-x-auto">
            <button
              type="button"
              onClick={() => setTierFilter('ALL')}
              className={`px-2 py-0.5 rounded-[5px] text-[10px] font-medium whitespace-nowrap shrink-0 cursor-pointer slot-tap-feedback ${
                tierFilter === 'ALL'
                  ? 'bg-[#334155] text-[#F8FAFC]'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              All Tiers
            </button>
            {availableTiers.map((tier) => (
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
                {tier}
              </button>
            ))}
          </div>
        )}

        {/* Dispatch / Feedback Alert */}
        {banner && (
          <div
            role="alert"
            className={`mt-2.5 px-3 py-2 rounded-[10px] text-[11px] font-semibold flex items-center justify-between gap-2 ${
              banner.type === 'success'
                ? 'bg-[#064E3B] text-[#6EE7B7] border border-[#10B981]'
                : 'bg-[#450A0A] text-[#FCA5A5] border border-[#EF4444]'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {banner.type === 'error' ? (
                <AlertTriangle size={14} className="shrink-0" />
              ) : (
                <Check size={14} className="shrink-0" />
              )}
              <span className="leading-snug">{banner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="p-0.5 text-current opacity-80 hover:opacity-100 cursor-pointer shrink-0"
              aria-label="Dismiss alert"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Responsive 4-Column Gift Catalog Grid */}
      {isLoading ? (
        <div className="p-2.5 grid grid-cols-4 gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[10px] bg-[#111827] border border-[#1E293B] p-1.5 flex flex-col"
            >
              <div className="w-full aspect-square rounded-[8px] bg-[#000000]" />
              <div className="h-3 bg-[#1E293B] rounded mt-1.5 w-4/5" />
              <div className="h-2.5 bg-[#1E293B] rounded mt-1 w-3/5" />
              <div className="h-6 bg-[#1E293B] rounded mt-1.5 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="p-2.5 grid grid-cols-4 gap-2">
          {filteredItems.map((item) => (
            <div
              key={item.itemId}
              className="rounded-[10px] bg-[#111827] border border-[#1E293B] hover:border-[#475569] p-1.5 flex flex-col items-center text-center"
            >
              {/* Square PNG Stage with GPU Tier Animations */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setDetailItem(item)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setDetailItem(item);
                  }
                }}
                className="w-full cursor-pointer focus:outline-none"
                aria-label={`Preview ${item.itemName}`}
              >
                <GiftAssetView
                  itemName={item.itemName}
                  tierTitle={item.tierTitle}
                  itemAssetUrl={item.itemAssetUrl}
                  fileId={item.fileId}
                  size="grid"
                  className="w-full"
                />
              </div>

              {/* Item Name */}
              <h3
                className="w-full text-[10px] font-bold text-[#F8FAFC] truncate mt-1.5 leading-tight"
                title={item.itemName}
              >
                {item.itemName}
              </h3>

              {/* Unboxed Tier & Gift Points */}
              <div
                className="w-full text-[8.5px] text-[#94A3B8] truncate tabular-nums mt-0.5 leading-tight"
                title={`${item.tierTitle} · +${item.giftPoints} GP`}
              >
                {item.tierTitle} · +{item.giftPoints} GP
              </div>

              {/* Price (Gold / Gems) */}
              <div
                className={`w-full text-[10px] font-bold tabular-nums truncate mt-0.5 leading-tight ${
                  item.currencyType === 'GEMS' ? 'text-[#38BDF8]' : 'text-[#FBBF24]'
                }`}
              >
                {formatGiftPriceLabel(item.basePrice, item.currencyType)}
              </div>

              {/* Primary "Send" Button */}
              <button
                type="button"
                onClick={() => setSendingItem(item)}
                className="w-full h-[26px] mt-1.5 rounded-[6px] bg-[#E11D48] hover:bg-[#BE123C] text-white text-[10px] font-bold flex items-center justify-center whitespace-nowrap cursor-pointer slot-tap-feedback"
              >
                Send
              </button>

              {/* Secondary "See More" Trigger */}
              <button
                type="button"
                onClick={() => setDetailItem(item)}
                className="w-full h-[24px] mt-1 rounded-[6px] bg-[#1E293B] hover:bg-[#334155] border border-[#334155] text-[#CBD5E1] text-[9.5px] font-semibold flex items-center justify-center whitespace-nowrap cursor-pointer slot-tap-feedback"
              >
                See More
              </button>
            </div>
          ))}
        </div>
      )}

      {/* "See More" Gift Catalog Detail Popup Modal */}
      <GiftCatalogDetailModal
        item={detailItem}
        walletGold={walletGold}
        walletGems={walletGems}
        recipientName={targetRecipientName}
        onClose={() => setDetailItem(null)}
        onSendClick={(selected) => setSendingItem(selected)}
      />

      {/* Secure Gifting & Message Box Modal */}
      <SendGiftFlowModal
        item={sendingItem}
        senderId={senderId}
        senderName={senderName}
        walletGold={walletGold}
        walletGems={walletGems}
        onClose={() => setSendingItem(null)}
        onOpenSentHistory={onOpenSentHistory || onOpenOwnedGifts}
        onGiftSentSuccess={(msg) => showBanner('success', msg)}
      />
    </div>
  );
};

export default GiftShopCatalogView;
