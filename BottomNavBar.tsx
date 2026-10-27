import React from 'react';
import { Home, ShoppingBag, Archive, Trophy, Gift } from 'lucide-react';

export type NavTab = 'home' | 'shop' | 'vault' | 'leaderboard' | 'gift';

interface BottomNavBarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
}

interface NavItem {
  id: NavTab;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'shop', label: 'Shop', icon: ShoppingBag },
  { id: 'vault', label: 'Vault', icon: Archive },
  { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { id: 'gift', label: 'Gift', icon: Gift },
];

/**
 * Bottom Navigation Bar
 * - Fixed at bottom of 430px mobile screen
 * - Exactly 5 buttons: Home, Shop, Vault, Leaderboard, Gift
 * - Zero animations, completely static and instant
 */
export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeTab,
  onTabChange,
}) => {
  return (
    <nav
      className="sticky bottom-0 z-40 w-full h-[64px] bg-[#FFFFFF] border-t border-[#E2E8F0] px-2 flex items-center justify-around select-none"
      style={{ boxSizing: 'border-box' }}
      aria-label="Main Navigation"
    >
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onTabChange(item.id)}
            className={`flex-1 h-full flex flex-col items-center justify-center gap-1 cursor-pointer focus:outline-none ${
              isActive ? 'text-[#2C3E50]' : 'text-[#8E9AAF]'
            }`}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon size={20} className={isActive ? 'text-[#2563EB]' : 'text-[#8E9AAF]'} />
            <span
              className={`text-[11px] leading-none ${
                isActive ? 'font-bold text-[#2C3E50]' : 'font-medium text-[#8E9AAF]'
              }`}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};

export default BottomNavBar;
