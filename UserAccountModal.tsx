import React, { useState, useEffect, useMemo } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { X, LogOut } from 'lucide-react';
import { db, resolveEmailForUserId } from '../firebase';
import {
  useShopAndInventory,
  findEquippedFrameItem,
} from '../data/shopCatalog';
import { ItemAssetView } from './ItemAssetView';

export interface UserAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignOut: () => Promise<void> | void;
}

/**
 * Clean Dark-Futuristic Player Profile & Account Modal
 * - Accessible directly from the TopHeader Profile Avatar / Name (and Home Showcase header)
 *   without cluttering the 5-button main bottom navigation bar.
 * - Displays active player identity (PHOE CHIT or Tin Moe Hlaing), live wallet & progress stats,
 *   and a secure "Sign Out" button that clears the current session and returns to Account Selection / Login.
 */
export const UserAccountModal: React.FC<UserAccountModalProps> = ({
  isOpen,
  onClose,
  onSignOut,
}) => {
  const {
    userId,
    displayName,
    walletGold,
    walletGems,
    ownedItemIds,
    homeSlots,
    vaultSlots,
    catalogMap,
  } = useShopAndInventory();

  const [currentLevel, setCurrentLevel] = useState<number>(1);
  const [totalGiftPoints, setTotalGiftPoints] = useState<number>(0);
  const [isSigningOut, setIsSigningOut] = useState<boolean>(false);

  const equippedFrame = useMemo(
    () => findEquippedFrameItem(homeSlots, vaultSlots, catalogMap),
    [homeSlots, vaultSlots, catalogMap]
  );

  const accountEmail = useMemo(() => resolveEmailForUserId(userId), [userId]);

  useEffect(() => {
    if (!isOpen || !userId) return;
    setIsSigningOut(false);

    const unsub = onSnapshot(
      doc(db, 'users', userId),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setCurrentLevel(
            Math.max(
              1,
              Number(
                data.current_level ||
                  data.unlocked_level ||
                  data.highest_level_unlocked ||
                  1
              ) || 1
            )
          );
          setTotalGiftPoints(Math.max(0, Number(data.totalGiftPoints) || 0));
        } else {
          setCurrentLevel(1);
          setTotalGiftPoints(0);
        }
      },
      () => {}
    );

    return () => unsub();
  }, [isOpen, userId]);

  if (!isOpen) return null;

  const handleSignOutPress = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 select-none"
      onClick={() => {
        if (!isSigningOut) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="player-account-modal-title"
    >
      <div
        className="w-full max-w-[392px] bg-[#0B0F19] border border-[#334155] rounded-[20px] p-5 text-[#F8FAFC] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2
              id="player-account-modal-title"
              className="text-[16px] font-bold text-[#F8FAFC] leading-tight"
            >
              Player Profile
            </h2>
            <p className="text-[12px] text-[#94A3B8] mt-0.5">
              Active account session &amp; security
            </p>
          </div>

          <button
            type="button"
            disabled={isSigningOut}
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] rounded-[10px] border border-[#334155] bg-[#111827] flex items-center justify-center text-[#94A3B8] hover:text-white hover:border-[#475569] transition-colors cursor-pointer shrink-0 disabled:opacity-50"
            aria-label="Close player profile modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Active Player Identity Surface */}
        <div className="w-full rounded-[14px] bg-[#111827] border border-[#1E293B] p-4 flex items-center gap-3.5">
          {equippedFrame ? (
            <div className="relative w-[64px] h-[64px] flex items-center justify-center shrink-0">
              <div className="w-[40px] h-[40px] rounded-full bg-[#1E293B] flex items-center justify-center text-[20px] leading-none">
                <span>👤</span>
              </div>
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
            <div className="w-[56px] h-[56px] rounded-full border-2 border-[#334155] bg-[#1E293B] flex items-center justify-center text-[24px] leading-none shrink-0">
              <span>👤</span>
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-bold text-[#F8FAFC] truncate leading-snug">
              {displayName}
            </div>
            <div className="text-[12px] text-[#94A3B8] truncate mt-0.5">
              {accountEmail}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-[#CBD5E1] tabular-nums mt-1.5">
              <span>Stage {currentLevel}</span>
              <span aria-hidden="true" className="text-[#475569]">
                ·
              </span>
              <span>Active Session</span>
            </div>
          </div>
        </div>

        {/* Live Account Metrics Grid */}
        <div className="grid grid-cols-2 gap-2.5 mt-3.5 tabular-nums">
          <div className="rounded-[12px] bg-[#0F172A] border border-[#1E293B] px-3.5 py-2.5">
            <div className="text-[11px] text-[#94A3B8]">Gold Balance</div>
            <div className="text-[14px] font-bold text-[#F8FAFC] mt-0.5">
              🪙 {walletGold.toLocaleString('en-US')}
            </div>
          </div>

          <div className="rounded-[12px] bg-[#0F172A] border border-[#1E293B] px-3.5 py-2.5">
            <div className="text-[11px] text-[#94A3B8]">Gem Balance</div>
            <div className="text-[14px] font-bold text-[#F8FAFC] mt-0.5">
              💎 {walletGems.toLocaleString('en-US')}
            </div>
          </div>

          <div className="rounded-[12px] bg-[#0F172A] border border-[#1E293B] px-3.5 py-2.5">
            <div className="text-[11px] text-[#94A3B8]">Shop Collection</div>
            <div className="text-[14px] font-bold text-[#F8FAFC] mt-0.5">
              {ownedItemIds.length} / 56 Items
            </div>
          </div>

          <div className="rounded-[12px] bg-[#0F172A] border border-[#1E293B] px-3.5 py-2.5">
            <div className="text-[11px] text-[#94A3B8]">Gift Points</div>
            <div className="text-[14px] font-bold text-[#F8FAFC] mt-0.5">
              {totalGiftPoints.toLocaleString('en-US')} GP
            </div>
          </div>
        </div>

        {/* Divider & Clean Sign Out Action */}
        <div className="border-t border-[#1E293B] mt-4 pt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={isSigningOut}
            onClick={() => {
              void handleSignOutPress();
            }}
            className="w-full min-h-[48px] px-4 py-2.5 rounded-[12px] bg-[#181016] hover:bg-[#2B121B] border border-[#F43F5E]/55 hover:border-[#F43F5E] text-[#FDA4AF] hover:text-[#FFF1F2] text-[14px] font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <LogOut size={17} />
            <span>{isSigningOut ? 'Signing Out...' : 'Sign Out'}</span>
          </button>

          <p className="text-[11px] text-[#64748B] text-center">
            Signs out of {displayName} and returns to account selection.
          </p>
        </div>
      </div>
    </div>
  );
};

export default UserAccountModal;
