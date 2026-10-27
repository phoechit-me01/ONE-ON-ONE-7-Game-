import React, { useState, useMemo } from 'react';
import { ShoppingBag, Archive, UserCog } from 'lucide-react';
import {
  ShopItem,
  useShopAndInventory,
  equipHomeShowcaseSlotTransaction,
  formatItemPriceLabel,
} from '../data/shopCatalog';
import { ItemAssetView } from './ItemAssetView';
import { QuickEquipModal } from './QuickEquipModal';
import { ItemDetailModal } from './ItemDetailModal';

interface ShowcaseSlotsProps {
  onOpenShop?: () => void;
  onOpenVault?: () => void;
  onOpenAccount?: () => void;
}

/**
 * GDD Section 5: Home Screen 3-Slot Profile Showcase
 * - Redundant avatar/username removed so the 3 showcase slots utilize 100% of available width.
 * - 3 equal full-width square pure-black (#000000) showcase stages (`grid-cols-3 gap-3`).
 * - Large, crystal-clear animated item previews (`78px x 78px`) with item name & value caption.
 * - Empty State: Prominent "+" symbol (#64748B). Tapping opens Owned Inventory (or Shop if 0 owned items).
 * - Occupied State: Tapping opens ItemDetailModal with high-res preview, Swap Item, Move, or Unequip actions.
 */
export const ShowcaseSlots: React.FC<ShowcaseSlotsProps> = ({
  onOpenShop,
  onOpenVault,
  onOpenAccount,
}) => {
  const {
    userId,
    catalog,
    catalogMap,
    walletGold,
    walletGems,
    ownedItemIds,
    homeSlots,
    vaultSlots,
  } = useShopAndInventory();

  const [quickEquipSlotIdx, setQuickEquipSlotIdx] = useState<number | null>(null);
  const [detailSlotState, setDetailSlotState] = useState<{
    item: ShopItem;
    slotIdx: number;
  } | null>(null);

  const ownedSet = useMemo(() => new Set(ownedItemIds), [ownedItemIds]);

  const handleSlotTap = (slotIdx: number) => {
    const currentId = homeSlots[slotIdx];
    const item = currentId ? catalogMap[currentId] : null;
    if (item) {
      setDetailSlotState({ item, slotIdx });
      return;
    }
    if (ownedItemIds.length === 0 && onOpenShop) {
      onOpenShop();
      return;
    }
    setQuickEquipSlotIdx(slotIdx);
  };

  return (
    <section className="w-full px-4 select-none mt-5">
      {/* Clean Full-Width Section Header Row */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[13px] font-bold tracking-tight text-[#2C3E50]">
          Profile Showcase
        </h2>

        <div className="flex items-center gap-2 text-[11px] text-[#64748B] tabular-nums">
          <span>Owned {ownedItemIds.length}/56</span>
          {onOpenVault && (
            <>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={onOpenVault}
                className="text-[#2563EB] font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer slot-tap-feedback"
              >
                <Archive size={12} />
                <span>Vault</span>
              </button>
            </>
          )}
          {onOpenShop && (
            <>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={onOpenShop}
                className="text-[#2563EB] font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer slot-tap-feedback"
              >
                <ShoppingBag size={12} />
                <span>Shop</span>
              </button>
            </>
          )}
          {onOpenAccount && (
            <>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={onOpenAccount}
                className="text-[#2563EB] font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer slot-tap-feedback"
              >
                <UserCog size={12} />
                <span>Account</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Expanded Full-Width 3-Column Showcase Slots */}
      <div className="grid grid-cols-3 gap-3 w-full">
        {[0, 1, 2].map((slotIdx) => {
          const itemId = homeSlots[slotIdx];
          const item = itemId ? catalogMap[itemId] : null;

          return (
            <button
              key={slotIdx}
              type="button"
              onClick={() => handleSlotTap(slotIdx)}
              className={`w-full aspect-square bg-[#000000] rounded-[12px] p-2.5 flex flex-col items-center justify-between cursor-pointer focus:outline-none slot-tap-feedback relative ${
                item
                  ? 'border border-[#475569] hover:border-[#60A5FA]'
                  : 'border border-[#334155] hover:border-[#475569]'
              }`}
              aria-label={
                item
                  ? `Showcase Slot ${slotIdx + 1}: ${item.item_name}`
                  : `Showcase Slot ${slotIdx + 1}: Empty`
              }
              title={item ? item.item_name : `Equip Showcase Slot ${slotIdx + 1}`}
            >
              {item ? (
                <>
                  {/* Large Centered PNG Item Stage */}
                  <div className="flex-1 w-full flex items-center justify-center min-h-0">
                    <ItemAssetView
                      item={item}
                      size="showcase"
                      isEquipped={true}
                      enableFloat={true}
                      enableShimmer={true}
                    />
                  </div>

                  {/* Clean Bottom Item Name & Value Label */}
                  <div className="w-full pt-1 text-center">
                    <div className="w-full text-[11px] font-semibold text-[#F8FAFC] truncate leading-tight">
                      {item.item_name}
                    </div>
                    <div className="w-full text-[10px] font-medium text-[#94A3B8] tabular-nums leading-tight mt-0.5">
                      {formatItemPriceLabel(item)}
                    </div>
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                  <span className="text-[#64748B] text-[28px] leading-none font-medium select-none">
                    +
                  </span>
                  <span className="text-[10px] font-medium text-[#64748B]">
                    Slot #{slotIdx + 1}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* High-Res Item Detail Popup Modal when tapping an equipped Showcase slot */}
      <ItemDetailModal
        item={detailSlotState?.item || null}
        userId={userId}
        walletGold={walletGold}
        walletGems={walletGems}
        isOwned={
          detailSlotState ? ownedSet.has(detailSlotState.item.item_id) : false
        }
        homeSlots={homeSlots}
        vaultSlots={vaultSlots}
        contextSlot={
          detailSlotState
            ? {
                area: 'showcase',
                slotIndex: detailSlotState.slotIdx,
                label: `Showcase Slot #${detailSlotState.slotIdx + 1}`,
              }
            : null
        }
        onClose={() => setDetailSlotState(null)}
        onChangeSlotItem={
          detailSlotState
            ? () => {
                const idx = detailSlotState.slotIdx;
                setDetailSlotState(null);
                setQuickEquipSlotIdx(idx);
              }
            : undefined
        }
        onOpenVault={onOpenVault}
      />

      {/* 1-Tap Owned Inventory Equip Modal */}
      <QuickEquipModal
        isOpen={quickEquipSlotIdx !== null}
        targetTitle={
          quickEquipSlotIdx !== null ? `Showcase Slot #${quickEquipSlotIdx + 1}` : ''
        }
        currentSlotItemId={
          quickEquipSlotIdx !== null ? homeSlots[quickEquipSlotIdx] : null
        }
        ownedItemIds={ownedItemIds}
        catalog={catalog}
        homeSlots={homeSlots}
        vaultSlots={vaultSlots}
        onSelectItem={async (chosenItemId) => {
          if (quickEquipSlotIdx === null) return;
          await equipHomeShowcaseSlotTransaction(userId, quickEquipSlotIdx, chosenItemId);
        }}
        onUnequipSlot={async () => {
          if (quickEquipSlotIdx === null) return;
          await equipHomeShowcaseSlotTransaction(userId, quickEquipSlotIdx, null);
        }}
        onOpenShop={() => {
          if (onOpenShop) onOpenShop();
        }}
        onClose={() => setQuickEquipSlotIdx(null)}
      />
    </section>
  );
};

export default ShowcaseSlots;
