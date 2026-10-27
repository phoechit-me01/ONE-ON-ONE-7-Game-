import React, { useState, useEffect } from 'react';
import {
  X,
  ShoppingBag,
  Sparkles,
  Check,
  AlertTriangle,
  Trash2,
  ArrowRightLeft,
} from 'lucide-react';
import {
  ShopItem,
  VAULT_SLOT_KEYS,
  formatItemPriceLabel,
  findItemEquippedLocation,
  purchaseShopItemTransaction,
  equipHomeShowcaseSlotTransaction,
  equipVaultSlotTransaction,
} from '../data/shopCatalog';
import { ItemAssetView } from './ItemAssetView';

export interface ItemDetailModalProps {
  item: ShopItem | null;
  userId: string;
  walletGold: number;
  walletGems: number;
  isOwned: boolean;
  homeSlots: (string | null)[];
  vaultSlots: Record<string, string>;
  /** Optional context when opened from a specific Vault or Showcase slot */
  contextSlot?: {
    area: 'vault' | 'showcase';
    slotKey?: string;
    slotIndex?: number;
    label: string;
    isReadOnlyPartner?: boolean;
  } | null;
  onClose: () => void;
  /** Optional handler to open the full Owned Inventory picker to swap another item into contextSlot */
  onChangeSlotItem?: () => void;
  /** Optional callback to navigate to Vault to pick any specific slot out of 30 */
  onOpenVault?: () => void;
  /** Optional callback to broadcast purchase/equip feedback to parent screen */
  onActionFeedback?: (type: 'success' | 'error', message: string) => void;
}

/**
 * Item Detail Popup Modal (Shop, Vault & Showcase)
 * Displays:
 * - Large high-resolution preview (168x168 pure black stage + w1000 PNG + vivid floating/shimmer)
 * - Item name, tier, category, price details, and live wallet comparison
 * - Strict wallet validation with clear Insufficient Gold / Gems alert
 * - Clear Buy / Equip / Move / Unequip action buttons
 */
export const ItemDetailModal: React.FC<ItemDetailModalProps> = ({
  item,
  userId,
  walletGold,
  walletGems,
  isOwned,
  homeSlots,
  vaultSlots,
  contextSlot = null,
  onClose,
  onChangeSlotItem,
  onOpenVault,
  onActionFeedback,
}) => {
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [showSlotSelector, setShowSlotSelector] = useState<boolean>(false);
  const [modalAlert, setModalAlert] = useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);

  useEffect(() => {
    setModalAlert(null);
    setShowSlotSelector(false);
    setIsBusy(false);
  }, [item?.item_id]);

  if (!item) return null;

  const equippedLocation = isOwned
    ? findItemEquippedLocation(item.item_id, homeSlots, vaultSlots)
    : null;

  const findFirstOpenVaultSlot = (): string => {
    for (const key of VAULT_SLOT_KEYS) {
      if (!vaultSlots[key]) return key;
    }
    return 'slot_1';
  };

  const handleBuyClick = async () => {
    if (isBusy) return;
    setModalAlert(null);

    const reqGold = Math.max(0, Number(item.price_gold) || 0);
    const reqGems = Math.max(0, Number(item.price_gems) || 0);

    // 1. Strict client-side wallet check before Firestore transaction
    if (reqGems > 0 && walletGems < reqGems) {
      const errMsg = `Insufficient Gems! Need 💎 ${reqGems.toLocaleString(
        'en-US'
      )} (Your wallet: 💎 ${walletGems.toLocaleString('en-US')}).`;
      setModalAlert({ type: 'error', text: errMsg });
      onActionFeedback?.('error', errMsg);
      return;
    }

    if (reqGold > 0 && walletGold < reqGold) {
      const errMsg = `Insufficient Gold! Need 🪙 ${reqGold.toLocaleString(
        'en-US'
      )} (Your wallet: 🪙 ${walletGold.toLocaleString('en-US')}).`;
      setModalAlert({ type: 'error', text: errMsg });
      onActionFeedback?.('error', errMsg);
      return;
    }

    // 2. Atomic Firestore purchase transaction
    setIsBusy(true);
    try {
      const res = await purchaseShopItemTransaction(userId, item);
      if (!res.ok) {
        const msg = res.error || 'Insufficient Gold / Gems!';
        setModalAlert({ type: 'error', text: msg });
        onActionFeedback?.('error', msg);
        return;
      }

      const okMsg = `Purchased ${item.item_name}! Choose a slot below to equip.`;
      setModalAlert({ type: 'success', text: okMsg });
      setShowSlotSelector(true);
      onActionFeedback?.('success', `Unlocked ${item.item_name}!`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleEquipShowcase = async (slotIndex: number) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await equipHomeShowcaseSlotTransaction(userId, slotIndex, item.item_id);
      const msg = `Equipped ${item.item_name} in Showcase #${slotIndex + 1}`;
      onActionFeedback?.('success', msg);
      onClose();
    } finally {
      setIsBusy(false);
    }
  };

  const handleEquipVault = async (slotKey: string) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await equipVaultSlotTransaction(userId, slotKey, item.item_id);
      const slotNum = VAULT_SLOT_KEYS.indexOf(slotKey) + 1;
      const msg = `Equipped ${item.item_name} in Vault Slot #${slotNum}`;
      onActionFeedback?.('success', msg);
      onClose();
    } finally {
      setIsBusy(false);
    }
  };

  const handleUnequipCurrentContextSlot = async () => {
    if (!contextSlot || isBusy) return;
    setIsBusy(true);
    try {
      if (contextSlot.area === 'showcase' && typeof contextSlot.slotIndex === 'number') {
        await equipHomeShowcaseSlotTransaction(userId, contextSlot.slotIndex, null);
      } else if (contextSlot.area === 'vault' && contextSlot.slotKey) {
        await equipVaultSlotTransaction(userId, contextSlot.slotKey, null);
      }
      onActionFeedback?.('success', `Removed ${item.item_name} from ${contextSlot.label}`);
      onClose();
    } finally {
      setIsBusy(false);
    }
  };

  const nextOpenVaultKey = findFirstOpenVaultSlot();
  const nextOpenVaultNum = VAULT_SLOT_KEYS.indexOf(nextOpenVaultKey) + 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-4 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[392px] max-h-[90vh] overflow-y-auto bg-[#0B0F19] border border-[#334155] rounded-[18px] p-4 text-[#F8FAFC] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Close Row */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 text-[11px] text-[#94A3B8]">
            <span className="font-semibold text-[#CBD5E1]">{item.tier} Tier</span>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{item.category}</span>
            {equippedLocation && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#38BDF8] font-semibold">
                  {equippedLocation.label}
                </span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-[8px] border border-[#334155] bg-[#111827] flex items-center justify-center text-[#94A3B8] hover:text-white cursor-pointer shrink-0 slot-tap-feedback"
            aria-label="Close item detail popup"
          >
            <X size={16} />
          </button>
        </div>

        {/* Large High-Resolution Preview Stage */}
        <div className="w-full flex flex-col items-center">
          <div className="w-[168px] h-[168px] rounded-[16px] bg-[#000000] border border-[#334155] flex items-center justify-center relative">
            <ItemAssetView
              item={item}
              size="xl"
              isEquipped={Boolean(equippedLocation)}
              enableFloat={true}
              enableShimmer={true}
            />
          </div>

          {/* Item Title */}
          <h2 className="mt-3.5 text-[18px] font-bold text-[#F8FAFC] text-center leading-snug">
            {item.item_name}
          </h2>

          {/* Price & Ownership Metadata Row */}
          <div className="mt-2 w-full rounded-[12px] bg-[#111827] border border-[#1E293B] px-3.5 py-2.5 flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] text-[#94A3B8]">Item Price / Value</div>
              <div className="text-[14px] font-bold text-[#F8FAFC] tabular-nums mt-0.5">
                {formatItemPriceLabel(item)}{' '}
                <span className="text-[11px] font-normal text-[#94A3B8]">
                  {item.price_gems > 0 ? 'Gems' : 'Gold'}
                </span>
              </div>
            </div>

            <div className="text-right">
              <div className="text-[10px] text-[#94A3B8]">Your Wallet</div>
              <div className="text-[12px] font-semibold text-[#CBD5E1] tabular-nums mt-0.5">
                🪙 {walletGold.toLocaleString('en-US')} · 💎{' '}
                {walletGems.toLocaleString('en-US')}
              </div>
            </div>
          </div>
        </div>

        {/* Insufficient Funds / Success Alert Box inside Modal */}
        {modalAlert && (
          <div
            role="alert"
            className={`mt-3 px-3 py-2.5 rounded-[10px] text-[12px] font-semibold flex items-start gap-2 ${
              modalAlert.type === 'error'
                ? 'bg-[#450A0A] border border-[#EF4444] text-[#FCA5A5]'
                : 'bg-[#064E3B] border border-[#10B981] text-[#6EE7B7]'
            }`}
          >
            {modalAlert.type === 'error' ? (
              <AlertTriangle size={16} className="text-[#F87171] shrink-0 mt-0.5" />
            ) : (
              <Check size={16} className="text-[#34D399] shrink-0 mt-0.5" />
            )}
            <span>{modalAlert.text}</span>
          </div>
        )}

        {/* Primary Action Area: Buy OR Equip */}
        {!isOwned ? (
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                void handleBuyClick();
              }}
              className="w-full h-[46px] rounded-[10px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[14px] font-bold flex items-center justify-center gap-2 cursor-pointer slot-tap-feedback tabular-nums"
            >
              <ShoppingBag size={16} />
              <span>
                {isBusy
                  ? 'Processing Purchase...'
                  : `Buy Item · ${formatItemPriceLabel(item)}`}
              </span>
            </button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-2.5">
            {/* Ownership Status Indicator */}
            <div className="flex items-center justify-between text-[11px] px-1">
              <span className="text-[#34D399] font-semibold flex items-center gap-1">
                <Check size={13} /> Owned in Inventory
              </span>
              {equippedLocation && (
                <span className="text-[#38BDF8] font-semibold">
                  Currently at {equippedLocation.label}
                </span>
              )}
            </div>

            {/* Primary Equip CTA when slot selector isn't expanded yet */}
            {!showSlotSelector ? (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => setShowSlotSelector(true)}
                  className="w-full h-[44px] rounded-[10px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[13px] font-bold flex items-center justify-center gap-1.5 cursor-pointer slot-tap-feedback"
                >
                  <Sparkles size={15} />
                  <span>
                    {equippedLocation ? 'Move / Equip to Slot' : 'Equip Item'}
                  </span>
                </button>

                {/* Contextual Slot Controls when opened from Vault or Showcase */}
                {contextSlot && !contextSlot.isReadOnlyPartner && (
                  <div className="grid grid-cols-2 gap-2">
                    {onChangeSlotItem && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          onClose();
                          onChangeSlotItem();
                        }}
                        className="h-[38px] rounded-[8px] bg-[#1E293B] border border-[#334155] text-[#E2E8F0] text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer slot-tap-feedback"
                      >
                        <ArrowRightLeft size={13} />
                        <span>Swap Item</span>
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        void handleUnequipCurrentContextSlot();
                      }}
                      className={`h-[38px] rounded-[8px] bg-[#450A0A]/70 border border-[#EF4444]/60 text-[#FCA5A5] text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer slot-tap-feedback ${
                        onChangeSlotItem ? '' : 'col-span-2'
                      }`}
                    >
                      <Trash2 size={13} />
                      <span>Unequip Slot</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Expanded Target Slot Picker (Showcase #1–#3 + Vault Auto-Place / Pick Slot) */
              <div className="rounded-[12px] bg-[#111827] border border-[#334155] p-3">
                <div className="text-[11px] font-semibold text-[#CBD5E1] mb-2">
                  Home Profile Showcase (3 Slots)
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((idx) => {
                    const occ = homeSlots[idx];
                    const isSelf = occ === item.item_id;
                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          void handleEquipShowcase(idx);
                        }}
                        className={`py-2 px-1.5 rounded-[8px] border text-[11px] font-semibold cursor-pointer slot-tap-feedback ${
                          isSelf
                            ? 'bg-[#1E293B] border-[#38BDF8] text-[#38BDF8]'
                            : 'bg-[#000000] border-[#334155] text-[#F8FAFC]'
                        }`}
                      >
                        Slot #{idx + 1}
                        <div className="text-[9px] text-[#94A3B8] mt-0.5">
                          {isSelf ? 'Equipped' : occ ? 'Replace' : 'Empty (+)'}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="text-[11px] font-semibold text-[#CBD5E1] mt-3 mb-2">
                  DataBoard Trophy Vault (30 Slots)
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      void handleEquipVault(nextOpenVaultKey);
                    }}
                    className="flex-1 h-[38px] rounded-[8px] bg-[#2563EB] text-white text-[12px] font-bold cursor-pointer slot-tap-feedback"
                  >
                    Place in Vault #{nextOpenVaultNum}
                  </button>

                  {onOpenVault && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        onClose();
                        onOpenVault();
                      }}
                      className="px-3 h-[38px] rounded-[8px] bg-[#1E293B] border border-[#334155] text-[#CBD5E1] text-[11px] font-semibold cursor-pointer slot-tap-feedback whitespace-nowrap"
                    >
                      Open Vault
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ItemDetailModal;
