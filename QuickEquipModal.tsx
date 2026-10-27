import React, { useState, useMemo } from 'react';
import { X, ShoppingBag, Trash2, Check, ArrowRightLeft } from 'lucide-react';
import {
  ShopItem,
  ItemCategory,
  formatItemPriceLabel,
  findItemEquippedLocation,
} from '../data/shopCatalog';
import { ItemAssetView } from './ItemAssetView';

export interface QuickEquipModalProps {
  isOpen: boolean;
  targetTitle: string;
  currentSlotItemId: string | null;
  ownedItemIds: string[];
  catalog: ShopItem[];
  homeSlots: (string | null)[];
  vaultSlots: Record<string, string>;
  onSelectItem: (itemId: string) => Promise<void> | void;
  onUnequipSlot: () => Promise<void> | void;
  onOpenShop: () => void;
  onClose: () => void;
}

type FilterTab = 'all' | ItemCategory;

export const QuickEquipModal: React.FC<QuickEquipModalProps> = ({
  isOpen,
  targetTitle,
  currentSlotItemId,
  ownedItemIds,
  catalog,
  homeSlots,
  vaultSlots,
  onSelectItem,
  onUnequipSlot,
  onOpenShop,
  onClose,
}) => {
  const [filter, setFilter] = useState<FilterTab>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const ownedItems = useMemo(() => {
    const ownedSet = new Set(ownedItemIds);
    return catalog.filter((item) => {
      if (!ownedSet.has(item.item_id)) return false;
      if (filter === 'all') return true;
      return item.category === filter;
    });
  }, [catalog, ownedItemIds, filter]);

  if (!isOpen) return null;

  const handleEquipTap = async (itemId: string) => {
    if (busyId) return;
    setBusyId(itemId);
    try {
      await onSelectItem(itemId);
      onClose();
    } finally {
      setBusyId(null);
    }
  };

  const handleUnequipTap = async () => {
    if (busyId) return;
    setBusyId('__unequip__');
    try {
      await onUnequipSlot();
      onClose();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 px-3 py-4 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[406px] max-h-[82vh] bg-[#0B0F19] border border-[#334155] rounded-[16px] flex flex-col overflow-hidden text-[#F8FAFC]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#1E293B] flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-[14px] font-bold text-[#F8FAFC] truncate">
              Equip {targetTitle}
            </h3>
            <p className="text-[11px] text-[#94A3B8] mt-0.5">
              Tap an owned item to equip · No duplicate slots allowed
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-[8px] border border-[#334155] bg-[#111827] flex items-center justify-center text-[#94A3B8] hover:text-white cursor-pointer shrink-0 slot-tap-feedback"
            aria-label="Close inventory picker"
          >
            <X size={16} />
          </button>
        </div>

        {/* Category Filter + Actions Bar */}
        <div className="px-4 py-2.5 border-b border-[#1E293B] flex items-center justify-between gap-2 bg-[#0F172A]">
          <div className="flex items-center gap-1 overflow-x-auto">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'star', label: 'Stars' },
                { id: 'crown', label: 'Crowns' },
                { id: 'frame', label: 'Frames' },
              ] as { id: FilterTab; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-2.5 py-1 rounded-[6px] text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer slot-tap-feedback ${
                  filter === tab.id
                    ? 'bg-[#2563EB] text-white'
                    : 'bg-[#1E293B] text-[#94A3B8]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenShop();
            }}
            className="px-2.5 py-1 rounded-[6px] bg-[#F59E0B] text-[#000000] text-[11px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer slot-tap-feedback"
          >
            <ShoppingBag size={12} />
            <span>Shop</span>
          </button>
        </div>

        {/* Current Slot Unequip Banner if occupied */}
        {currentSlotItemId && (
          <div className="px-4 py-2 bg-[#111827] border-b border-[#1E293B] flex items-center justify-between">
            <span className="text-[11px] text-[#CBD5E1]">
              Slot currently occupied
            </span>
            <button
              type="button"
              disabled={Boolean(busyId)}
              onClick={handleUnequipTap}
              className="px-2.5 py-1 rounded-[6px] border border-[#EF4444]/60 bg-[#EF4444]/15 text-[#FCA5A5] text-[11px] font-semibold flex items-center gap-1 cursor-pointer slot-tap-feedback"
            >
              <Trash2 size={12} />
              <span>Remove from Slot</span>
            </button>
          </div>
        )}

        {/* Owned Items Grid */}
        <div className="p-3.5 overflow-y-auto flex-1">
          {ownedItems.length === 0 ? (
            <div className="py-8 px-4 text-center flex flex-col items-center">
              <p className="text-[13px] font-semibold text-[#E2E8F0]">
                No owned items in this category yet
              </p>
              <p className="text-[11px] text-[#94A3B8] mt-1 mb-4">
                Visit the Shop to unlock Stars, Crowns, and Frames with Gold or Gems.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenShop();
                }}
                className="px-4 py-2 rounded-[8px] bg-[#2563EB] text-white text-[12px] font-bold flex items-center gap-1.5 cursor-pointer slot-tap-feedback"
              >
                <ShoppingBag size={14} />
                <span>Browse Shop Catalog (56 Items)</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2.5">
              {ownedItems.map((item) => {
                const location = findItemEquippedLocation(
                  item.item_id,
                  homeSlots,
                  vaultSlots
                );
                const isEquippedHere = currentSlotItemId === item.item_id;
                const isEquippedElsewhere = Boolean(location && !isEquippedHere);

                return (
                  <button
                    key={item.item_id}
                    type="button"
                    disabled={Boolean(busyId)}
                    onClick={() => handleEquipTap(item.item_id)}
                    className={`p-2 rounded-[10px] border flex flex-col items-center text-center cursor-pointer slot-tap-feedback ${
                      isEquippedHere
                        ? 'bg-[#1E293B] border-[#38BDF8]'
                        : isEquippedElsewhere
                        ? 'bg-[#0F172A] border-[#475569]'
                        : 'bg-[#000000] border-[#334155]'
                    }`}
                  >
                    <div className="w-[48px] h-[48px] rounded-[8px] bg-[#000000] border border-[#334155] flex items-center justify-center mb-1.5">
                      <ItemAssetView
                        item={item}
                        size="sm"
                        isEquipped={Boolean(location)}
                      />
                    </div>
                    <span className="w-full text-[10px] font-semibold text-[#E2E8F0] truncate">
                      {item.item_name}
                    </span>
                    <span className="text-[10px] text-[#94A3B8] tabular-nums mt-0.5">
                      {formatItemPriceLabel(item)}
                    </span>
                    <span
                      className={`mt-1 text-[9px] font-bold flex items-center gap-0.5 ${
                        isEquippedHere
                          ? 'text-[#38BDF8]'
                          : isEquippedElsewhere
                          ? 'text-[#FBBF24]'
                          : 'text-[#34D399]'
                      }`}
                    >
                      {isEquippedHere ? (
                        <>
                          <Check size={10} /> Equipped
                        </>
                      ) : isEquippedElsewhere ? (
                        <>
                          <ArrowRightLeft size={10} /> Move ({location?.label})
                        </>
                      ) : (
                        'Tap to Equip'
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuickEquipModal;
