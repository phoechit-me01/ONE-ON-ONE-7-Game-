import React, { useState, useEffect, useMemo } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  Gift,
  Send,
  ShoppingBag,
  Check,
  X,
  Lock,
} from 'lucide-react';
import {
  db,
  auth,
  resolveActiveUserId,
  resolveDisplayNameFromUser,
  SESSION_CHANGE_EVENT,
} from '../firebase';
import {
  GIFT_MATRIX_SLOT_COUNT,
  OwnedGiftDocument,
  SentGiftDocument,
  UserGiftRootFields,
  subscribeToOwnedGifts,
  subscribeToSentGiftsHistory,
  formatGiftPriceLabel,
} from '../services/giftService';
import { GiftAssetView } from './GiftAssetView';
import {
  OwnedGiftDetailModal,
  GiftDetailModalSubject,
} from './OwnedGiftDetailModal';

export type GiftScreenSection = 'received' | 'sent';

export interface OwnedGiftsScreenProps {
  onOpenGiftShop: () => void;
  initialSection?: GiftScreenSection;
}

const DEFAULT_METRICS: UserGiftRootFields = {
  gold: 0,
  gems: 0,
  totalGiftPoints: 0,
  receivedGiftsCount: 0,
};

function formatCompactSentDate(millis: number): string {
  if (!millis || isNaN(millis)) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(new Date(millis));
  } catch {
    return '';
  }
}

/**
 * Strictly Isolated Player Gift Vault & Sent History Screen:
 * 1. Strict Account Isolation: Displays ONLY the logged-in user's own inventory (`users/{activeUserId}/ownedGifts`)
 *    and their own dispatched logs (`users/{activeUserId}/sentGifts`). Zero cross-account vault viewing or mixing.
 * 2. Clean Section Tabs:
 *    - "Received Gifts": 110-slot sequential inventory held by the logged-in user with 75% resale options.
 *    - "Sent History": Read-only log of gifts dispatched by the logged-in user (resale strictly disabled).
 * 3. Top GP & Slot Summary: Displays total accumulated Gift Points (GP) prominently at the top and visually
 *    contrasts filled gift slots against empty slots across all 110 positions.
 */
export const OwnedGiftsScreen: React.FC<OwnedGiftsScreenProps> = ({
  onOpenGiftShop,
  initialSection = 'received',
}) => {
  const [activeUserId, setActiveUserId] = useState<string>(() =>
    resolveActiveUserId(auth.currentUser)
  );
  const [displayName, setDisplayName] = useState<string>(() =>
    resolveDisplayNameFromUser(auth.currentUser)
  );
  const [activeSection, setActiveSection] =
    useState<GiftScreenSection>(initialSection);

  const [userMetrics, setUserMetrics] =
    useState<UserGiftRootFields>(DEFAULT_METRICS);
  const [receivedGifts, setReceivedGifts] = useState<OwnedGiftDocument[]>([]);
  const [sentGifts, setSentGifts] = useState<SentGiftDocument[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [modalSubject, setModalSubject] =
    useState<GiftDetailModalSubject | null>(null);
  const [noticeBanner, setNoticeBanner] = useState<string | null>(null);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  // Strict Single-Account Real-Time Subscriptions for the Logged-In User ONLY
  useEffect(() => {
    let unsubUserDoc: (() => void) | null = null;
    let unsubOwned: (() => void) | null = null;
    let unsubSent: (() => void) | null = null;

    const cleanupDataListeners = () => {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }
      if (unsubOwned) {
        unsubOwned();
        unsubOwned = null;
      }
      if (unsubSent) {
        unsubSent();
        unsubSent = null;
      }
    };

    const bindUserGiftSubscriptions = (user = auth.currentUser) => {
      cleanupDataListeners();
      setIsLoading(true);
      setModalSubject(null);

      const resolvedUid = resolveActiveUserId(user);
      setActiveUserId(resolvedUid);
      setDisplayName(resolveDisplayNameFromUser(user));

      unsubUserDoc = onSnapshot(
        doc(db, 'users', resolvedUid),
        (snap) => {
          if (snap.exists()) {
            const d = snap.data();
            if (typeof d.username === 'string' && d.username.trim()) {
              setDisplayName(resolveDisplayNameFromUser(user, d.username));
            }
            setUserMetrics({
              gold: Number(d.gold ?? d.wallet?.gold ?? 0) || 0,
              gems: Number(d.gems ?? d.wallet?.gems ?? 0) || 0,
              totalGiftPoints: Math.max(0, Number(d.totalGiftPoints) || 0),
              receivedGiftsCount: Math.max(0, Number(d.receivedGiftsCount) || 0),
            });
          } else {
            setUserMetrics(DEFAULT_METRICS);
          }
        },
        () => {}
      );

      unsubOwned = subscribeToOwnedGifts(
        resolvedUid,
        (gifts) => {
          // Enforce strict recipient isolation filter
          const isolatedOwned = gifts.filter(
            (g) => !g.recipientId || g.recipientId === resolvedUid
          );
          setReceivedGifts(isolatedOwned);
          setIsLoading(false);
        },
        () => {
          setReceivedGifts([]);
          setIsLoading(false);
        }
      );

      unsubSent = subscribeToSentGiftsHistory(
        resolvedUid,
        (records) => {
          setSentGifts(records);
        },
        () => {
          setSentGifts([]);
        }
      );
    };

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      bindUserGiftSubscriptions(user);
    });

    const handleSessionChange = () => {
      bindUserGiftSubscriptions(auth.currentUser);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(SESSION_CHANGE_EVENT, handleSessionChange);
    }

    return () => {
      unsubAuth();
      if (typeof window !== 'undefined') {
        window.removeEventListener(SESSION_CHANGE_EVENT, handleSessionChange);
      }
      cleanupDataListeners();
    };
  }, []);

  // Total Accumulated GP derived accurately from held gifts (synced with root totalGiftPoints)
  const totalAccumulatedGP = useMemo(() => {
    if (receivedGifts.length > 0) {
      return receivedGifts.reduce((sum, item) => sum + (item.giftPoints || 0), 0);
    }
    return userMetrics.totalGiftPoints;
  }, [receivedGifts, userMetrics.totalGiftPoints]);

  const filledSlotsCount = Math.min(GIFT_MATRIX_SLOT_COUNT, receivedGifts.length);
  const emptySlotsCount = Math.max(0, GIFT_MATRIX_SLOT_COUNT - filledSlotsCount);
  const capacityPercent = Math.min(
    100,
    Math.round((filledSlotsCount / GIFT_MATRIX_SLOT_COUNT) * 100)
  );

  // Sequential 110-slot matrix (`0..109` -> `Slot #001..#110`)
  const sequential110Slots = useMemo(() => {
    return Array.from({ length: GIFT_MATRIX_SLOT_COUNT }, (_, idx) => {
      return receivedGifts[idx] || null;
    });
  }, [receivedGifts]);

  const sentTotals = useMemo(() => {
    let totalPointsGifted = 0;
    let goldSpent = 0;
    let gemsSpent = 0;
    for (const s of sentGifts) {
      totalPointsGifted += s.giftPoints || 0;
      if (s.currencyType === 'GEMS') {
        gemsSpent += s.basePrice || 0;
      } else {
        goldSpent += s.basePrice || 0;
      }
    }
    return { totalPointsGifted, goldSpent, gemsSpent };
  }, [sentGifts]);

  const triggerNotice = (msg: string) => {
    setNoticeBanner(msg);
    window.setTimeout(() => {
      setNoticeBanner((prev) => (prev === msg ? null : prev));
    }, 4200);
  };

  return (
    <div className="w-full flex-1 flex flex-col bg-[#0B0F19] text-[#F8FAFC] select-none pb-6">
      {/* Top Sticky Summary & Section Tabs */}
      <div className="px-3.5 pt-3.5 pb-3 border-b border-[#1E293B] bg-[#0F172A] sticky top-[72px] z-30">
        {/* Title Row: Active Logged-In User Vault + Gift Shop CTA */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-[15px] font-bold text-[#F8FAFC] tracking-tight truncate">
              {displayName} · Gift Vault
            </h1>
            <p className="text-[11px] text-[#94A3B8] mt-0.5 truncate">
              Personal Inventory &amp; Dispatched Gift Log
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenGiftShop}
            className="h-[36px] px-3 rounded-[8px] bg-[#E11D48] hover:bg-[#BE123C] text-white text-[11px] font-bold flex items-center gap-1.5 cursor-pointer slot-tap-feedback shrink-0 whitespace-nowrap"
          >
            <ShoppingBag size={13} />
            <span>Gift Shop</span>
          </button>
        </div>

        {/* Prominent Accumulated Gift Points (GP) & Capacity Card */}
        <div className="mt-3 rounded-[12px] bg-[#111827] border border-[#1E293B] p-3">
          <div className="grid grid-cols-3 divide-x divide-[#1E293B] text-center">
            <div className="px-1.5">
              <div className="text-[10px] text-[#94A3B8]">Accumulated GP</div>
              <div className="text-[16px] font-bold text-[#34D399] tabular-nums mt-0.5">
                {totalAccumulatedGP.toLocaleString('en-US')}{' '}
                <span className="text-[11px] font-semibold">GP</span>
              </div>
            </div>

            <div className="px-1.5">
              <div className="text-[10px] text-[#94A3B8]">Filled / Total</div>
              <div className="text-[15px] font-bold text-[#F8FAFC] tabular-nums mt-0.5">
                {filledSlotsCount}
                <span className="text-[11px] font-normal text-[#64748B]">
                  /{GIFT_MATRIX_SLOT_COUNT}
                </span>
              </div>
            </div>

            <div className="px-1.5">
              <div className="text-[10px] text-[#94A3B8]">Gifts Sent</div>
              <div className="text-[15px] font-bold text-[#CBD5E1] tabular-nums mt-0.5">
                {sentGifts.length.toLocaleString('en-US')}
              </div>
            </div>
          </div>

          {/* 110-Slot Capacity Progress Bar */}
          <div className="mt-2.5 pt-2 border-t border-[#1E293B]">
            <div className="flex items-center justify-between text-[10px] text-[#94A3B8] tabular-nums mb-1">
              <span>
                <span className="text-[#38BDF8] font-semibold">
                  {filledSlotsCount} Filled
                </span>{' '}
                · {emptySlotsCount} Empty Slots
              </span>
              <span>{capacityPercent}% Capacity</span>
            </div>
            <div className="w-full h-[5px] rounded-full bg-[#070B12] overflow-hidden">
              <div
                className="h-full bg-[#38BDF8] rounded-full transition-transform duration-200 origin-left"
                style={{
                  transform: `scaleX(${Math.max(
                    filledSlotsCount > 0 ? 0.03 : 0,
                    filledSlotsCount / GIFT_MATRIX_SLOT_COUNT
                  )})`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Clean Section Toggle: "Received Gifts" vs "Sent History" */}
        <div
          role="tablist"
          aria-label="Gift Vault Sections"
          className="mt-2.5 grid grid-cols-2 gap-1.5 p-1 rounded-[10px] bg-[#1E293B]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'received'}
            onClick={() => setActiveSection('received')}
            className={`h-[38px] rounded-[7px] px-2 text-[11.5px] font-bold flex items-center justify-center gap-1.5 cursor-pointer slot-tap-feedback whitespace-nowrap tabular-nums ${
              activeSection === 'received'
                ? 'bg-[#2563EB] text-white'
                : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            <Gift size={13} />
            <span>
              Received Gifts ({filledSlotsCount}/{GIFT_MATRIX_SLOT_COUNT})
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'sent'}
            onClick={() => setActiveSection('sent')}
            className={`h-[38px] rounded-[7px] px-2 text-[11.5px] font-bold flex items-center justify-center gap-1.5 cursor-pointer slot-tap-feedback whitespace-nowrap tabular-nums ${
              activeSection === 'sent'
                ? 'bg-[#2563EB] text-white'
                : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            <Send size={13} />
            <span>Sent History ({sentGifts.length})</span>
          </button>
        </div>

        {/* Resale / Transaction Feedback Banner */}
        {noticeBanner && (
          <div
            role="status"
            className="mt-2.5 px-3 py-2 rounded-[10px] bg-[#064E3B] border border-[#10B981] text-[#6EE7B7] text-[11px] font-semibold flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Check size={14} className="shrink-0 text-[#34D399]" />
              <span className="leading-snug">{noticeBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setNoticeBanner(null)}
              className="p-0.5 text-current opacity-80 hover:opacity-100 cursor-pointer shrink-0"
              aria-label="Dismiss notification"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>

      {/* ====================================================================
          SECTION 1: RECEIVED GIFTS (110-Slot Matrix — Recipient Resale Active)
         ==================================================================== */}
      {activeSection === 'received' && (
        <div className="p-2.5 flex flex-col">
          {/* Slot Visual Legend */}
          <div className="px-1 pb-2 flex items-center justify-between text-[10.5px] text-[#94A3B8] tabular-nums">
            <span>
              110-Slot Vault · Tap <strong className="text-[#E2E8F0]">See More</strong> to inspect or resell (75%)
            </span>
            <span className="shrink-0 ml-2">
              <span className="text-[#38BDF8] font-semibold">{filledSlotsCount}</span>{' '}
              Filled
            </span>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-[10px] bg-[#111827] border border-[#1E293B] p-1.5 flex flex-col"
                >
                  <div className="w-full aspect-square rounded-[8px] bg-[#000000]" />
                  <div className="h-3 bg-[#1E293B] rounded mt-1.5 w-4/5" />
                  <div className="h-5 bg-[#1E293B] rounded mt-1.5 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {sequential110Slots.map((gift, idx) => {
                const slotNumber = idx + 1;
                const slotLabel = `#${String(slotNumber).padStart(3, '0')}`;

                if (gift) {
                  // FILLED GIFT SLOT: High-contrast illuminated card + See More CTA
                  return (
                    <div
                      key={gift.giftDocId}
                      className="rounded-[10px] bg-[#131D31] border border-[#38BDF8]/70 hover:border-[#38BDF8] p-1.5 flex flex-col items-center text-center"
                    >
                      <div className="w-full flex items-center justify-between text-[8.5px] mb-1 tabular-nums">
                        <span className="font-mono font-bold text-[#38BDF8]">
                          {slotLabel}
                        </span>
                        <span className="text-[#E2E8F0] font-medium truncate max-w-[52px]">
                          {gift.tierTitle}
                        </span>
                      </div>

                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          setModalSubject({
                            mode: 'received',
                            gift,
                            slotNumber,
                          })
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setModalSubject({
                              mode: 'received',
                              gift,
                              slotNumber,
                            });
                          }
                        }}
                        className="w-full cursor-pointer focus:outline-none"
                        aria-label={`Inspect ${gift.itemName} in ${slotLabel}`}
                      >
                        <GiftAssetView
                          itemName={gift.itemName}
                          tierTitle={gift.tierTitle}
                          itemAssetUrl={gift.itemAssetUrl}
                          fileId={gift.fileId}
                          size="grid"
                          className="w-full"
                        />
                      </div>

                      <h3
                        className="w-full text-[10px] font-bold text-[#F8FAFC] truncate mt-1.5 leading-tight"
                        title={gift.itemName}
                      >
                        {gift.itemName}
                      </h3>

                      <div className="w-full text-[8.5px] text-[#34D399] font-semibold tabular-nums truncate mt-0.5 leading-tight">
                        +{gift.giftPoints} GP ·{' '}
                        {formatGiftPriceLabel(gift.basePrice, gift.currencyType)}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setModalSubject({
                            mode: 'received',
                            gift,
                            slotNumber,
                          })
                        }
                        className="w-full h-[26px] mt-1.5 rounded-[6px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[10px] font-bold flex items-center justify-center whitespace-nowrap cursor-pointer slot-tap-feedback"
                      >
                        See More
                      </button>
                    </div>
                  );
                }

                // EMPTY VAULT SLOT: Visually recessed dashed frame clearly distinct from filled gifts
                return (
                  <div
                    key={`empty_vault_slot_${slotNumber}`}
                    className="rounded-[10px] bg-[#070B12] border border-dashed border-[#1E293B] p-1.5 flex flex-col items-center text-center"
                    aria-label={`Slot ${slotNumber}: Empty`}
                  >
                    <div className="w-full flex items-center justify-between text-[8.5px] text-[#475569] mb-1 tabular-nums">
                      <span className="font-mono">{slotLabel}</span>
                      <span>Empty</span>
                    </div>

                    <div className="w-full aspect-square rounded-[8px] bg-[#04060A] border border-[#0F172A] flex items-center justify-center">
                      <span className="text-[#334155] text-[16px] leading-none font-normal">
                        +
                      </span>
                    </div>

                    <span className="w-full text-[9px] text-[#475569] truncate mt-1.5 leading-tight tabular-nums">
                      Slot {slotNumber}
                    </span>
                    <span className="w-full text-[8px] text-[#334155] truncate mt-0.5 leading-tight">
                      Unoccupied
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          SECTION 2: SENT HISTORY (Dispatched Gift Log — Resale Strictly Disabled)
         ==================================================================== */}
      {activeSection === 'sent' && (
        <div className="p-2.5 flex flex-col">
          {/* Sent History Policy & Totals Bar */}
          <div className="mb-2.5 rounded-[10px] bg-[#111827] border border-[#1E293B] px-3 py-2 flex items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-1.5 text-[#94A3B8] min-w-0">
              <Lock size={13} className="text-[#64748B] shrink-0" />
              <span className="truncate">
                Dispatched Log · Resale &amp; edits disabled
              </span>
            </div>
            <div className="text-[#CBD5E1] font-semibold tabular-nums shrink-0">
              +{sentTotals.totalPointsGifted.toLocaleString('en-US')} GP Gifted
            </div>
          </div>

          {sentGifts.length === 0 ? (
            <div className="my-6 mx-1 rounded-[14px] bg-[#111827] border border-[#1E293B] px-5 py-8 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-[#1E293B] flex items-center justify-center text-[#94A3B8] mb-3">
                <Send size={20} />
              </div>
              <h2 className="text-[14px] font-bold text-[#F8FAFC]">
                No Sent Gifts Yet
              </h2>
              <p className="text-[12px] text-[#94A3B8] mt-1 max-w-[260px] leading-relaxed">
                Gifts you send from the 110-item Gift Shop will be recorded here
                with recipient details and attached messages.
              </p>
              <button
                type="button"
                onClick={onOpenGiftShop}
                className="mt-4 h-[40px] px-4 rounded-[9px] bg-[#E11D48] hover:bg-[#BE123C] text-white text-[12px] font-bold flex items-center gap-1.5 cursor-pointer slot-tap-feedback whitespace-nowrap"
              >
                <ShoppingBag size={14} />
                <span>Browse Gift Shop</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {sentGifts.map((sentItem, idx) => {
                const dispatchNumber = sentGifts.length - idx;
                return (
                  <div
                    key={sentItem.giftDocId}
                    className="rounded-[10px] bg-[#111827] border border-[#1E293B] hover:border-[#475569] p-1.5 flex flex-col items-center text-center"
                  >
                    <div className="w-full flex items-center justify-between text-[8.5px] text-[#94A3B8] mb-1 tabular-nums">
                      <span className="font-mono text-[#F59E0B] font-semibold">
                        #{String(dispatchNumber).padStart(2, '0')}
                      </span>
                      <span className="truncate max-w-[54px]">
                        {formatCompactSentDate(sentItem.sentAtMillis) || 'Sent'}
                      </span>
                    </div>

                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        setModalSubject({
                          mode: 'sent',
                          gift: sentItem,
                          dispatchIndex: dispatchNumber,
                        })
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setModalSubject({
                            mode: 'sent',
                            gift: sentItem,
                            dispatchIndex: dispatchNumber,
                          });
                        }
                      }}
                      className="w-full cursor-pointer focus:outline-none"
                      aria-label={`View sent gift ${sentItem.itemName}`}
                    >
                      <GiftAssetView
                        itemName={sentItem.itemName}
                        tierTitle={sentItem.tierTitle}
                        itemAssetUrl={sentItem.itemAssetUrl}
                        fileId={sentItem.fileId}
                        size="grid"
                        className="w-full"
                      />
                    </div>

                    <h3
                      className="w-full text-[10px] font-bold text-[#F8FAFC] truncate mt-1.5 leading-tight"
                      title={sentItem.itemName}
                    >
                      {sentItem.itemName}
                    </h3>

                    <div
                      className="w-full text-[8.5px] text-[#94A3B8] truncate mt-0.5 leading-tight"
                      title={`To: ${sentItem.recipientName}`}
                    >
                      To: {sentItem.recipientName}
                    </div>

                    <div className="w-full text-[9px] text-[#CBD5E1] font-semibold tabular-nums truncate mt-0.5 leading-tight">
                      {formatGiftPriceLabel(
                        sentItem.basePrice,
                        sentItem.currencyType
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setModalSubject({
                          mode: 'sent',
                          gift: sentItem,
                          dispatchIndex: dispatchNumber,
                        })
                      }
                      className="w-full h-[25px] mt-1.5 rounded-[6px] bg-[#1E293B] hover:bg-[#334155] border border-[#334155] text-[#CBD5E1] text-[9.5px] font-semibold flex items-center justify-center whitespace-nowrap cursor-pointer slot-tap-feedback"
                    >
                      See More
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Detailed Popup Modal (Recipient Resale in "received" mode / Read-Only in "sent" mode) */}
      <OwnedGiftDetailModal
        subject={modalSubject}
        activeUserId={activeUserId}
        activeUserDisplayName={displayName}
        onClose={() => setModalSubject(null)}
        onResaleComplete={(msg) => triggerNotice(msg)}
      />
    </div>
  );
};

export default OwnedGiftsScreen;
