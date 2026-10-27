import React from 'react';
import { X, Send } from 'lucide-react';
import {
  GiftShopItem,
  calculateGiftResaleValue,
  formatGiftPriceLabel,
} from '../services/giftService';
import { GiftAssetView } from './GiftAssetView';

export interface GiftCatalogDetailModalProps {
  item: GiftShopItem | null;
  walletGold: number;
  walletGems: number;
  recipientName?: string;
  onClose: () => void;
  onSendClick: (item: GiftShopItem) => void;
}

/**
 * "See More" Detail Popup Modal for any item in the 110-item Gift Shop Catalog.
 * Displays large animated PNG stage, Item Name, Tier, Category, Price, Gift Points,
 * 75% Resale Value reference, and direct "Send" trigger targeting the partner player.
 */
export const GiftCatalogDetailModal: React.FC<GiftCatalogDetailModalProps> = ({
  item,
  walletGold,
  walletGems,
  recipientName = 'Tin Moe Hlaing',
  onClose,
  onSendClick,
}) => {
  if (!item) return null;

  const resaleBreakdown = calculateGiftResaleValue(
    item.basePrice,
    item.currencyType,
    item.platformFeePercent
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-4 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[392px] max-h-[90vh] overflow-y-auto bg-[#0B0F19] border border-[#334155] rounded-[18px] p-4 text-[#F8FAFC] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Metadata & Close Button */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 text-[11px] text-[#94A3B8] min-w-0 truncate">
            <span className="font-semibold text-[#E2E8F0]">{item.tierTitle} Tier</span>
            <span aria-hidden="true">·</span>
            <span className="capitalize truncate">{item.category}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-[10px] text-[#64748B]">{item.itemId}</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-[8px] border border-[#334155] bg-[#111827] flex items-center justify-center text-[#94A3B8] hover:text-white cursor-pointer shrink-0 slot-tap-feedback"
            aria-label="Close gift details"
          >
            <X size={16} />
          </button>
        </div>

        {/* High-Resolution Animated Preview Stage */}
        <div className="w-full flex flex-col items-center">
          <GiftAssetView
            itemName={item.itemName}
            tierTitle={item.tierTitle}
            itemAssetUrl={item.itemAssetUrl}
            fileId={item.fileId}
            size="modal"
            className="w-[164px] h-[164px]"
          />

          <h2 className="mt-3.5 text-[18px] font-bold text-[#F8FAFC] text-center leading-snug">
            {item.itemName}
          </h2>

          <p className="mt-1 text-[11px] text-[#94A3B8] text-center">
            Target Recipient:{' '}
            <span className="text-[#F8FAFC] font-semibold">{recipientName}</span>
          </p>
        </div>

        {/* Structured Item Specifications */}
        <div className="mt-3.5 rounded-[12px] bg-[#111827] border border-[#1E293B] divide-y divide-[#1E293B]">
          <div className="px-3.5 py-2.5 flex items-center justify-between text-[12px]">
            <span className="text-[#94A3B8]">Gift Price</span>
            <span className="font-bold text-[#F8FAFC] tabular-nums">
              {formatGiftPriceLabel(item.basePrice, item.currencyType)}
            </span>
          </div>

          <div className="px-3.5 py-2.5 flex items-center justify-between text-[12px]">
            <span className="text-[#94A3B8]">Gift Points Awarded</span>
            <span className="font-bold text-[#34D399] tabular-nums">
              +{item.giftPoints.toLocaleString('en-US')} GP
            </span>
          </div>

          <div className="px-3.5 py-2.5 flex items-center justify-between text-[12px]">
            <span className="text-[#94A3B8]">Tier Classification</span>
            <span className="font-semibold text-[#E2E8F0]">{item.tierTitle}</span>
          </div>

          <div className="px-3.5 py-2.5 flex items-center justify-between text-[12px]">
            <span className="text-[#94A3B8]">Recipient Resale Value (75%)</span>
            <span className="font-semibold text-[#CBD5E1] tabular-nums">
              {formatGiftPriceLabel(
                resaleBreakdown.netResaleValue,
                resaleBreakdown.currencyType
              )}
            </span>
          </div>

          <div className="px-3.5 py-2.5 flex items-center justify-between text-[12px]">
            <span className="text-[#94A3B8]">Your Wallet Balance</span>
            <span className="font-semibold text-[#CBD5E1] tabular-nums">
              🪙 {walletGold.toLocaleString('en-US')} · 💎{' '}
              {walletGems.toLocaleString('en-US')}
            </span>
          </div>
        </div>

        {/* Primary Action CTA */}
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-[44px] px-4 rounded-[10px] bg-[#1E293B] border border-[#334155] text-[#CBD5E1] text-[12px] font-semibold cursor-pointer slot-tap-feedback whitespace-nowrap shrink-0"
          >
            Close
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onSendClick(item);
            }}
            className="flex-1 h-[44px] rounded-[10px] bg-[#E11D48] hover:bg-[#BE123C] text-white text-[13px] font-bold flex items-center justify-center gap-2 cursor-pointer slot-tap-feedback whitespace-nowrap tabular-nums"
          >
            <Send size={15} />
            <span>
              Send · {formatGiftPriceLabel(item.basePrice, item.currencyType)}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default GiftCatalogDetailModal;
