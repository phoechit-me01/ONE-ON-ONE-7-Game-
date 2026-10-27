import React from 'react';

interface LevelMapBannerProps {
  onGoToLevelMap?: () => void;
}

/**
 * "Go to Level Map" Banner
 * Strict specifications:
 * - Width: 100% with standard 16px horizontal padding
 * - Height: Approx. 110px
 * - Background: Pure White (#FFFFFF) with subtle box shadow (0px 4px 12px rgba(0, 0, 0, 0.05)) and 12px border-radius
 * - Main Title: "CURRENT STAGE: LEVEL 1" (Font Size: 22px, Bold, Color: #2C3E50)
 * - Subtitle: "The First Step" (Font Size: 14px, Color: #8E9AAF)
 * - Action element: Button with text "GO TO LEVEL MAP >" (Background: #2563EB, Text: #FFFFFF, Border-radius: 8px)
 * - STRICT CONSTRAINT: Solely a static trigger, does NOT render any level map lists or quest trees.
 * - Zero animations, completely static and instant.
 */
export const LevelMapBanner: React.FC<LevelMapBannerProps> = ({
  onGoToLevelMap,
}) => {
  return (
    <div className="w-full px-4 pt-4 select-none">
      <div
        role="button"
        tabIndex={0}
        onClick={onGoToLevelMap}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            onGoToLevelMap?.();
          }
        }}
        className="w-full h-[110px] bg-[#FFFFFF] rounded-[12px] px-4 flex items-center justify-between cursor-pointer border border-[#E2E8F0] shadow-[0px_4px_12px_rgba(0,0,0,0.05)] focus:outline-none"
        aria-label="Go to Level Map. Current Stage: Level 1, The First Step"
      >
        {/* Banner Typography */}
        <div className="flex flex-col justify-center pr-2">
          <span className="text-[22px] font-bold text-[#2C3E50] leading-tight">
            Now Start Play
          </span>
          <span className="text-[14px] text-[#8E9AAF] mt-1 font-normal">
            The First Step
          </span>
        </div>

        {/* Action Button */}
        <div className="shrink-0">
          <span className="inline-flex items-center justify-center bg-[#2563EB] text-[#FFFFFF] text-[12px] font-bold px-3.5 py-2.5 rounded-[8px] whitespace-nowrap">
            GO TO LEVEL MAP &gt;
          </span>
        </div>
      </div>
    </div>
  );
};

export default LevelMapBanner;
