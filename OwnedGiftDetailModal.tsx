import React, { useState, useEffect } from 'react';
import { X, Coins, AlertTriangle, Lock } from 'lucide-react';
import {
  OwnedGiftDocument,
  SentGiftDocument,
  calculateGiftResaleValue,
  formatGiftPriceLabel,
  resellOwnedGiftTransaction,
} from '../services/giftService';
import { GiftAssetView } from './GiftAssetView';

export type GiftDetailModalSubject =
  | {
      mode: 'received';
      gift: OwnedGiftDocument;
      slotNumber: number;
    }
  | {
      mode: 'sent';
      gift: SentGiftDocument;
      dispatchIndex: number;
    };

export interface OwnedGiftDetailModalProps {
  subject: GiftDetailModalSubject | null;
  activeUserId: string;
  activeUserDisplayName: string;
  onClose: () => void;
  onResaleComplete?: (summaryText: string) => void;
}

function formatGiftDate(millis: number): string {
  if (!millis || isNaN(millis)) return 'Unknown Date';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(millis));
  } catch {
    return new Date(millis).toLocaleString();
  }
}

/**
 * Detailed Popup Modal for both:
 * 1) "Received Gifts" (`mode: 'received'`): Displays Item Value, Tier, Gift Points,
 *    Sender's Name, Date Received, Attached Message, and enables the 75% Net Resale
 *    "Sell Gift" button strictly for the logged-in recipient holding the item.
 * 2) "Sent History" (`mode: 'sent'`): Read-only dispatch log showing Recipient's Name,
 *    Date Sent, Price Paid, Tier, Gift Points, and Attached Message with resale strictly disabled.
 */
export const OwnedGiftDetailModal: React.FC<OwnedGiftDetailModalProps> = ({
  subject,
  activeUserId,
  activeUserDisplayName,
  onClose,
  onResaleComplete,
}) => {
  const [isSelling, setIsSelling] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const giftDocId = subject?.gift.giftDocId ?? null;

  useEffect(() => {
    setIsSelling(false);
    setErrorText(null);
  }, [giftDocId, subject?.mode]);

  if (!subject) return null;

  const isReceivedMode = subject.mode === 'received';
  const item = subject.gift;

  // Strict Recipient-Only Resale Check:
  // Only the logged-in recipient holding the item in their own `ownedGifts` vault can resell it.
  // Senders can NEVER sell or modify gifts after dispatch.
  const canRecipientResell =
    isReceivedMode &&
    subject.gift.resaleEligible &&
    subject.gift.senderId !== activeUserId &&
    (!subject.gift.recipientId || subject.gift.recipientId === activeUserId);

  const resale = calculateGiftResaleValue(
    item.basePrice,
    item.currencyType,
    25
  );

  const handleSellGift = async () => {
    if (!isReceivedMode || !canRecipientResell || isSelling) return;
    setErrorText(null);
    setIsSelling(true);

    try {
      const res = await resellOwnedGiftTransaction({
        userId: activeUserId,
        giftDocId: subject.gift.giftDocId,
      });

      if (!res.ok) {
        setErrorText(res.error || 'Unable to sell gift right now.');
        return;
      }

      const refundLabel = formatGiftPriceLabel(
        res.netRefundAmount ?? resale.netResaleValue,
        res.currencyType ?? item.currencyType
      );
      onResaleComplete?.(
        `Sold ${item.itemName} for ${refundLabel} (75% net value credited to ${activeUserDisplayName}'s wallet, -${item.giftPoints} GP).`
      );
      onClose();
    } finally {
      setIsSelling(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-4 select-none"
      onClick={() => {
        if (!isSelling) onClose();
      }}
    >
      <div
        className="w-full max-w-[392px] max-h-[90vh] overflow-y-auto bg-[#0B0F19] border border-[#334155] rounded-[18px] p-4 text-[#F8FAFC] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Metadata Row */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 text-[11px] text-[#94A3B8] min-w-0 truncate">
            {isReceivedMode ? (
              <span className="font-semibold text-[#38BDF8] tabular-nums">
                Vault Slot #{String(subject.slotNumber).padStart(3, '0')}
              </span>
            ) : (
              <span className="font-semibold text-[#F59E0B] tabular-nums">
                Sent Log #{String(subject.dispatchIndex).padStart(2, '0')}
              </span>
            )}
            <span aria-hidden="true">·</span>
            <span className="font-semibold text-[#E2E8F0]">{item.tierTitle}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate">
              {isReceivedMode ? 'Received Inventory' : 'Sent History'}
            </span>
          </div>

          <button
            type="button"
            disabled={isSelling}
            onClick={onClose}
            className="w-9 h-9 rounded-[8px] border border-[#334155] bg-[#111827] flex items-center justify-center text-[#94A3B8] hover:text-white cursor-pointer shrink-0 slot-tap-feedback"
            aria-label="Close gift details"
          >
            <X size={16} />
          </button>
        </div>

        {/* High-Resolution Animated Stage */}
        <div className="w-full flex flex-col items-center">
          <GiftAssetView
            itemName={item.itemName}
            tierTitle={item.tierTitle}
            itemAssetUrl={item.itemAssetUrl}
            fileId={item.fileId}
            size="modal"
            className="w-[156px] h-[156px]"
          />

          <h2 className="mt-3 text-[18px] font-bold text-[#F8FAFC] text-center leading-snug">
            {item.itemName}
          </h2>
        </div>

        {/* Metadata Table */}
        <div className="mt-3 rounded-[12px] bg-[#111827] border border-[#1E293B] divide-y divide-[#1E293B]">
          <div className="px-3.5 py-2 flex items-center justify-between text-[12px]">
            <span className="text-[#94A3B8]">
              {isReceivedMode ? 'Original Item Value' : 'Price Paid'}
            </span>
            <span className="font-bold text-[#F8FAFC] tabular-nums">
              {formatGiftPriceLabel(item.basePrice, item.currencyType)}
            </span>
          </div>

          <div className="px-3.5 py-2 flex items-center justify-between text-[12px]">
            <span className="text-[#94A3B8]">Tier</span>
            <span className="font-semibold text-[#E2E8F0]">{item.tierTitle}</span>
          </div>

          <div className="px-3.5 py-2 flex items-center justify-between text-[12px]">
            <span className="text-[#94A3B8]">
              {isReceivedMode ? 'Gift Points Held' : 'Gift Points Gifted'}
            </span>
            <span className="font-bold text-[#34D399] tabular-nums">
              +{item.giftPoints.toLocaleString('en-US')} GP
            </span>
          </div>

          {isReceivedMode ? (
            <>
              <div className="px-3.5 py-2 flex items-center justify-between text-[12px]">
                <span className="text-[#94A3B8]">Sender&apos;s Name</span>
                <span className="font-semibold text-[#F8FAFC]">
                  {subject.gift.senderName}
                </span>
              </div>

              <div className="px-3.5 py-2 flex items-center justify-between text-[12px]">
                <span className="text-[#94A3B8]">Date Received</span>
                <span className="font-medium text-[#CBD5E1] tabular-nums">
                  {formatGiftDate(subject.gift.receivedAtMillis)}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="px-3.5 py-2 flex items-center justify-between text-[12px]">
                <span className="text-[#94A3B8]">Sent To (Recipient)</span>
                <span className="font-semibold text-[#F8FAFC]">
                  {subject.gift.recipientName}
                </span>
              </div>

              <div className="px-3.5 py-2 flex items-center justify-between text-[12px]">
                <span className="text-[#94A3B8]">Date Dispatched</span>
                <span className="font-medium text-[#CBD5E1] tabular-nums">
                  {formatGiftDate(subject.gift.sentAtMillis)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Attached Personal Message */}
        <div className="mt-2.5 rounded-[12px] bg-[#111827] border border-[#1E293B] px-3.5 py-2.5">
          <div className="text-[10px] font-semibold text-[#94A3B8] mb-1">
            Attached Message
          </div>
          {item.message && item.message.trim().length > 0 ? (
            <p className="text-[12px] text-[#F8FAFC] leading-relaxed break-words">
              &ldquo;{item.message.trim()}&rdquo;
            </p>
          ) : (
            <p className="text-[12px] text-[#64748B] italic">
              No personal message attached.
            </p>
          )}
        </div>

        {/* Resale Economy Section (Strictly Recipient-Only vs Disabled on Sent History) */}
        {isReceivedMode && canRecipientResell ? (
          <div className="mt-2.5 rounded-[12px] bg-[#0F172A] border border-[#334155] px-3.5 py-2.5">
            <div className="flex items-center justify-between text-[11px] text-[#94A3B8]">
              <span>Platform Resale Fee (25%)</span>
              <span className="tabular-nums text-[#F87171]">
                -{formatGiftPriceLabel(resale.platformFeeAmount, item.currencyType)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[13px] font-bold">
              <span className="text-[#E2E8F0]">75% Net Resale Refund</span>
              <span className="text-[#FBBF24] tabular-nums">
                +{formatGiftPriceLabel(resale.netResaleValue, item.currencyType)}
              </span>
            </div>
            <div className="mt-1 text-[10px] text-[#94A3B8]">
              Selling removes this item from your vault and deducts{' '}
              {item.giftPoints.toLocaleString('en-US')} GP.
            </div>
          </div>
        ) : (
          <div className="mt-2.5 rounded-[12px] bg-[#0F172A] border border-[#1E293B] px-3.5 py-2.5 flex items-start gap-2">
            <Lock size={14} className="text-[#64748B] shrink-0 mt-0.5" />
            <div className="text-[11px] text-[#94A3B8] leading-snug">
              <span className="font-semibold text-[#CBD5E1]">
                Resale Disabled:
              </span>{' '}
              Dispatched gifts are permanent transfers. Senders cannot sell, recall,
              or modify gifts after they have been sent.
            </div>
          </div>
        )}

        {errorText && (
          <div
            role="alert"
            className="mt-2.5 px-3 py-2 rounded-[10px] bg-[#450A0A] border border-[#EF4444] text-[#FCA5A5] text-[12px] font-semibold flex items-start gap-2"
          >
            <AlertTriangle size={15} className="text-[#F87171] shrink-0 mt-0.5" />
            <span>{errorText}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-3.5 flex items-center gap-2">
          <button
            type="button"
            disabled={isSelling}
            onClick={onClose}
            className={`h-[44px] px-4 rounded-[10px] bg-[#1E293B] border border-[#334155] text-[#CBD5E1] text-[12px] font-semibold cursor-pointer slot-tap-feedback whitespace-nowrap ${
              canRecipientResell ? 'shrink-0' : 'w-full'
            }`}
          >
            Close
          </button>

          {canRecipientResell && (
            <button
              type="button"
              disabled={isSelling}
              onClick={() => {
                void handleSellGift();
              }}
              className="flex-1 h-[44px] rounded-[10px] bg-[#F59E0B] hover:bg-[#D97706] text-[#000000] text-[13px] font-bold flex items-center justify-center gap-1.5 cursor-pointer slot-tap-feedback whitespace-nowrap tabular-nums"
            >
              <Coins size={15} />
              <span>
                {isSelling
                  ? 'Selling Gift...'
                  : `Sell Gift · +${formatGiftPriceLabel(
                      resale.netResaleValue,
                      item.currencyType
                    )}`}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default OwnedGiftDetailModal;
