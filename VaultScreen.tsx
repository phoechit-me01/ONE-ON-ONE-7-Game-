import React, { useState, useEffect, useMemo } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  ArrowRightLeft,
  ShoppingBag,
  Users,
  User,
  AlertTriangle,
  Check,
} from 'lucide-react';
import { db, auth, resolvePartnerInfo } from '../firebase';
import {
  ShopItem,
  VAULT_SLOT_KEYS,
  useShopAndInventory,
  equipVaultSlotTransaction,
  swapVaultSlotsTransaction,
  formatItemPriceLabel,
  normalizeHomeSlots,
  normalizeVaultSlots,
  enforceUniquePlacements,
} from '../data/shopCatalog';
import { ItemAssetView } from './ItemAssetView';
import { QuickEquipModal } from './QuickEquipModal';
import { ItemDetailModal } from './ItemDetailModal';

interface VaultScreenProps {
  onOpenShop: () => void;
}

/**
 * GDD Section 5 & 6: DataBoard Trophy & Badge Vault Matrix (6x5 = 30 Slots)
 * - 6 rows x 5 columns (30 slots total). Each slot box is 56px x 56px (#000000 bg, 1px solid #334155, 8px radius).
 * - Tapping any equipped item opens ItemDetailModal with large high-res preview, tier, price, and Buy / Equip / Swap / Unequip actions.
 * - Tapping an empty "+" slot opens QuickEquipModal (Owned Inventory) for 1-tap placement.
 * - Sub-Text Label Box directly underneath each 56px x 56px slot:
 *   * Top line: Item Name (10px, #94A3B8)
 *   * Bottom line: Price / Original Value (🪙 5,000 or 💎 100) or "+ Equip" / "Empty" state.
 */
export const VaultScreen: React.FC<VaultScreenProps> = ({ onOpenShop }) => {
  const {
    userId,
    displayName,
    catalog,
    catalogMap,
    walletGold,
    walletGems,
    ownedItemIds,
    homeSlots,
    vaultSlots,
  } = useShopAndInventory();

  const [viewingMode, setViewingMode] = useState<'self' | 'partner'>('self');
  const [isArrangeMode, setIsArrangeMode] = useState<boolean>(false);
  const [arrangeSourceSlot, setArrangeSourceSlot] = useState<string | null>(null);
  const [dragSourceSlot, setDragSourceSlot] = useState<string | null>(null);
  const [quickEquipSlotKey, setQuickEquipSlotKey] = useState<string | null>(null);
  const [detailModalState, setDetailModalState] = useState<{
    item: ShopItem;
    slotKey: string;
    slotNumber: number;
    isPartner: boolean;
  } | null>(null);
  const [statusNotice, setStatusNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const ownedSet = useMemo(() => new Set(ownedItemIds), [ownedItemIds]);

  // Partner read-only vault subscription
  const partnerInfo = useMemo(() => resolvePartnerInfo(auth.currentUser), [userId]);
  const [partnerVaultSlots, setPartnerVaultSlots] = useState<Record<string, string>>({});
  const [partnerOwnedCount, setPartnerOwnedCount] = useState<number>(0);

  useEffect(() => {
    if (viewingMode !== 'partner') return;
    const partnerRef = doc(db, 'users', partnerInfo.partnerId);
    const unsub = onSnapshot(
      partnerRef,
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          const rawHome = d.home_slots ?? d.showcase_data?.home_slots;
          const rawVault = d.equipped_vault_slots ?? d.showcase_data?.equipped_vault_slots;
          const deduped = enforceUniquePlacements(
            normalizeHomeSlots(rawHome),
            normalizeVaultSlots(rawVault)
          );
          setPartnerVaultSlots(deduped.vaultSlots);
          const rawInv = Array.isArray(d.vault_inventory)
            ? d.vault_inventory
            : Array.isArray(d.showcase_data?.vault_inventory)
            ? d.showcase_data.vault_inventory
            : [];
          setPartnerOwnedCount(rawInv.length);
        } else {
          setPartnerVaultSlots({});
          setPartnerOwnedCount(0);
        }
      },
      () => {}
    );
    return () => unsub();
  }, [viewingMode, partnerInfo.partnerId]);

  const activeVaultMap = viewingMode === 'self' ? vaultSlots : partnerVaultSlots;

  const vaultSummary = useMemo(() => {
    let equippedCount = 0;
    let totalGoldVal = 0;
    let totalGemVal = 0;
    for (const slotKey of VAULT_SLOT_KEYS) {
      const id = activeVaultMap[slotKey];
      const item = id ? catalogMap[id] : null;
      if (item) {
        equippedCount++;
        totalGoldVal += item.price_gold || 0;
        totalGemVal += item.price_gems || 0;
      }
    }
    return { equippedCount, totalGoldVal, totalGemVal };
  }, [activeVaultMap, catalogMap]);

  const showNotice = (type: 'success' | 'error', text: string) => {
    setStatusNotice({ type, text });
    window.setTimeout(() => {
      setStatusNotice((prev) => (prev?.text === text ? null : prev));
    }, 2800);
  };

  const handleVaultSlotClick = async (slotKey: string, slotIndex: number) => {
    const slotNum = slotIndex + 1;
    const itemId = activeVaultMap[slotKey] || null;
    const item = itemId ? catalogMap[itemId] : null;

    // Partner Vault: tapping any equipped item opens ItemDetailModal (to inspect or Buy/Equip!)
    if (viewingMode === 'partner') {
      if (item) {
        setDetailModalState({
          item,
          slotKey,
          slotNumber: slotNum,
          isPartner: true,
        });
      }
      return;
    }

    // Arrange / Move Mode
    if (isArrangeMode) {
      if (!arrangeSourceSlot) {
        setArrangeSourceSlot(slotKey);
        return;
      }
      if (arrangeSourceSlot === slotKey) {
        setArrangeSourceSlot(null);
        return;
      }
      const sourceHasItem = Boolean(vaultSlots[arrangeSourceSlot]);
      const targetHasItem = Boolean(vaultSlots[slotKey]);
      if (!sourceHasItem && !targetHasItem) {
        setArrangeSourceSlot(slotKey);
        return;
      }
      const fromKey = arrangeSourceSlot;
      setArrangeSourceSlot(null);
      await swapVaultSlotsTransaction(userId, fromKey, slotKey);
      showNotice('success', `Updated Vault Slot #${slotNum}`);
      return;
    }

    // Occupied Vault Slot -> Open High-Res Item Detail Popup Modal
    if (item) {
      setDetailModalState({
        item,
        slotKey,
        slotNumber: slotNum,
        isPartner: false,
      });
      return;
    }

    // Empty "+" Vault Slot -> Open QuickEquipModal (or Shop if 0 owned items)
    if (ownedItemIds.length === 0) {
      onOpenShop();
      return;
    }
    setQuickEquipSlotKey(slotKey);
  };

  const handleDropOnSlot = async (targetSlotKey: string) => {
    if (viewingMode === 'partner' || !dragSourceSlot || dragSourceSlot === targetSlotKey) {
      setDragSourceSlot(null);
      return;
    }
    const fromKey = dragSourceSlot;
    setDragSourceSlot(null);
    await swapVaultSlotsTransaction(userId, fromKey, targetSlotKey);
    showNotice('success', 'Vault arrangement saved');
  };

  const quickEquipSlotNumber = quickEquipSlotKey
    ? VAULT_SLOT_KEYS.indexOf(quickEquipSlotKey) + 1
    : 0;

  return (
    <div className="w-full flex-1 flex flex-col bg-[#0B0F19] text-[#F8FAFC] select-none pb-6">
      {/* Top DataBoard Vault Header & Mode Switch */}
      <div className="px-4 pt-3.5 pb-3 border-b border-[#1E293B] bg-[#0F172A]">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-[15px] font-bold text-[#F8FAFC] tracking-tight">
              Trophy & Badge Vault
            </h1>
            <p className="text-[11px] text-[#94A3B8] mt-0.5 tabular-nums">
              {viewingMode === 'self' ? displayName : partnerInfo.partnerName} ·{' '}
              {vaultSummary.equippedCount}/30 Slots · Owned{' '}
              {viewingMode === 'self' ? ownedItemIds.length : partnerOwnedCount}/56
            </p>
          </div>

          {/* Self / Partner Segmented Switch */}
          <div className="flex items-center gap-1 p-1 rounded-[8px] bg-[#1E293B] shrink-0">
            <button
              type="button"
              onClick={() => {
                setViewingMode('self');
                setArrangeSourceSlot(null);
              }}
              className={`px-2.5 py-1 rounded-[6px] text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer slot-tap-feedback ${
                viewingMode === 'self'
                  ? 'bg-[#2563EB] text-white'
                  : 'text-[#94A3B8]'
              }`}
            >
              <User size={12} />
              <span>Mine</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setViewingMode('partner');
                setIsArrangeMode(false);
                setArrangeSourceSlot(null);
              }}
              className={`px-2.5 py-1 rounded-[6px] text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer slot-tap-feedback ${
                viewingMode === 'partner'
                  ? 'bg-[#2563EB] text-white'
                  : 'text-[#94A3B8]'
              }`}
            >
              <Users size={12} />
              <span>Partner</span>
            </button>
          </div>
        </div>

        {/* Portfolio Valuation + Custom Arrangement Toolbar */}
        <div className="mt-3 pt-2.5 border-t border-[#1E293B] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] text-[#CBD5E1] tabular-nums">
            <span className="text-[#94A3B8]">Vault Value:</span>
            <span>🪙 {vaultSummary.totalGoldVal.toLocaleString('en-US')}</span>
            <span aria-hidden="true">·</span>
            <span>💎 {vaultSummary.totalGemVal.toLocaleString('en-US')}</span>
          </div>

          {viewingMode === 'self' && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsArrangeMode((prev) => !prev);
                  setArrangeSourceSlot(null);
                }}
                className={`px-2.5 py-1 rounded-[6px] text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer slot-tap-feedback ${
                  isArrangeMode
                    ? 'bg-[#38BDF8] text-[#000000]'
                    : 'bg-[#1E293B] text-[#E2E8F0] border border-[#334155]'
                }`}
              >
                <ArrowRightLeft size={12} />
                <span>{isArrangeMode ? 'Done Moving' : 'Arrange'}</span>
              </button>

              <button
                type="button"
                onClick={onOpenShop}
                className="px-2.5 py-1 rounded-[6px] bg-[#F59E0B] text-[#000000] text-[11px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer slot-tap-feedback"
              >
                <ShoppingBag size={12} />
                <span>Shop</span>
              </button>
            </div>
          )}
        </div>

        {isArrangeMode && viewingMode === 'self' && (
          <div className="mt-2 px-2.5 py-1.5 rounded-[6px] bg-[#1E293B] text-[11px] text-[#38BDF8]">
            {arrangeSourceSlot
              ? `Selected Slot #${
                  VAULT_SLOT_KEYS.indexOf(arrangeSourceSlot) + 1
                } — tap any destination slot (1–30) to move or swap.`
              : 'Tap any Vault slot first, then tap another slot to rearrange freely.'}
          </div>
        )}

        {statusNotice && (
          <div
            role="alert"
            className={`mt-2 px-2.5 py-1.5 rounded-[8px] text-[11px] font-semibold flex items-center gap-1.5 ${
              statusNotice.type === 'success'
                ? 'bg-[#064E3B] text-[#6EE7B7] border border-[#10B981]'
                : 'bg-[#450A0A] text-[#FCA5A5] border border-[#EF4444]'
            }`}
          >
            {statusNotice.type === 'error' ? (
              <AlertTriangle size={13} className="shrink-0" />
            ) : (
              <Check size={13} className="shrink-0" />
            )}
            <span>{statusNotice.text}</span>
          </div>
        )}
      </div>

      {/* 6x5 = 30 Slots Matrix */}
      <div className="px-3 pt-4">
        <div className="grid grid-cols-5 gap-x-2 gap-y-3 justify-items-center">
          {VAULT_SLOT_KEYS.map((slotKey, idx) => {
            const itemId = activeVaultMap[slotKey] || null;
            const item = itemId ? catalogMap[itemId] : null;
            const isSelectedSource = arrangeSourceSlot === slotKey;
            const isClickable = viewingMode === 'self' || Boolean(item);

            return (
              <div
                key={slotKey}
                className="flex flex-col items-center w-[64px]"
                onDragOver={(e) => {
                  if (viewingMode === 'self') e.preventDefault();
                }}
                onDrop={() => {
                  void handleDropOnSlot(slotKey);
                }}
              >
                {/* 56px x 56px Matrix Box */}
                <button
                  type="button"
                  draggable={viewingMode === 'self' && Boolean(item)}
                  onDragStart={() => {
                    if (viewingMode === 'self' && item) {
                      setDragSourceSlot(slotKey);
                    }
                  }}
                  onDragEnd={() => setDragSourceSlot(null)}
                  onClick={() => {
                    void handleVaultSlotClick(slotKey, idx);
                  }}
                  className={`w-[56px] h-[56px] bg-[#000000] rounded-[8px] flex items-center justify-center relative shrink-0 ${
                    isClickable ? 'cursor-pointer slot-tap-feedback' : 'cursor-default'
                  } ${
                    isSelectedSource
                      ? 'border-2 border-[#38BDF8]'
                      : item
                      ? 'border border-[#475569] hover:border-[#60A5FA]'
                      : 'border border-[#334155]'
                  }`}
                  aria-label={
                    item
                      ? `Vault Slot ${idx + 1}: ${item.item_name} (${formatItemPriceLabel(item)})`
                      : `Vault Slot ${idx + 1}: Empty`
                  }
                >
                  {item ? (
                    <ItemAssetView
                      item={item}
                      size="md"
                      isEquipped={true}
                      enableFloat={true}
                      enableShimmer={true}
                    />
                  ) : (
                    <span className="text-[#64748B] text-[20px] leading-none font-medium">
                      +
                    </span>
                  )}
                </button>

                {/* Sub-Text Label Box directly underneath each 56x56 slot */}
                <div
                  onClick={() => {
                    void handleVaultSlotClick(slotKey, idx);
                  }}
                  className={`w-[64px] mt-1 px-1 py-0.5 rounded-[4px] bg-[#111827] border border-[#1E293B] flex flex-col items-center text-center ${
                    isClickable ? 'cursor-pointer' : ''
                  }`}
                >
                  <span
                    className="w-full text-[10px] leading-[13px] text-[#94A3B8] truncate"
                    title={item ? item.item_name : `Slot ${idx + 1}`}
                  >
                    {item ? item.item_name : `Slot ${idx + 1}`}
                  </span>
                  <span
                    className={`w-full text-[10px] leading-[13px] font-semibold tabular-nums truncate ${
                      item ? 'text-[#E2E8F0]' : 'text-[#64748B]'
                    }`}
                  >
                    {item
                      ? formatItemPriceLabel(item)
                      : viewingMode === 'self'
                      ? '+ Equip'
                      : 'Empty'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Item Detail Popup Modal when tapping any equipped item in Vault */}
      <ItemDetailModal
        item={detailModalState?.item || null}
        userId={userId}
        walletGold={walletGold}
        walletGems={walletGems}
        isOwned={
          detailModalState ? ownedSet.has(detailModalState.item.item_id) : false
        }
        homeSlots={homeSlots}
        vaultSlots={vaultSlots}
        contextSlot={
          detailModalState
            ? {
                area: 'vault',
                slotKey: detailModalState.slotKey,
                label: `Vault Slot #${detailModalState.slotNumber}`,
                isReadOnlyPartner: detailModalState.isPartner,
              }
            : null
        }
        onClose={() => setDetailModalState(null)}
        onChangeSlotItem={
          detailModalState && !detailModalState.isPartner
            ? () => {
                const targetKey = detailModalState.slotKey;
                setDetailModalState(null);
                setQuickEquipSlotKey(targetKey);
              }
            : undefined
        }
        onActionFeedback={(type, message) => showNotice(type, message)}
      />

      {/* 1-Tap Owned Inventory Equip Modal for Empty / Swap Vault Slot */}
      <QuickEquipModal
        isOpen={quickEquipSlotKey !== null && viewingMode === 'self'}
        targetTitle={`Vault Slot #${quickEquipSlotNumber}`}
        currentSlotItemId={
          quickEquipSlotKey ? vaultSlots[quickEquipSlotKey] || null : null
        }
        ownedItemIds={ownedItemIds}
        catalog={catalog}
        homeSlots={homeSlots}
        vaultSlots={vaultSlots}
        onSelectItem={async (chosenItemId) => {
          if (!quickEquipSlotKey) return;
          await equipVaultSlotTransaction(userId, quickEquipSlotKey, chosenItemId);
          showNotice('success', `Equipped in Vault Slot #${quickEquipSlotNumber}`);
        }}
        onUnequipSlot={async () => {
          if (!quickEquipSlotKey) return;
          await equipVaultSlotTransaction(userId, quickEquipSlotKey, null);
          showNotice('success', `Cleared Vault Slot #${quickEquipSlotNumber}`);
        }}
        onOpenShop={onOpenShop}
        onClose={() => setQuickEquipSlotKey(null)}
      />
    </div>
  );
};

export default VaultScreen;
