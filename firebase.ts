import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore, doc, getDocFromServer } from 'firebase/firestore';
import { getAuth, Auth, signOut } from 'firebase/auth';
import { getAnalytics, isSupported, Analytics } from 'firebase/analytics';

/**
 * Firebase project configuration provided for "one-on-one-7-game".
 */
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyA_OneOnOne7Game_DefaultWebApiKey',
  projectId: 'one-on-one-7-game',
  authDomain: 'one-on-one-7-game.firebaseapp.com',
  storageBucket: 'one-on-one-7-game.firebasestorage.app',
  messagingSenderId: '331326093589',
  appId: '1:331326093589:web:fa78034fb6cbc113ac511c',
  measurementId: 'G-31RRYDNY3T',
};

// Initialize or retrieve existing Firebase App instance
export const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore
export const db: Firestore = getFirestore(app);

// Initialize Auth
export const auth: Auth = getAuth(app);

export const ACTIVE_USER_STORAGE_KEY = 'one_on_one_active_user_id';
export const SIGNED_OUT_STORAGE_KEY = 'one_on_one_signed_out';
export const SESSION_CHANGE_EVENT = 'one-on-one-session-change';

// Validate connection to Firestore on boot
if (typeof window !== 'undefined') {
  getDocFromServer(doc(db, 'levels_master', 'level_1')).catch((error: unknown) => {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  });
}

/**
 * Returns true if the user has explicitly signed out and has not yet signed back in.
 */
export function isPlayerSessionSignedOut(): boolean {
  try {
    return localStorage.getItem(SIGNED_OUT_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Persists the active player session (`user_phoe_chit` or `user_tin_moe_hlaing`),
 * clears any signed-out flag, and broadcasts a session change event across hooks.
 */
export function setActivePlayerSession(
  userId: 'user_phoe_chit' | 'user_tin_moe_hlaing'
): void {
  try {
    localStorage.setItem(ACTIVE_USER_STORAGE_KEY, userId);
    localStorage.removeItem(SIGNED_OUT_STORAGE_KEY);
  } catch {
    // Ignore storage access errors
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(SESSION_CHANGE_EVENT, {
        detail: { signedOut: false, userId },
      })
    );
  }
}

/**
 * Safely clears the current Firebase Auth session and active local player context,
 * returning the application to a clean login / account-selection state.
 */
export async function signOutPlayerSession(): Promise<void> {
  try {
    await signOut(auth);
  } catch {
    // Continue clearing local session even if no Firebase Auth user was active
  }
  try {
    localStorage.removeItem(ACTIVE_USER_STORAGE_KEY);
    localStorage.setItem(SIGNED_OUT_STORAGE_KEY, 'true');
  } catch {
    // Ignore storage access errors
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(SESSION_CHANGE_EVENT, {
        detail: { signedOut: true, userId: null },
      })
    );
  }
}

/**
 * Resolves the registered account email for a canonical player ID.
 */
export function resolveEmailForUserId(userId: string): string {
  if (userId === 'user_tin_moe_hlaing') {
    return 'tinmoeh09@gmail.com';
  }
  return 'mgphoechit770@gmail.com';
}

/**
 * Resolves the canonical Firestore document ID in `/users/{userId}`
 * for the active player session.
 */
export function resolveActiveUserId(
  user?: { uid?: string; email?: string | null } | null
): string {
  const cleanEmail = user?.email?.toLowerCase().trim();
  if (cleanEmail === 'mgphoechit770@gmail.com') {
    return 'user_phoe_chit';
  }
  if (cleanEmail === 'tinmoeh09@gmail.com') {
    return 'user_tin_moe_hlaing';
  }
  try {
    const savedId = localStorage.getItem(ACTIVE_USER_STORAGE_KEY);
    if (savedId === 'user_phoe_chit' || savedId === 'user_tin_moe_hlaing') {
      return savedId;
    }
  } catch {
    // Ignore storage access errors
  }
  return 'user_phoe_chit';
}

/**
 * Resolves the display name for the active player.
 */
export function resolveDisplayNameFromUser(
  user?: { email?: string | null } | null,
  dbUsername?: string | null
): string {
  if (dbUsername && dbUsername.trim()) {
    return dbUsername.trim();
  }
  const activeId = resolveActiveUserId(user);
  if (activeId === 'user_tin_moe_hlaing') {
    return 'Tin Moe Hlaing';
  }
  return 'PHOE CHIT';
}

/**
 * Resolves the partner's Firestore document ID and display name.
 */
export function resolvePartnerInfo(
  user?: { uid?: string; email?: string | null } | null
): { partnerId: string; partnerName: string } {
  const activeId = resolveActiveUserId(user);
  if (activeId === 'user_tin_moe_hlaing') {
    return { partnerId: 'user_phoe_chit', partnerName: 'PHOE CHIT' };
  }
  return { partnerId: 'user_tin_moe_hlaing', partnerName: 'Tin Moe Hlaing' };
}

// Initialize Analytics conditionally where environment supports it and a valid API key is present
let analyticsInstance: Analytics | null = null;
export const getFirebaseAnalytics = async (): Promise<Analytics | null> => {
  if (analyticsInstance) {
    return analyticsInstance;
  }

  // Only initialize analytics if a genuine, user-provided API key is present
  const configuredApiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const isRealApiKey =
    Boolean(configuredApiKey) &&
    !configuredApiKey.includes('Placeholder') &&
    !configuredApiKey.includes('DefaultWebApiKey');

  if (!isRealApiKey) {
    return null;
  }

  try {
    const supported = await isSupported();
    if (supported) {
      analyticsInstance = getAnalytics(app);
      return analyticsInstance;
    }
  } catch (err) {
    console.warn('Firebase Analytics initialization skipped:', err);
  }
  return null;
};

// Initialize Analytics safely only if a valid API key is provided
if (typeof window !== 'undefined' && import.meta.env.VITE_FIREBASE_API_KEY) {
  getFirebaseAnalytics().catch(() => {
    // Graceful fallback for non-browser or unsupported environments
  });
}

// Error handling types and utility for Firestore operations
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default app;
