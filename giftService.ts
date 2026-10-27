import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  onSnapshot,
  runTransaction,
  Timestamp,
  DocumentData,
  Unsubscribe,
} from 'firebase/firestore';
import {
  db,
  auth,
  resolveActiveUserId,
  resolveDisplayNameFromUser,
  handleFirestoreError,
  OperationType,
} from '../firebase';

/**
 * Total Gift Matrix slot capacity (`slotIndex` valid range: `0` through `109`).
 */
export const GIFT_MATRIX_SLOT_COUNT = 110;
export const GIFT_MIN_SLOT_INDEX = 0;
export const GIFT_MAX_SLOT_INDEX = 109;

/**
 * Standard Resale Economy Constants:
 * - 25% Platform Fee
 * - 75% Net Resale Value credited back to user wallet
 */
export const DEFAULT_PLATFORM_FEE_PERCENT = 25;
export const NET_RESALE_MULTIPLIER = 0.75;

export const CORE_PLAYER_IDS = ['user_phoe_chit', 'user_tin_moe_hlaing'] as const;

export type GiftCurrencyType = 'GOLD' | 'GEMS';

export type GiftVisualTierGroup =
  | 'bronze-silver'
  | 'gold-diamond'
  | 'legendary-max';

export function resolveGiftVisualTierGroup(tierTitle?: string | null): GiftVisualTierGroup {
  const norm = String(tierTitle || '').trim().toLowerCase();
  if (
    norm.includes('legendary') ||
    norm.includes('celestial') ||
    norm.includes('royal') ||
    norm.includes('max') ||
    norm.includes('supreme') ||
    norm.includes('ultimate')
  ) {
    return 'legendary-max';
  }
  if (
    norm.includes('gold') ||
    norm.includes('diamond') ||
    norm.includes('epic') ||
    norm.includes('mythic')
  ) {
    return 'gold-diamond';
  }
  return 'bronze-silver';
}

export function formatGiftPriceLabel(
  amount: number,
  currencyType: GiftCurrencyType
): string {
  const safe = Math.max(0, Math.floor(Number(amount) || 0));
  const icon = currencyType === 'GEMS' ? '💎' : '🪙';
  return `${icon} ${safe.toLocaleString('en-US')}`;
}

export interface UserGiftRootFields {
  gold: number;
  gems: number;
  totalGiftPoints: number;
  receivedGiftsCount: number;
}

/**
 * Schema for documents inside the live Firestore `shopItems` collection (110 items: `ONE_GIFT_001`..`ONE_GIFT_110`).
 */
export interface GiftShopItem {
  itemId: string;
  itemName: string;
  category: string;
  tierTitle: string;
  currencyType: GiftCurrencyType;
  basePrice: number;
  giftPoints: number;
  platformFeePercent: number;
  resaleEligible: boolean;
  animationType: string;
  fileId: string;
  itemAssetUrl: string;
  slotIndex: number; // 0 to 109
  updated_at?: string;
}

/**
 * Schema for documents inside `users/{userId}/ownedGifts/{giftDocId}`.
 * Combines static copy fields from `shopItems` (including `itemAssetUrl`)
 * with P2P transaction metadata (`senderId`, `senderName`, `receivedAt`, `message`, `slotIndex`).
 */
export interface OwnedGiftDocument {
  giftDocId: string;
  // Static copy fields from `shopItems`
  itemId: string;
  itemName: string;
  category: string;
  tierTitle: string;
  currencyType: GiftCurrencyType;
  basePrice: number;
  giftPoints: number;
  platformFeePercent: number;
  resaleEligible: boolean;
  animationType: string;
  fileId: string;
  itemAssetUrl: string;
  // Transaction metadata
  senderId: string;
  senderName: string;
  recipientId: string;
  receivedAt: Timestamp;
  receivedAtMillis: number;
  message: string;
  slotIndex: number; // 0 to 109
  equippedSlot: string | null;
}

/**
 * Immutable Sent Gift History log stored in `users/{senderId}/sentGifts/{giftDocId}`.
 * Resale is strictly disabled on Sent History records (`resaleEligible: false`).
 */
export interface SentGiftDocument {
  giftDocId: string;
  itemId: string;
  itemName: string;
  category: string;
  tierTitle: string;
  currencyType: GiftCurrencyType;
  basePrice: number;
  giftPoints: number;
  fileId: string;
  itemAssetUrl: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  sentAt: Timestamp;
  sentAtMillis: number;
  message: string;
  slotIndex: number;
  resaleEligible: false;
}

export interface GiftResaleBreakdown {
  basePrice: number;
  platformFeePercent: number;
  platformFeeAmount: number;
  netResaleValue: number;
  currencyType: GiftCurrencyType;
}

export interface SendGiftParams {
  senderId: string;
  recipientId: string;
  itemId: string;
  pinOrPassword: string;
  message?: string;
  /** Optional explicit slotIndex (0..109); defaults to next sequential unoccupied slot */
  slotIndex?: number;
}

export interface SendGiftResult {
  ok: boolean;
  code?:
    | 'INVALID_INPUT'
    | 'SELF_GIFT_FORBIDDEN'
    | 'SENDER_NOT_FOUND'
    | 'RECIPIENT_NOT_FOUND'
    | 'ITEM_NOT_FOUND'
    | 'INVALID_PIN'
    | 'INSUFFICIENT_GOLD'
    | 'INSUFFICIENT_GEMS'
    | 'INVALID_SLOT_INDEX'
    | 'TRANSACTION_ERROR';
  error?: string;
  giftDocId?: string;
  slotIndex?: number;
  deductedAmount?: number;
  currencyType?: GiftCurrencyType;
  remainingGold?: number;
  remainingGems?: number;
}

export interface ResellGiftParams {
  userId: string;
  giftDocId: string;
  /** Optional PIN/password confirmation if caller enforces security check on resale */
  pinOrPassword?: string;
}

export interface ResellGiftResult {
  ok: boolean;
  code?:
    | 'INVALID_INPUT'
    | 'UNAUTHORIZED_NOT_RECIPIENT'
    | 'SENDER_CANNOT_RESELL'
    | 'USER_NOT_FOUND'
    | 'GIFT_NOT_FOUND'
    | 'NOT_RESALE_ELIGIBLE'
    | 'INVALID_PIN'
    | 'TRANSACTION_ERROR';
  error?: string;
  giftDocId?: string;
  currencyType?: GiftCurrencyType;
  netRefundAmount?: number;
  platformFeeAmount?: number;
  subtractedGiftPoints?: number;
  updatedGold?: number;
  updatedGems?: number;
  updatedTotalGiftPoints?: number;
  updatedReceivedGiftsCount?: number;
}

function isPermissionDeniedError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('Missing or insufficient permissions') ||
    msg.includes('permission-denied')
  );
}

export function clampGiftSlotIndex(rawSlot: unknown, fallback = 0): number {
  const parsed = Number(rawSlot);
  if (!Number.isFinite(parsed)) {
    return Math.min(GIFT_MAX_SLOT_INDEX, Math.max(GIFT_MIN_SLOT_INDEX, fallback));
  }
  return Math.min(
    GIFT_MAX_SLOT_INDEX,
    Math.max(GIFT_MIN_SLOT_INDEX, Math.trunc(parsed))
  );
}

export function isValidGiftSlotIndex(slotIndex: number): boolean {
  return (
    Number.isInteger(slotIndex) &&
    slotIndex >= GIFT_MIN_SLOT_INDEX &&
    slotIndex <= GIFT_MAX_SLOT_INDEX
  );
}

function resolveNumericBalance(
  primaryRootVal: unknown,
  walletNestedVal: unknown
): number {
  if (typeof primaryRootVal === 'number' && Number.isFinite(primaryRootVal)) {
    return Math.max(0, primaryRootVal);
  }
  const nested = Number(walletNestedVal);
  if (Number.isFinite(nested) && nested >= 0) {
    return nested;
  }
  return 0;
}

function normalizeCurrencyType(raw: unknown): GiftCurrencyType {
  return String(raw || 'GOLD').toUpperCase() === 'GEMS' ? 'GEMS' : 'GOLD';
}

function normalizeTimestamp(raw: unknown): { ts: Timestamp; millis: number } {
  if (raw instanceof Timestamp) {
    return { ts: raw, millis: raw.toMillis() };
  }
  if (
    raw &&
    typeof raw === 'object' &&
    'seconds' in raw &&
    typeof (raw as { seconds: unknown }).seconds === 'number'
  ) {
    const secs = (raw as { seconds: number }).seconds;
    const nanos =
      'nanoseconds' in raw && typeof (raw as { nanoseconds: unknown }).nanoseconds === 'number'
        ? (raw as { nanoseconds: number }).nanoseconds
        : 0;
    const ts = new Timestamp(secs, nanos);
    return { ts, millis: ts.toMillis() };
  }
  if (typeof raw === 'string' || typeof raw === 'number') {
    const parsedDate = new Date(raw);
    if (!isNaN(parsedDate.getTime())) {
      const ts = Timestamp.fromDate(parsedDate);
      return { ts, millis: parsedDate.getTime() };
    }
  }
  const fallbackTs = Timestamp.now();
  return { ts: fallbackTs, millis: fallbackTs.toMillis() };
}

function deriveDefaultSlotIndexFromItemId(itemId: string): number {
  const match = itemId.match(/(\d+)$/);
  if (match?.[1]) {
    const parsed = parseInt(match[1], 10) - 1;
    if (Number.isFinite(parsed)) {
      return clampGiftSlotIndex(parsed, 0);
    }
  }
  return 0;
}

export function normalizeGiftShopItem(
  docId: string,
  data: DocumentData
): GiftShopItem {
  const resolvedId = String(data.itemId || docId);
  const defaultIdx = deriveDefaultSlotIndexFromItemId(resolvedId);
  return {
    itemId: resolvedId,
    itemName: String(data.itemName || 'Mystery Gift'),
    category: String(data.category || 'Special'),
    tierTitle: String(data.tierTitle || 'Rare'),
    currencyType: normalizeCurrencyType(data.currencyType),
    basePrice: Math.max(0, Number(data.basePrice) || 0),
    giftPoints: Math.max(0, Number(data.giftPoints) || 0),
    platformFeePercent:
      typeof data.platformFeePercent === 'number' && data.platformFeePercent >= 0
        ? data.platformFeePercent
        : DEFAULT_PLATFORM_FEE_PERCENT,
    resaleEligible: data.resaleEligible !== false,
    animationType: String(data.animationType || 'shimmer'),
    fileId: String(data.fileId || ''),
    itemAssetUrl: String(data.itemAssetUrl || ''),
    slotIndex:
      data.slotIndex !== undefined && data.slotIndex !== null
        ? clampGiftSlotIndex(data.slotIndex, defaultIdx)
        : defaultIdx,
    updated_at: typeof data.updated_at === 'string' ? data.updated_at : undefined,
  };
}

export function normalizeOwnedGiftDocument(
  docId: string,
  data: DocumentData,
  fallbackRecipientId = ''
): OwnedGiftDocument {
  const { ts, millis } = normalizeTimestamp(data.receivedAt);
  return {
    giftDocId: docId,
    itemId: String(data.itemId || ''),
    itemName: String(data.itemName || 'Gift Item'),
    category: String(data.category || 'Special'),
    tierTitle: String(data.tierTitle || 'Rare'),
    currencyType: normalizeCurrencyType(data.currencyType),
    basePrice: Math.max(0, Number(data.basePrice) || 0),
    giftPoints: Math.max(0, Number(data.giftPoints) || 0),
    platformFeePercent:
      typeof data.platformFeePercent === 'number' && data.platformFeePercent >= 0
        ? data.platformFeePercent
        : DEFAULT_PLATFORM_FEE_PERCENT,
    resaleEligible: data.resaleEligible !== false,
    animationType: String(data.animationType || 'shimmer'),
    fileId: String(data.fileId || ''),
    itemAssetUrl: String(data.itemAssetUrl || ''),
    senderId: String(data.senderId || ''),
    senderName: String(data.senderName || 'Unknown Sender'),
    recipientId: String(data.recipientId || fallbackRecipientId),
    receivedAt: ts,
    receivedAtMillis: millis,
    message: typeof data.message === 'string' ? data.message : '',
    slotIndex: clampGiftSlotIndex(data.slotIndex, 0),
    equippedSlot: typeof data.equippedSlot === 'string' ? data.equippedSlot : null,
  };
}

export function normalizeSentGiftDocument(
  docId: string,
  data: DocumentData,
  fallbackSenderId = ''
): SentGiftDocument {
  const { ts, millis } = normalizeTimestamp(data.sentAt ?? data.receivedAt);
  const resolvedRecipientId = String(
    data.recipientId ||
      (fallbackSenderId === 'user_phoe_chit'
        ? 'user_tin_moe_hlaing'
        : 'user_phoe_chit')
  );
  const resolvedRecipientName =
    typeof data.recipientName === 'string' && data.recipientName.trim()
      ? data.recipientName.trim()
      : resolvedRecipientId === 'user_tin_moe_hlaing'
      ? 'Tin Moe Hlaing'
      : 'PHOE CHIT';

  return {
    giftDocId: docId,
    itemId: String(data.itemId || ''),
    itemName: String(data.itemName || 'Gift Item'),
    category: String(data.category || 'Special'),
    tierTitle: String(data.tierTitle || 'Rare'),
    currencyType: normalizeCurrencyType(data.currencyType),
    basePrice: Math.max(0, Number(data.basePrice) || 0),
    giftPoints: Math.max(0, Number(data.giftPoints) || 0),
    fileId: String(data.fileId || ''),
    itemAssetUrl: String(data.itemAssetUrl || ''),
    senderId: String(data.senderId || fallbackSenderId),
    senderName: String(
      data.senderName ||
        (fallbackSenderId === 'user_tin_moe_hlaing'
          ? 'Tin Moe Hlaing'
          : 'PHOE CHIT')
    ),
    recipientId: resolvedRecipientId,
    recipientName: resolvedRecipientName,
    sentAt: ts,
    sentAtMillis: millis,
    message: typeof data.message === 'string' ? data.message : '',
    slotIndex: clampGiftSlotIndex(data.slotIndex, 0),
    resaleEligible: false,
  };
}

/**
 * Calculates the 75% net resale value and 25% platform fee for a gift item.
 */
export function calculateGiftResaleValue(
  basePrice: number,
  currencyType: GiftCurrencyType = 'GOLD',
  platformFeePercent: number = DEFAULT_PLATFORM_FEE_PERCENT
): GiftResaleBreakdown {
  const safeBase = Math.max(0, Math.floor(Number(basePrice) || 0));
  const safeFeePercent = Math.min(
    100,
    Math.max(0, Number.isFinite(platformFeePercent) ? platformFeePercent : DEFAULT_PLATFORM_FEE_PERCENT)
  );
  const netRate = (100 - safeFeePercent) / 100; // 0.75 for 25% fee
  const netResaleValue = Math.max(0, Math.floor(safeBase * netRate));
  const platformFeeAmount = Math.max(0, safeBase - netResaleValue);

  return {
    basePrice: safeBase,
    platformFeePercent: safeFeePercent,
    platformFeeAmount,
    netResaleValue,
    currencyType,
  };
}

/**
 * 1. User Root Document Initialization (`users/{userId}`):
 * Ensures dynamic wallet and metric fields are initialized on `users/{userId}`:
 * - `gold` (Number)
 * - `gems` (Number)
 * - `totalGiftPoints` (Number)
 * - `receivedGiftsCount` (Number)
 * Preserves existing values and keeps nested `wallet.{gold, gems}` synchronized.
 */
export async function initializeUserGiftRootFields(
  userId: string
): Promise<UserGiftRootFields> {
  const path = `users/${userId}`;
  const userRef = doc(db, 'users', userId);

  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      const data = snap.exists() ? snap.data() : {};
      const existingWallet =
        data.wallet && typeof data.wallet === 'object' ? data.wallet : {};

      const resolvedGold = resolveNumericBalance(data.gold, existingWallet.gold);
      const resolvedGems = resolveNumericBalance(data.gems, existingWallet.gems);
      const resolvedGiftPoints =
        typeof data.totalGiftPoints === 'number' && Number.isFinite(data.totalGiftPoints)
          ? Math.max(0, data.totalGiftPoints)
          : 0;
      const resolvedReceivedCount =
        typeof data.receivedGiftsCount === 'number' &&
        Number.isFinite(data.receivedGiftsCount)
          ? Math.max(0, data.receivedGiftsCount)
          : 0;

      const needsWrite =
        !snap.exists() ||
        typeof data.gold !== 'number' ||
        typeof data.gems !== 'number' ||
        typeof data.totalGiftPoints !== 'number' ||
        typeof data.receivedGiftsCount !== 'number' ||
        existingWallet.gold !== resolvedGold ||
        existingWallet.gems !== resolvedGems;

      if (needsWrite) {
        const patch: Record<string, unknown> = {
          gold: resolvedGold,
          gems: resolvedGems,
          totalGiftPoints: resolvedGiftPoints,
          receivedGiftsCount: resolvedReceivedCount,
          wallet: {
            ...existingWallet,
            gold: resolvedGold,
            gems: resolvedGems,
          },
        };
        if (!snap.exists()) {
          patch.username =
            userId === 'user_tin_moe_hlaing'
              ? 'Tin Moe Hlaing'
              : userId === 'user_phoe_chit'
              ? 'PHOE CHIT'
              : resolveDisplayNameFromUser(auth.currentUser);
          patch.pin_code = '1234';
        } else if (
          data.pin_code === undefined &&
          data.password === undefined &&
          data.gamePassword === undefined
        ) {
          patch.pin_code = '1234';
        }
        tx.set(userRef, patch, { merge: true });
      }

      return {
        gold: resolvedGold,
        gems: resolvedGems,
        totalGiftPoints: resolvedGiftPoints,
        receivedGiftsCount: resolvedReceivedCount,
      };
    });
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
    throw error;
  }
}

const initializedPlayerIds = new Set<string>();

/**
 * Ensures both core players (`user_phoe_chit` and `user_tin_moe_hlaing`) and any active
 * authenticated user have `gold`, `gems`, `totalGiftPoints`, and `receivedGiftsCount`
 * initialized in the background without disrupting UI rendering.
 */
export async function ensureCorePlayersGiftFieldsInitialized(): Promise<void> {
  const activeUserId = resolveActiveUserId(auth.currentUser);
  const targetIds = Array.from(new Set([...CORE_PLAYER_IDS, activeUserId])).filter(
    (uid) => !initializedPlayerIds.has(uid)
  );

  if (targetIds.length === 0) return;

  const results = await Promise.allSettled(
    targetIds.map(async (uid) => {
      await initializeUserGiftRootFields(uid);
      initializedPlayerIds.add(uid);
    })
  );

  void results;
}

/**
 * Fetches all 110 Gift items from the Firestore `shopItems` collection sorted sequentially (`ONE_GIFT_001`..`ONE_GIFT_110`).
 */
export async function fetchGiftShopItems(): Promise<GiftShopItem[]> {
  const path = 'shopItems';
  try {
    const snap = await getDocs(collection(db, path));
    const items = snap.docs.map((d) => normalizeGiftShopItem(d.id, d.data()));
    items.sort(
      (a, b) => a.slotIndex - b.slotIndex || a.itemId.localeCompare(b.itemId)
    );
    return items;
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
    throw error;
  }
}

/**
 * Real-time subscription to the 110-item `shopItems` collection.
 */
export function subscribeToGiftShopItems(
  onItems: (items: GiftShopItem[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  const path = 'shopItems';
  return onSnapshot(
    collection(db, path),
    (snap) => {
      const items = snap.docs.map((d) => normalizeGiftShopItem(d.id, d.data()));
      items.sort(
        (a, b) => a.slotIndex - b.slotIndex || a.itemId.localeCompare(b.itemId)
      );
      onItems(items);
    },
    (error) => {
      if (onError) onError(error);
      if (isPermissionDeniedError(error)) {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    }
  );
}

/**
 * Fetches all received gifts in `users/{userId}/ownedGifts` sorted sequentially by arrival order.
 */
export async function fetchOwnedGifts(userId: string): Promise<OwnedGiftDocument[]> {
  const path = `users/${userId}/ownedGifts`;
  try {
    const snap = await getDocs(collection(db, 'users', userId, 'ownedGifts'));
    const gifts = snap.docs.map((d) =>
      normalizeOwnedGiftDocument(d.id, d.data(), userId)
    );
    gifts.sort(
      (a, b) =>
        a.receivedAtMillis - b.receivedAtMillis ||
        a.slotIndex - b.slotIndex ||
        a.giftDocId.localeCompare(b.giftDocId)
    );
    return gifts;
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
    throw error;
  }
}

/**
 * Real-time subscription to `users/{userId}/ownedGifts` sorted sequentially by arrival order.
 */
export function subscribeToOwnedGifts(
  userId: string,
  onGifts: (gifts: OwnedGiftDocument[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  const path = `users/${userId}/ownedGifts`;
  return onSnapshot(
    collection(db, 'users', userId, 'ownedGifts'),
    (snap) => {
      const gifts = snap.docs.map((d) =>
        normalizeOwnedGiftDocument(d.id, d.data(), userId)
      );
      gifts.sort(
        (a, b) =>
          a.receivedAtMillis - b.receivedAtMillis ||
          a.slotIndex - b.slotIndex ||
          a.giftDocId.localeCompare(b.giftDocId)
      );
      onGifts(gifts);
    },
    (error) => {
      if (onError) onError(error);
      if (isPermissionDeniedError(error)) {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    }
  );
}

const backfilledSenderIds = new Set<string>();

/**
 * Ensures any legacy gifts previously dispatched by `senderId` (before `sentGifts` sub-collection existed)
 * are idempotently synced into `users/{senderId}/sentGifts/{giftDocId}` as read-only history logs.
 */
async function backfillLegacySentGiftsForSender(senderId: string): Promise<void> {
  if (!senderId || backfilledSenderIds.has(senderId)) return;
  backfilledSenderIds.add(senderId);

  const partnerId =
    senderId === 'user_phoe_chit' ? 'user_tin_moe_hlaing' : 'user_phoe_chit';
  const partnerName =
    partnerId === 'user_tin_moe_hlaing' ? 'Tin Moe Hlaing' : 'PHOE CHIT';

  try {
    const [existingSentSnap, partnerOwnedSnap] = await Promise.all([
      getDocs(collection(db, 'users', senderId, 'sentGifts')),
      getDocs(collection(db, 'users', partnerId, 'ownedGifts')),
    ]);

    const existingIds = new Set<string>();
    existingSentSnap.forEach((d) => existingIds.add(d.id));

    const writes: Promise<void>[] = [];
    partnerOwnedSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (String(data.senderId || '') === senderId && !existingIds.has(docSnap.id)) {
        const normalized = normalizeSentGiftDocument(docSnap.id, {
          ...data,
          recipientId: data.recipientId || partnerId,
          recipientName: partnerName,
          sentAt: data.receivedAt,
        }, senderId);

        writes.push(
          setDoc(doc(db, 'users', senderId, 'sentGifts', docSnap.id), {
            itemId: normalized.itemId,
            itemName: normalized.itemName,
            category: normalized.category,
            tierTitle: normalized.tierTitle,
            currencyType: normalized.currencyType,
            basePrice: normalized.basePrice,
            giftPoints: normalized.giftPoints,
            fileId: normalized.fileId,
            itemAssetUrl: normalized.itemAssetUrl,
            senderId: normalized.senderId,
            senderName: normalized.senderName,
            recipientId: normalized.recipientId,
            recipientName: normalized.recipientName,
            sentAt: normalized.sentAt,
            message: normalized.message,
            slotIndex: normalized.slotIndex,
            resaleEligible: false,
          })
        );
      }
    });

    if (writes.length > 0) {
      await Promise.allSettled(writes);
    }
  } catch {
    // Non-blocking legacy backfill
  }
}

/**
 * Real-time subscription to the logged-in user's own `users/{senderId}/sentGifts` dispatch history,
 * sorted newest-first. Resale and modifications are strictly disabled on sent records.
 */
export function subscribeToSentGiftsHistory(
  senderId: string,
  onSentGifts: (sentGifts: SentGiftDocument[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  const path = `users/${senderId}/sentGifts`;
  void backfillLegacySentGiftsForSender(senderId);

  return onSnapshot(
    collection(db, 'users', senderId, 'sentGifts'),
    (snap) => {
      const records = snap.docs
        .map((d) => normalizeSentGiftDocument(d.id, d.data(), senderId))
        .filter((rec) => rec.senderId === senderId);
      records.sort(
        (a, b) =>
          b.sentAtMillis - a.sentAtMillis ||
          b.giftDocId.localeCompare(a.giftDocId)
      );
      onSentGifts(records);
    },
    (error) => {
      if (onError) onError(error);
      if (isPermissionDeniedError(error)) {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    }
  );
}

/**
 * Finds the lowest unoccupied sequential slotIndex (0..109) in a recipient's `ownedGifts` sub-collection.
 */
export async function resolveRecipientGiftSlotIndex(
  recipientId: string,
  preferredSlotIndex?: number
): Promise<number> {
  try {
    const snap = await getDocs(collection(db, 'users', recipientId, 'ownedGifts'));
    const occupied = new Set<number>();
    snap.forEach((docSnap) => {
      const idx = Number(docSnap.data()?.slotIndex);
      if (Number.isInteger(idx) && idx >= GIFT_MIN_SLOT_INDEX && idx <= GIFT_MAX_SLOT_INDEX) {
        occupied.add(idx);
      }
    });
    if (
      preferredSlotIndex !== undefined &&
      isValidGiftSlotIndex(preferredSlotIndex) &&
      !occupied.has(preferredSlotIndex)
    ) {
      return preferredSlotIndex;
    }
    for (let i = GIFT_MIN_SLOT_INDEX; i <= GIFT_MAX_SLOT_INDEX; i++) {
      if (!occupied.has(i)) {
        return i;
      }
    }
    return clampGiftSlotIndex(snap.size, 0);
  } catch {
    return preferredSlotIndex !== undefined ? clampGiftSlotIndex(preferredSlotIndex, 0) : 0;
  }
}

function verifyUserSecretPin(userData: DocumentData, providedPin: string): boolean {
  const candidate = String(providedPin ?? '').trim();
  if (!candidate) return false;

  const storedPin =
    userData.pin_code ?? userData.password ?? userData.gamePassword ?? null;
  if (storedPin === null || storedPin === undefined || String(storedPin).trim() === '') {
    return candidate === '1234';
  }
  return candidate === String(storedPin).trim();
}

/**
 * Verifies the sender's Game Password / PIN prior to opening the custom Message Box step.
 */
export async function verifySenderGamePassword(
  senderId: string,
  pinOrPassword: string
): Promise<{ ok: boolean; error?: string }> {
  const cleanSender = String(senderId || '').trim();
  const cleanPin = String(pinOrPassword ?? '').trim();

  if (!cleanSender) {
    return { ok: false, error: 'Active sender profile not found.' };
  }
  if (!cleanPin) {
    return { ok: false, error: 'Please enter your Game Password.' };
  }

  try {
    const snap = await getDoc(doc(db, 'users', cleanSender));
    if (!snap.exists()) {
      return cleanPin === '1234'
        ? { ok: true }
        : { ok: false, error: 'Incorrect Game Password. Please try again.' };
    }
    const isValid = verifyUserSecretPin(snap.data(), cleanPin);
    if (!isValid) {
      return { ok: false, error: 'Incorrect Game Password. Please try again.' };
    }
    return { ok: true };
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      handleFirestoreError(error, OperationType.GET, `users/${cleanSender}`);
    }
    return { ok: false, error: 'Unable to verify password right now. Please try again.' };
  }
}

/**
 * 3A. Secure P2P Gifting Transaction:
 * 1) Verifies sender's Password / PIN (`pin_code` / `password`)
 * 2) Validates & deducts sender's wallet (`gold` or `gems` + nested `wallet`)
 * 3) Creates immutable gift snapshot document in `users/{recipientId}/ownedGifts/{giftDocId}`
 *    containing static `shopItems` fields (including `itemAssetUrl`) + transaction metadata
 *    (`senderId`, `senderName`, `receivedAt` Timestamp, `message`, `slotIndex` 0..109)
 * 4) Atomically increments recipient's `totalGiftPoints` and `receivedGiftsCount`
 */
export async function sendGiftTransaction(
  params: SendGiftParams
): Promise<SendGiftResult> {
  const senderId = String(params.senderId || '').trim();
  const recipientId = String(params.recipientId || '').trim();
  const itemId = String(params.itemId || '').trim();
  const pinOrPassword = String(params.pinOrPassword ?? '').trim();
  const cleanMessage = String(params.message ?? '').trim().slice(0, 500);

  if (!senderId || !recipientId || !itemId) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'Sender, recipient, and gift item ID are required.',
    };
  }

  if (senderId === recipientId) {
    return {
      ok: false,
      code: 'SELF_GIFT_FORBIDDEN',
      error: 'Cannot send a gift to your own account.',
    };
  }

  if (!pinOrPassword) {
    return {
      ok: false,
      code: 'INVALID_PIN',
      error: 'Game PIN / password confirmation is required.',
    };
  }

  if (params.slotIndex !== undefined && !isValidGiftSlotIndex(params.slotIndex)) {
    return {
      ok: false,
      code: 'INVALID_SLOT_INDEX',
      error: 'Gift slotIndex must be an integer between 0 and 109.',
    };
  }

  const sequentialSlotCandidate =
    params.slotIndex !== undefined
      ? clampGiftSlotIndex(params.slotIndex, 0)
      : await resolveRecipientGiftSlotIndex(recipientId);

  const senderRef = doc(db, 'users', senderId);
  const recipientRef = doc(db, 'users', recipientId);
  const shopItemRef = doc(db, 'shopItems', itemId);

  try {
    let createdGiftDocId = '';
    let assignedSlotIndex = sequentialSlotCandidate;
    let deductedAmount = 0;
    let txCurrencyType: GiftCurrencyType = 'GOLD';
    let finalSenderGold = 0;
    let finalSenderGems = 0;

    await runTransaction(db, async (tx) => {
      // --- ALL READS FIRST ---
      const [senderSnap, recipientSnap, itemSnap] = await Promise.all([
        tx.get(senderRef),
        tx.get(recipientRef),
        tx.get(shopItemRef),
      ]);

      if (!senderSnap.exists()) {
        throw new Error('GIFT_TX_ERR:SENDER_NOT_FOUND');
      }
      if (!recipientSnap.exists()) {
        throw new Error('GIFT_TX_ERR:RECIPIENT_NOT_FOUND');
      }
      if (!itemSnap.exists()) {
        throw new Error('GIFT_TX_ERR:ITEM_NOT_FOUND');
      }

      const senderData = senderSnap.data();
      const recipientData = recipientSnap.data();
      const shopItem = normalizeGiftShopItem(itemSnap.id, itemSnap.data());

      // Step 1: Password / PIN Security Check
      if (!verifyUserSecretPin(senderData, pinOrPassword)) {
        throw new Error('GIFT_TX_ERR:INVALID_PIN');
      }

      // Step 2: Validate & Deduct Sender Wallet
      const senderWallet =
        senderData.wallet && typeof senderData.wallet === 'object'
          ? senderData.wallet
          : {};
      const currentSenderGold = resolveNumericBalance(
        senderData.gold,
        senderWallet.gold
      );
      const currentSenderGems = resolveNumericBalance(
        senderData.gems,
        senderWallet.gems
      );

      const price = shopItem.basePrice;
      txCurrencyType = shopItem.currencyType;
      deductedAmount = price;

      let nextSenderGold = currentSenderGold;
      let nextSenderGems = currentSenderGems;

      if (shopItem.currencyType === 'GEMS') {
        if (currentSenderGems < price) {
          throw new Error(
            `GIFT_TX_ERR:INSUFFICIENT_GEMS:${price}:${currentSenderGems}`
          );
        }
        nextSenderGems = currentSenderGems - price;
      } else {
        if (currentSenderGold < price) {
          throw new Error(
            `GIFT_TX_ERR:INSUFFICIENT_GOLD:${price}:${currentSenderGold}`
          );
        }
        nextSenderGold = currentSenderGold - price;
      }

      finalSenderGold = nextSenderGold;
      finalSenderGems = nextSenderGems;

      const senderName =
        typeof senderData.username === 'string' && senderData.username.trim()
          ? senderData.username.trim()
          : senderId === 'user_tin_moe_hlaing'
          ? 'Tin Moe Hlaing'
          : 'PHOE CHIT';

      const recipientName =
        typeof recipientData.username === 'string' && recipientData.username.trim()
          ? recipientData.username.trim()
          : recipientId === 'user_tin_moe_hlaing'
          ? 'Tin Moe Hlaing'
          : 'PHOE CHIT';

      // Step 3: Resolve Sequential Slot Index (0..109), Recipient Vault Doc, & Sender Immutable History Doc
      assignedSlotIndex = clampGiftSlotIndex(sequentialSlotCandidate, 0);

      createdGiftDocId = `GIFT_${Date.now()}_${shopItem.itemId}`;
      const giftDocRef = doc(
        db,
        'users',
        recipientId,
        'ownedGifts',
        createdGiftDocId
      );
      const sentLogRef = doc(
        db,
        'users',
        senderId,
        'sentGifts',
        createdGiftDocId
      );
      const dispatchTimestamp = Timestamp.now();

      const ownedGiftPayload = {
        // Static copy fields from `shopItems`
        itemId: shopItem.itemId,
        itemName: shopItem.itemName,
        category: shopItem.category,
        tierTitle: shopItem.tierTitle,
        currencyType: shopItem.currencyType,
        basePrice: shopItem.basePrice,
        giftPoints: shopItem.giftPoints,
        platformFeePercent: shopItem.platformFeePercent,
        resaleEligible: shopItem.resaleEligible,
        animationType: shopItem.animationType,
        fileId: shopItem.fileId,
        itemAssetUrl: shopItem.itemAssetUrl,
        // Transaction metadata
        senderId,
        senderName,
        recipientId,
        receivedAt: dispatchTimestamp,
        message: cleanMessage,
        slotIndex: assignedSlotIndex,
        equippedSlot: null,
      };

      const sentHistoryPayload = {
        itemId: shopItem.itemId,
        itemName: shopItem.itemName,
        category: shopItem.category,
        tierTitle: shopItem.tierTitle,
        currencyType: shopItem.currencyType,
        basePrice: shopItem.basePrice,
        giftPoints: shopItem.giftPoints,
        fileId: shopItem.fileId,
        itemAssetUrl: shopItem.itemAssetUrl,
        senderId,
        senderName,
        recipientId,
        recipientName,
        sentAt: dispatchTimestamp,
        message: cleanMessage,
        slotIndex: assignedSlotIndex,
        resaleEligible: false,
      };

      // Step 4: Prepare Recipient & Sender Metric Updates
      const recipientWallet =
        recipientData.wallet && typeof recipientData.wallet === 'object'
          ? recipientData.wallet
          : {};
      const recipientGold = resolveNumericBalance(
        recipientData.gold,
        recipientWallet.gold
      );
      const recipientGems = resolveNumericBalance(
        recipientData.gems,
        recipientWallet.gems
      );
      const prevRecipientPoints =
        typeof recipientData.totalGiftPoints === 'number' &&
        Number.isFinite(recipientData.totalGiftPoints)
          ? Math.max(0, recipientData.totalGiftPoints)
          : 0;
      const prevRecipientCount =
        typeof recipientData.receivedGiftsCount === 'number' &&
        Number.isFinite(recipientData.receivedGiftsCount)
          ? Math.max(0, recipientData.receivedGiftsCount)
          : 0;

      const senderTotalPoints =
        typeof senderData.totalGiftPoints === 'number' &&
        Number.isFinite(senderData.totalGiftPoints)
          ? Math.max(0, senderData.totalGiftPoints)
          : 0;
      const senderReceivedCount =
        typeof senderData.receivedGiftsCount === 'number' &&
        Number.isFinite(senderData.receivedGiftsCount)
          ? Math.max(0, senderData.receivedGiftsCount)
          : 0;

      // --- ALL WRITES ---
      tx.set(giftDocRef, ownedGiftPayload);
      tx.set(sentLogRef, sentHistoryPayload);

      tx.set(
        senderRef,
        {
          gold: nextSenderGold,
          gems: nextSenderGems,
          totalGiftPoints: senderTotalPoints,
          receivedGiftsCount: senderReceivedCount,
          wallet: {
            ...senderWallet,
            gold: nextSenderGold,
            gems: nextSenderGems,
          },
          updatedAt: Date.now(),
        },
        { merge: true }
      );

      tx.set(
        recipientRef,
        {
          gold: recipientGold,
          gems: recipientGems,
          totalGiftPoints: prevRecipientPoints + shopItem.giftPoints,
          receivedGiftsCount: prevRecipientCount + 1,
          wallet: {
            ...recipientWallet,
            gold: recipientGold,
            gems: recipientGems,
          },
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    });

    return {
      ok: true,
      giftDocId: createdGiftDocId,
      slotIndex: assignedSlotIndex,
      deductedAmount,
      currencyType: txCurrencyType,
      remainingGold: finalSenderGold,
      remainingGems: finalSenderGems,
    };
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      handleFirestoreError(
        error,
        OperationType.WRITE,
        `users/${recipientId}/ownedGifts`
      );
    }

    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('GIFT_TX_ERR:SENDER_NOT_FOUND')) {
      return { ok: false, code: 'SENDER_NOT_FOUND', error: 'Sender profile not found.' };
    }
    if (msg.includes('GIFT_TX_ERR:RECIPIENT_NOT_FOUND')) {
      return {
        ok: false,
        code: 'RECIPIENT_NOT_FOUND',
        error: 'Recipient profile not found.',
      };
    }
    if (msg.includes('GIFT_TX_ERR:ITEM_NOT_FOUND')) {
      return {
        ok: false,
        code: 'ITEM_NOT_FOUND',
        error: 'Selected gift item does not exist in shopItems.',
      };
    }
    if (msg.includes('GIFT_TX_ERR:INVALID_PIN')) {
      return {
        ok: false,
        code: 'INVALID_PIN',
        error: 'Incorrect game PIN / password.',
      };
    }
    if (msg.includes('GIFT_TX_ERR:INSUFFICIENT_GEMS')) {
      const parts = msg.split(':');
      const req = Number(parts[2] || 0).toLocaleString('en-US');
      const cur = Number(parts[3] || 0).toLocaleString('en-US');
      return {
        ok: false,
        code: 'INSUFFICIENT_GEMS',
        error: `Insufficient Gems! Need 💎 ${req} (Your balance: 💎 ${cur}).`,
      };
    }
    if (msg.includes('GIFT_TX_ERR:INSUFFICIENT_GOLD')) {
      const parts = msg.split(':');
      const req = Number(parts[2] || 0).toLocaleString('en-US');
      const cur = Number(parts[3] || 0).toLocaleString('en-US');
      return {
        ok: false,
        code: 'INSUFFICIENT_GOLD',
        error: `Insufficient Gold! Need 🪙 ${req} (Your balance: 🪙 ${cur}).`,
      };
    }

    return {
      ok: false,
      code: 'TRANSACTION_ERROR',
      error: 'Gift dispatch failed. Please try again.',
    };
  }
}

/**
 * 3B. Resale Economy Transaction:
 * 1) Calculates 75% net resale value (with 25% platform fee)
 * 2) Credits net resale funds back to user wallet (`gold` or `gems` + nested `wallet`)
 * 3) Subtracts the gift's `giftPoints` from `totalGiftPoints` (floored at 0)
 * 4) Decrements `receivedGiftsCount` (floored at 0)
 * 5) Deletes the gift document from `users/{userId}/ownedGifts/{giftDocId}`
 */
export async function resellOwnedGiftTransaction(
  params: ResellGiftParams
): Promise<ResellGiftResult> {
  const userId = String(params.userId || '').trim();
  const giftDocId = String(params.giftDocId || '').trim();
  const activeLoggedInId = resolveActiveUserId(auth.currentUser);

  if (!userId || !giftDocId) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error: 'User ID and gift document ID are required.',
    };
  }

  // Strict Account Isolation & Recipient-Only Resale Gate:
  // Only the logged-in recipient holding the gift in their own `ownedGifts` vault can sell it.
  if (userId !== activeLoggedInId) {
    return {
      ok: false,
      code: 'UNAUTHORIZED_NOT_RECIPIENT',
      error: 'Only the recipient holding this gift in their own vault can sell it.',
    };
  }

  const userRef = doc(db, 'users', userId);
  const giftRef = doc(db, 'users', userId, 'ownedGifts', giftDocId);

  try {
    let currencyType: GiftCurrencyType = 'GOLD';
    let netRefundAmount = 0;
    let platformFeeAmount = 0;
    let subtractedGiftPoints = 0;
    let updatedGold = 0;
    let updatedGems = 0;
    let updatedTotalGiftPoints = 0;
    let updatedReceivedGiftsCount = 0;

    await runTransaction(db, async (tx) => {
      // --- ALL READS FIRST ---
      const [userSnap, giftSnap] = await Promise.all([
        tx.get(userRef),
        tx.get(giftRef),
      ]);

      if (!userSnap.exists()) {
        throw new Error('RESALE_TX_ERR:USER_NOT_FOUND');
      }
      if (!giftSnap.exists()) {
        throw new Error('RESALE_TX_ERR:GIFT_NOT_FOUND');
      }

      const userData = userSnap.data();
      const giftDoc = normalizeOwnedGiftDocument(
        giftSnap.id,
        giftSnap.data(),
        userId
      );

      // Enforce that the sender can NEVER resell or modify a dispatched gift
      if (giftDoc.senderId === userId) {
        throw new Error('RESALE_TX_ERR:SENDER_CANNOT_RESELL');
      }
      if (giftDoc.recipientId && giftDoc.recipientId !== userId) {
        throw new Error('RESALE_TX_ERR:UNAUTHORIZED_NOT_RECIPIENT');
      }

      if (params.pinOrPassword !== undefined) {
        if (!verifyUserSecretPin(userData, params.pinOrPassword)) {
          throw new Error('RESALE_TX_ERR:INVALID_PIN');
        }
      }

      if (!giftDoc.resaleEligible) {
        throw new Error('RESALE_TX_ERR:NOT_RESALE_ELIGIBLE');
      }

      // Enforce 25% platform fee -> 75% net resale value
      const breakdown = calculateGiftResaleValue(
        giftDoc.basePrice,
        giftDoc.currencyType,
        DEFAULT_PLATFORM_FEE_PERCENT
      );

      currencyType = breakdown.currencyType;
      netRefundAmount = breakdown.netResaleValue;
      platformFeeAmount = breakdown.platformFeeAmount;
      subtractedGiftPoints = giftDoc.giftPoints;

      const existingWallet =
        userData.wallet && typeof userData.wallet === 'object'
          ? userData.wallet
          : {};
      const currentGold = resolveNumericBalance(userData.gold, existingWallet.gold);
      const currentGems = resolveNumericBalance(userData.gems, existingWallet.gems);
      const currentGiftPoints =
        typeof userData.totalGiftPoints === 'number' &&
        Number.isFinite(userData.totalGiftPoints)
          ? Math.max(0, userData.totalGiftPoints)
          : 0;
      const currentReceivedCount =
        typeof userData.receivedGiftsCount === 'number' &&
        Number.isFinite(userData.receivedGiftsCount)
          ? Math.max(0, userData.receivedGiftsCount)
          : 0;

      updatedGold =
        currencyType === 'GOLD' ? currentGold + netRefundAmount : currentGold;
      updatedGems =
        currencyType === 'GEMS' ? currentGems + netRefundAmount : currentGems;
      updatedTotalGiftPoints = Math.max(0, currentGiftPoints - giftDoc.giftPoints);
      updatedReceivedGiftsCount = Math.max(0, currentReceivedCount - 1);

      // --- ALL WRITES ---
      tx.set(
        userRef,
        {
          gold: updatedGold,
          gems: updatedGems,
          totalGiftPoints: updatedTotalGiftPoints,
          receivedGiftsCount: updatedReceivedGiftsCount,
          wallet: {
            ...existingWallet,
            gold: updatedGold,
            gems: updatedGems,
          },
          updatedAt: Date.now(),
        },
        { merge: true }
      );

      tx.delete(giftRef);
    });

    return {
      ok: true,
      giftDocId,
      currencyType,
      netRefundAmount,
      platformFeeAmount,
      subtractedGiftPoints,
      updatedGold,
      updatedGems,
      updatedTotalGiftPoints,
      updatedReceivedGiftsCount,
    };
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      handleFirestoreError(
        error,
        OperationType.DELETE,
        `users/${userId}/ownedGifts/${giftDocId}`
      );
    }

    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('RESALE_TX_ERR:SENDER_CANNOT_RESELL')) {
      return {
        ok: false,
        code: 'SENDER_CANNOT_RESELL',
        error: 'Senders cannot resell or modify gifts after dispatch.',
      };
    }
    if (msg.includes('RESALE_TX_ERR:UNAUTHORIZED_NOT_RECIPIENT')) {
      return {
        ok: false,
        code: 'UNAUTHORIZED_NOT_RECIPIENT',
        error: 'Only the recipient holding this gift can resell it.',
      };
    }
    if (msg.includes('RESALE_TX_ERR:USER_NOT_FOUND')) {
      return { ok: false, code: 'USER_NOT_FOUND', error: 'User profile not found.' };
    }
    if (msg.includes('RESALE_TX_ERR:GIFT_NOT_FOUND')) {
      return {
        ok: false,
        code: 'GIFT_NOT_FOUND',
        error: 'Owned gift record no longer exists.',
      };
    }
    if (msg.includes('RESALE_TX_ERR:INVALID_PIN')) {
      return {
        ok: false,
        code: 'INVALID_PIN',
        error: 'Incorrect game PIN / password.',
      };
    }
    if (msg.includes('RESALE_TX_ERR:NOT_RESALE_ELIGIBLE')) {
      return {
        ok: false,
        code: 'NOT_RESALE_ELIGIBLE',
        error: 'This gift item is not eligible for resale.',
      };
    }

    return {
      ok: false,
      code: 'TRANSACTION_ERROR',
      error: 'Unable to complete gift resale. Please try again.',
    };
  }
}

/**
 * Convenience getter for reading a single user's current root gift & wallet metrics.
 */
export async function getUserGiftRootFields(
  userId: string
): Promise<UserGiftRootFields> {
  const path = `users/${userId}`;
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (!snap.exists()) {
      return { gold: 0, gems: 0, totalGiftPoints: 0, receivedGiftsCount: 0 };
    }
    const data = snap.data();
    const wallet = data.wallet && typeof data.wallet === 'object' ? data.wallet : {};
    return {
      gold: resolveNumericBalance(data.gold, wallet.gold),
      gems: resolveNumericBalance(data.gems, wallet.gems),
      totalGiftPoints: Math.max(0, Number(data.totalGiftPoints) || 0),
      receivedGiftsCount: Math.max(0, Number(data.receivedGiftsCount) || 0),
    };
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      handleFirestoreError(error, OperationType.GET, path);
    }
    throw error;
  }
}
