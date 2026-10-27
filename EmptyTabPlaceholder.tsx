import React from 'react';
import { NavTab } from './BottomNavBar';
import { ShoppingBag, Archive, Trophy, Gift } from 'lucide-react';

interface EmptyTabPlaceholderProps {
  tab: NavTab;
  onGoHome: () => void;
}

const TAB_METADATA: Record<
  Exclude<NavTab, 'home'>,
  { title: string; subtitle: string; icon: React.ComponentType<{ size?: number; className?: string }> }
> = {
  shop: {
    title: 'Shop',
    subtitle: 'Browse equipment, cosmetics, and currency packs.',
    icon: ShoppingBag,
  },
  vault: {
    title: 'Vault',
    subtitle: 'Manage your stored relics, gear, and items.',
    icon: Archive,
  },
  leaderboard: {
    title: 'Leaderboard',
    subtitle: 'Check top rankings and competitive scores.',
    icon: Trophy,
  },
  gift: {
    title: 'Owned Gifts',
    subtitle: 'Inspect received gifts across all 110 slots.',
    icon: Gift,
  },
};

/**
 * Empty Placeholder View for bottom navigation tabs
 * - Completely static, zero animation
 */
export const EmptyTabPlaceholder: React.FC<EmptyTabPlaceholderProps> = ({
  tab,
  onGoHome,
}) => {
  if (tab === 'home') return null;

  const meta = TAB_METADATA[tab];
  const Icon = meta.icon;

  return (
    <div className="w-full flex-1 flex flex-col items-center justify-center px-6 py-12 text-center select-none">
      <div className="w-16 h-16 rounded-full bg-[#FFFFFF] border border-[#E2E8F0] shadow-[0px_4px_12px_rgba(0,0,0,0.04)] flex items-center justify-center text-[#2563EB] mb-4">
        <Icon size={28} />
      </div>

      <h2 className="text-[20px] font-bold text-[#2C3E50] mb-1">
        {meta.title}
      </h2>

      <p className="text-[13px] text-[#8E9AAF] max-w-[260px] mb-6">
        {meta.subtitle}
      </p>

      <div className="inline-block px-3 py-1 bg-[#F1F5F9] text-[#64748B] text-[11px] font-semibold rounded-full border border-[#E2E8F0] mb-6">
        Empty View Placeholder
      </div>

      <button
        type="button"
        onClick={onGoHome}
        className="px-4 py-2 bg-[#FFFFFF] border border-[#E2E8F0] text-[#2C3E50] text-[12px] font-bold rounded-[8px] shadow-[0px_2px_4px_rgba(0,0,0,0.04)] hover:bg-[#F8FAFC] cursor-pointer"
      >
        Return to Home
      </button>
    </div>
  );
};

export default EmptyTabPlaceholder;
