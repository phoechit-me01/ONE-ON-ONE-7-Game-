import React, { useState, useEffect } from 'react';
import {
  X,
  Lock,
  Eye,
  EyeOff,
  Send,
  Check,
  AlertTriangle,
  Gift,
} from 'lucide-react';
import {
  GiftShopItem,
  formatGiftPriceLabel,
  verifySenderGamePassword,
  sendGiftTransaction,
} from '../services/giftService';
import { GiftAssetView } from './GiftAssetView';

export interface SendGiftFlowModalProps {
  item: GiftShopItem | null;
  senderId: string;
  senderName: string;
  walletGold: number;
  walletGems: number;
  onClose: () => void;
  onOpenSentHistory?: () => void;
  onGiftSentSuccess?: (message: string) => void;
}

/**
 * 2-Step Secure Gifting & Messaging Flow targeting the partner player:
 * Step 1: Game Password verification + strict wallet sufficiency check.
 * Step 2: Optional Personal Message Box + "Now Send Gift" transactional dispatch.
 * Step 3: Instant confirmation receipt with option to open sender's own Sent History log.
 */
export const SendGiftFlowModal: React.FC<SendGiftFlowModalProps> = ({
  item,
  senderId,
  senderName,
  walletGold,
  walletGems,
  onClose,
  onOpenSentHistory,
  onGiftSentSuccess,
}) => {
  const targetRecipient =
    senderId === 'user_tin_moe_hlaing'
      ? { id: 'user_phoe_chit', name: 'PHOE CHIT' }
      : { id: 'user_tin_moe_hlaing', name: 'Tin Moe Hlaing' };
  const [step, setStep] = useState<'password' | 'message' | 'sent'>('password');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [messageInput, setMessageInput] = useState<string>('');
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [sentSlotNumber, setSentSlotNumber] = useState<number>(1);

  useEffect(() => {
    setStep('password');
    setPasswordInput('');
    setShowPassword(false);
    setMessageInput('');
    setIsBusy(false);
    setErrorText(null);
  }, [item?.itemId]);

  if (!item) return null;

  const isInsufficientFunds =
    item.currencyType === 'GEMS'
      ? walletGems < item.basePrice
      : walletGold < item.basePrice;

  const handleVerifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBusy) return;
    setErrorText(null);

    if (isInsufficientFunds) {
      const reqStr = formatGiftPriceLabel(item.basePrice, item.currencyType);
      const curStr =
        item.currencyType === 'GEMS'
          ? `💎 ${walletGems.toLocaleString('en-US')}`
          : `🪙 ${walletGold.toLocaleString('en-US')}`;
      setErrorText(
        `Insufficient ${
          item.currencyType === 'GEMS' ? 'Gems' : 'Gold'
        }! Need ${reqStr} (Your balance: ${curStr}).`
      );
      return;
    }

    const trimmed = passwordInput.trim();
    if (!trimmed) {
      setErrorText('Please enter your Game Password to continue.');
      return;
    }

    setIsBusy(true);
    try {
      const check = await verifySenderGamePassword(senderId, trimmed);
      if (!check.ok) {
        setErrorText(check.error || 'Incorrect Game Password. Please try again.');
        return;
      }
      setStep('message');
    } finally {
      setIsBusy(false);
    }
  };

  const handleNowSendGift = async () => {
    if (isBusy) return;
    setErrorText(null);
    setIsBusy(true);

    try {
      const result = await sendGiftTransaction({
        senderId,
        recipientId: targetRecipient.id,
        itemId: item.itemId,
        pinOrPassword: passwordInput.trim(),
        message: messageInput.trim(),
      });

      if (!result.ok) {
        setErrorText(result.error || 'Unable to send gift. Please try again.');
        return;
      }

      setSentSlotNumber((result.slotIndex ?? 0) + 1);
      setStep('sent');
      onGiftSentSuccess?.(
        `Sent ${item.itemName} (+${item.giftPoints} GP) to ${targetRecipient.name}!`
      );
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-4 select-none"
      onClick={() => {
        if (!isBusy) onClose();
      }}
    >
      <div
        className="w-full max-w-[392px] max-h-[90vh] overflow-y-auto bg-[#0B0F19] border border-[#334155] rounded-[18px] p-4 text-[#F8FAFC] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#1E293B]">
          <div>
            <h2 className="text-[15px] font-bold text-[#F8FAFC]">
              {step === 'password'
                ? 'Security Verification'
                : step === 'message'
                ? 'Attach Personal Message'
                : 'Gift Delivered'}
            </h2>
            <p className="text-[11px] text-[#94A3B8] mt-0.5">
              From <span className="text-[#CBD5E1] font-medium">{senderName}</span> to{' '}
              <span className="text-[#F8FAFC] font-semibold">
                {targetRecipient.name}
              </span>
            </p>
          </div>

          <button
            type="button"
            disabled={isBusy}
            onClick={onClose}
            className="w-9 h-9 rounded-[8px] border border-[#334155] bg-[#111827] flex items-center justify-center text-[#94A3B8] hover:text-white cursor-pointer shrink-0 slot-tap-feedback"
            aria-label="Close send gift modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Compact Selected Gift Summary Card */}
        <div className="mt-3 rounded-[12px] bg-[#111827] border border-[#1E293B] p-2.5 flex items-center gap-3">
          <GiftAssetView
            itemName={item.itemName}
            tierTitle={item.tierTitle}
            itemAssetUrl={item.itemAssetUrl}
            fileId={item.fileId}
            size="grid"
            className="w-[62px] h-[62px] shrink-0"
          />

          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-[#F8FAFC] truncate">
              {item.itemName}
            </div>
            <div className="text-[11px] text-[#94A3B8] mt-0.5 tabular-nums">
              {item.tierTitle} · +{item.giftPoints.toLocaleString('en-US')} GP
            </div>
            <div className="text-[12px] font-bold text-[#FBBF24] mt-1 tabular-nums">
              {formatGiftPriceLabel(item.basePrice, item.currencyType)}
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-[10px] text-[#94A3B8]">Recipient</div>
            <div className="text-[11px] font-bold text-[#F8FAFC] mt-0.5">
              {targetRecipient.name}
            </div>
          </div>
        </div>

        {/* Inline Error Alert */}
        {errorText && (
          <div
            role="alert"
            className="mt-3 px-3 py-2.5 rounded-[10px] bg-[#450A0A] border border-[#EF4444] text-[#FCA5A5] text-[12px] font-semibold flex items-start gap-2"
          >
            <AlertTriangle size={15} className="text-[#F87171] shrink-0 mt-0.5" />
            <span>{errorText}</span>
          </div>
        )}

        {/* STEP 1: GAME PASSWORD PROMPT */}
        {step === 'password' && (
          <form onSubmit={handleVerifyPassword} className="mt-3.5 flex flex-col">
            <label
              htmlFor="gift-game-password"
              className="text-[12px] font-semibold text-[#E2E8F0] flex items-center gap-1.5"
            >
              <Lock size={13} className="text-[#38BDF8]" />
              <span>Enter Game Password</span>
            </label>
            <p className="text-[11px] text-[#94A3B8] mt-0.5 mb-2">
              Confirm your Game Password before sending this gift to{' '}
              {targetRecipient.name}.
            </p>

            <div className="relative flex items-center">
              <input
                id="gift-game-password"
                type={showPassword ? 'text' : 'password'}
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Enter Game Password"
                autoComplete="off"
                autoFocus
                className="w-full h-[44px] rounded-[10px] bg-[#000000] border border-[#334155] focus:border-[#38BDF8] focus:outline-none px-3.5 pr-11 text-[14px] text-[#F8FAFC] placeholder-[#64748B]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-1.5 w-9 h-9 flex items-center justify-center text-[#94A3B8] hover:text-white cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#94A3B8] tabular-nums">
              <span>Your Wallet Balance:</span>
              <span className="text-[#CBD5E1] font-semibold">
                🪙 {walletGold.toLocaleString('en-US')} · 💎{' '}
                {walletGems.toLocaleString('en-US')}
              </span>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-[44px] px-4 rounded-[10px] bg-[#1E293B] border border-[#334155] text-[#CBD5E1] text-[12px] font-semibold cursor-pointer slot-tap-feedback whitespace-nowrap"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isBusy}
                className="flex-1 h-[44px] rounded-[10px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[13px] font-bold flex items-center justify-center gap-1.5 cursor-pointer slot-tap-feedback whitespace-nowrap"
              >
                <Lock size={14} />
                <span>{isBusy ? 'Verifying...' : 'Confirm Password'}</span>
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: OPTIONAL MESSAGE BOX & "NOW SEND GIFT" */}
        {step === 'message' && (
          <div className="mt-3.5 flex flex-col">
            <div className="flex items-center justify-between text-[11px] mb-2">
              <span className="text-[#34D399] font-semibold flex items-center gap-1">
                <Check size={13} /> Password Verified
              </span>
              <span className="text-[#94A3B8] tabular-nums">
                {messageInput.length}/240
              </span>
            </div>

            <label
              htmlFor="gift-custom-message"
              className="text-[12px] font-semibold text-[#E2E8F0] mb-1.5"
            >
              Personal Message for {targetRecipient.name} (Optional)
            </label>

            <textarea
              id="gift-custom-message"
              rows={3}
              maxLength={240}
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder="Write a personal note to attach with your gift (optional)..."
              autoFocus
              className="w-full rounded-[10px] bg-[#000000] border border-[#334155] focus:border-[#38BDF8] focus:outline-none p-3 text-[13px] text-[#F8FAFC] placeholder-[#64748B] resize-none leading-relaxed"
            />

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => {
                  setErrorText(null);
                  setStep('password');
                }}
                className="h-[46px] px-3.5 rounded-[10px] bg-[#1E293B] border border-[#334155] text-[#CBD5E1] text-[12px] font-semibold cursor-pointer slot-tap-feedback whitespace-nowrap"
              >
                Back
              </button>

              <button
                type="button"
                disabled={isBusy}
                onClick={() => {
                  void handleNowSendGift();
                }}
                className="flex-1 h-[46px] rounded-[10px] bg-[#E11D48] hover:bg-[#BE123C] text-white text-[13px] font-bold flex items-center justify-center gap-2 cursor-pointer slot-tap-feedback whitespace-nowrap"
              >
                <Send size={15} />
                <span>{isBusy ? 'Sending Gift...' : 'Now Send Gift'}</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: TRANSACTION SUCCESS RECEIPT */}
        {step === 'sent' && (
          <div className="mt-4 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-[#064E3B] border border-[#10B981] flex items-center justify-center text-[#34D399]">
              <Check size={22} />
            </div>

            <h3 className="mt-2.5 text-[16px] font-bold text-[#F8FAFC]">
              Gift Sent to {targetRecipient.name}!
            </h3>
            <p className="mt-1 text-[12px] text-[#94A3B8] leading-relaxed">
              {item.itemName} has been delivered (Recipient Slot #{sentSlotNumber}, +
              {item.giftPoints.toLocaleString('en-US')} GP) and logged in your Sent History.
            </p>

            {messageInput.trim() && (
              <div className="mt-2.5 w-full rounded-[10px] bg-[#111827] border border-[#1E293B] px-3 py-2 text-[12px] text-[#CBD5E1] italic">
                &ldquo;{messageInput.trim()}&rdquo;
              </div>
            )}

            <div className="mt-4 w-full flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-[44px] rounded-[10px] bg-[#1E293B] border border-[#334155] text-[#E2E8F0] text-[12px] font-semibold cursor-pointer slot-tap-feedback whitespace-nowrap"
              >
                Done
              </button>

              {onOpenSentHistory && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSentHistory();
                  }}
                  className="flex-1 h-[44px] rounded-[10px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[12px] font-bold flex items-center justify-center gap-1.5 cursor-pointer slot-tap-feedback whitespace-nowrap"
                >
                  <Gift size={14} />
                  <span>View Sent History</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SendGiftFlowModal;
