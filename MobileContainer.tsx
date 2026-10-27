import React from 'react';

interface MobileContainerProps {
  children?: React.ReactNode;
}

/**
 * Foundational Root Container adhering to:
 * - Max-width 430px portrait constraint
 * - Mobile-first layout centered on larger viewports
 * - GDD Palette: #FAF8F5 background, #2C3E50 text, #E2E8F0 borders
 * - Hardware safe-area inset support
 * - Clean, static layout ready for upcoming components
 */
export const MobileContainer: React.FC<MobileContainerProps> = ({ children }) => {
  return (
    <div className="min-h-screen w-full flex justify-center items-start bg-[#FAF8F5]">
      <main
        className="w-full max-w-[430px] min-h-screen bg-[#FAF8F5] text-[#2C3E50] flex flex-col relative"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          paddingLeft: 'env(safe-area-inset-left, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
        }}
      >
        {children}
      </main>
    </div>
  );
};

export default MobileContainer;
