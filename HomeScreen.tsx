import React from 'react';
import { LevelMapBanner } from './LevelMapBanner';
import { ShowcaseSlots } from './ShowcaseSlots';

interface HomeScreenProps {
  onGoToLevelMap?: () => void;
  onOpenShop?: () => void;
  onOpenVault?: () => void;
  onOpenAccount?: () => void;
}

/**
 * Home Screen Component
 * Structure directly beneath Top Header:
 * 1. "Go to Level Map" Banner
 * 2. Home Screen Profile Showcase Widget (Profile Picture + 3 horizontal 48x48 slots)
 */
export const HomeScreen: React.FC<HomeScreenProps> = ({
  onGoToLevelMap,
  onOpenShop,
  onOpenVault,
  onOpenAccount,
}) => {
  return (
    <div className="w-full flex-1 flex flex-col pb-6">
      {/* 1. "Go to Level Map" Banner */}
      <LevelMapBanner onGoToLevelMap={onGoToLevelMap} />

      {/* 2. Home Screen Profile Showcase Widget */}
      <ShowcaseSlots
        onOpenShop={onOpenShop}
        onOpenVault={onOpenVault}
        onOpenAccount={onOpenAccount}
      />
    </div>
  );
};

export default HomeScreen;
