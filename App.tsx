/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  auth,
  db,
  resolveActiveUserId,
  isPlayerSessionSignedOut,
  signOutPlayerSession,
  SESSION_CHANGE_EVENT,
} from './firebase';
import { MobileContainer } from './components/MobileContainer';
import { TopHeader } from './components/TopHeader';
import { HomeScreen } from './components/HomeScreen';
import { LevelMapScreen } from './components/LevelMapScreen';
import { GameScreen } from './components/GameScreen';
import { ShopScreen } from './components/ShopScreen';
import { VaultScreen } from './components/VaultScreen';
import { LeaderboardScreen } from './components/LeaderboardScreen';
import {
  OwnedGiftsScreen,
  GiftScreenSection,
} from './components/OwnedGiftsScreen';
import { BottomNavBar, NavTab } from './components/BottomNavBar';
import { EmptyTabPlaceholder } from './components/EmptyTabPlaceholder';
import { UserAccountModal } from './components/UserAccountModal';
import { LoginScreen } from './components/LoginScreen';
import { ensureCorePlayersGiftFieldsInitialized } from './services/giftService';

function readStoredUnlockedLevelForUser(userId: string): number {
  try {
    const saved = localStorage.getItem(`one_on_one_unlocked_level_${userId}`);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= 1) {
        return parsed;
      }
    }
  } catch {
    // Safe fallback
  }
  return 1;
}

export default function App() {
  const [isSignedOut, setIsSignedOut] = useState<boolean>(() =>
    isPlayerSessionSignedOut()
  );
  const [isAccountModalOpen, setIsAccountModalOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [shopInitialView, setShopInitialView] = useState<'prestige' | 'gift'>('prestige');
  const [giftInitialSection, setGiftInitialSection] =
    useState<GiftScreenSection>('received');
  const [isLevelMapOpen, setIsLevelMapOpen] = useState(false);
  const [isPlayingGame, setIsPlayingGame] = useState(false);
  const [playingLevel, setPlayingLevel] = useState<number>(1);
  const [maxUnlockedLevel, setMaxUnlockedLevel] = useState<number>(() => {
    if (isPlayerSessionSignedOut()) return 1;
    const userId = resolveActiveUserId(auth.currentUser);
    return readStoredUnlockedLevelForUser(userId);
  });

  // Ensure root user wallet & gift metric fields (`gold`, `gems`, `totalGiftPoints`, `receivedGiftsCount`) are initialized quietly in background
  useEffect(() => {
    if (!isSignedOut) {
      ensureCorePlayersGiftFieldsInitialized().catch(() => {});
    }
  }, [isSignedOut]);

  // Sync highest unlocked level and session state from Firestore & session events
  useEffect(() => {
    let unsubUser: (() => void) | null = null;

    const syncSessionAndProgress = (user = auth.currentUser) => {
      if (unsubUser) {
        unsubUser();
        unsubUser = null;
      }

      const signedOutNow = isPlayerSessionSignedOut();
      setIsSignedOut(signedOutNow);

      if (signedOutNow) {
        setMaxUnlockedLevel(1);
        return;
      }

      const userId = resolveActiveUserId(user);
      setMaxUnlockedLevel(readStoredUnlockedLevelForUser(userId));
      ensureCorePlayersGiftFieldsInitialized().catch(() => {});

      const userDocRef = doc(db, 'users', userId);
      unsubUser = onSnapshot(
        userDocRef,
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            const highest = Number(
              data.unlocked_level || data.highest_level_unlocked || 1
            );
            if (!isNaN(highest) && highest >= 1) {
              setMaxUnlockedLevel(highest);
              try {
                localStorage.setItem(
                  `one_on_one_unlocked_level_${userId}`,
                  String(highest)
                );
              } catch {
                // Safe fallback
              }
            }
          }
        },
        () => {}
      );
    };

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      syncSessionAndProgress(user);
    });

    const handleSessionChange = () => {
      syncSessionAndProgress(auth.currentUser);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(SESSION_CHANGE_EVENT, handleSessionChange);
    }

    return () => {
      unsubAuth();
      if (typeof window !== 'undefined') {
        window.removeEventListener(SESSION_CHANGE_EVENT, handleSessionChange);
      }
      if (unsubUser) unsubUser();
    };
  }, []);

  const handleOpenProfileAccount = () => {
    setIsAccountModalOpen(true);
  };

  const handleSignOut = async () => {
    await signOutPlayerSession();
    setIsAccountModalOpen(false);
    setActiveTab('home');
    setIsLevelMapOpen(false);
    setIsPlayingGame(false);
    setMaxUnlockedLevel(1);
    setIsSignedOut(true);
  };

  const handleLoginSuccess = (
    loggedInUserId: 'user_phoe_chit' | 'user_tin_moe_hlaing'
  ) => {
    setIsAccountModalOpen(false);
    setActiveTab('home');
    setIsLevelMapOpen(false);
    setIsPlayingGame(false);
    setMaxUnlockedLevel(readStoredUnlockedLevelForUser(loggedInUserId));
    setIsSignedOut(false);
  };

  const handleTabChange = (tab: NavTab) => {
    if (tab === 'shop') {
      setShopInitialView('prestige');
    }
    if (tab === 'gift') {
      setGiftInitialSection('received');
    }
    setActiveTab(tab);
    setIsLevelMapOpen(false);
    setIsPlayingGame(false);
  };

  const handleOpenGiftCatalogInShop = () => {
    setShopInitialView('gift');
    setActiveTab('shop');
    setIsLevelMapOpen(false);
    setIsPlayingGame(false);
  };

  const handleOpenMyOwnedGifts = () => {
    setGiftInitialSection('received');
    setActiveTab('gift');
    setIsLevelMapOpen(false);
    setIsPlayingGame(false);
  };

  const handleOpenMySentHistory = () => {
    setGiftInitialSection('sent');
    setActiveTab('gift');
    setIsLevelMapOpen(false);
    setIsPlayingGame(false);
  };

  const handleOpenLevelMap = () => {
    setActiveTab('home');
    setIsLevelMapOpen(true);
    setIsPlayingGame(false);
  };

  const handleBackToHome = () => {
    setIsLevelMapOpen(false);
    setIsPlayingGame(false);
  };

  const handleStartLevel = (levelToPlay: number) => {
    setPlayingLevel(levelToPlay);
    setIsPlayingGame(true);
  };

  const handleExitGame = () => {
    setIsPlayingGame(false);
    setIsLevelMapOpen(true);
  };

  const handleLevelUnlocked = (nextLevel: number) => {
    const userId = resolveActiveUserId(auth.currentUser);
    setMaxUnlockedLevel((prev) => {
      const nextVal = Math.max(prev, nextLevel);
      try {
        localStorage.setItem(`one_on_one_unlocked_level_${userId}`, String(nextVal));
      } catch {
        // Safe fallback
      }
      return nextVal;
    });
  };

  // Clean Login / Account-Selection State when signed out
  if (isSignedOut) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  // If active in GameScreen (Section 3 & 4), render the 100vh pure black gameplay screen
  if (isPlayingGame) {
    return (
      <GameScreen
        level={playingLevel}
        onExitGame={handleExitGame}
        onLevelUnlocked={handleLevelUnlocked}
      />
    );
  }

  return (
    <MobileContainer>
      {/* Main View Area */}
      {activeTab === 'home' ? (
        isLevelMapOpen ? (
          <LevelMapScreen
            onBackToHome={handleBackToHome}
            onStartLevel={handleStartLevel}
            unlockedLevel={maxUnlockedLevel}
          />
        ) : (
          <div className="w-full flex-1 flex flex-col overflow-y-auto">
            <TopHeader
              onProfileClick={handleOpenProfileAccount}
              onShopClick={() => handleTabChange('shop')}
            />
            <HomeScreen
              onGoToLevelMap={handleOpenLevelMap}
              onOpenShop={() => handleTabChange('shop')}
              onOpenVault={() => handleTabChange('vault')}
              onOpenAccount={handleOpenProfileAccount}
            />
          </div>
        )
      ) : activeTab === 'shop' ? (
        <div className="w-full flex-1 flex flex-col overflow-y-auto">
          <TopHeader
            onProfileClick={handleOpenProfileAccount}
            onShopClick={() => handleTabChange('shop')}
          />
          <ShopScreen
            initialView={shopInitialView}
            onOpenVault={() => handleTabChange('vault')}
            onOpenOwnedGifts={handleOpenMyOwnedGifts}
            onOpenSentHistory={handleOpenMySentHistory}
          />
        </div>
      ) : activeTab === 'vault' ? (
        <div className="w-full flex-1 flex flex-col overflow-y-auto">
          <TopHeader
            onProfileClick={handleOpenProfileAccount}
            onShopClick={() => handleTabChange('shop')}
          />
          <VaultScreen onOpenShop={() => handleTabChange('shop')} />
        </div>
      ) : activeTab === 'leaderboard' ? (
        <div className="w-full flex-1 flex flex-col overflow-y-auto">
          <TopHeader
            onProfileClick={handleOpenProfileAccount}
            onShopClick={() => handleTabChange('shop')}
          />
          <LeaderboardScreen />
        </div>
      ) : activeTab === 'gift' ? (
        <div className="w-full flex-1 flex flex-col overflow-y-auto">
          <TopHeader
            onProfileClick={handleOpenProfileAccount}
            onShopClick={() => handleTabChange('shop')}
          />
          <OwnedGiftsScreen
            onOpenGiftShop={handleOpenGiftCatalogInShop}
            initialSection={giftInitialSection}
          />
        </div>
      ) : (
        <div className="w-full flex-1 flex flex-col overflow-y-auto">
          <TopHeader
            onProfileClick={handleOpenProfileAccount}
            onShopClick={() => handleTabChange('shop')}
          />
          <EmptyTabPlaceholder
            tab={activeTab}
            onGoHome={() => handleTabChange('home')}
          />
        </div>
      )}

      {/* Bottom Navigation Bar: Positioned at very bottom of 430px frame */}
      <BottomNavBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />

      {/* Clean Dark-Futuristic Player Profile & Account Modal with Sign Out */}
      <UserAccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        onSignOut={handleSignOut}
      />
    </MobileContainer>
  );
}
