import React from 'react';
import { Crown, Trophy } from 'lucide-react';
import {
  useHeadToHeadLeaderboard,
  PlayerHeadToHeadStats,
} from '../data/leaderboardSync';
import { ItemAssetView } from './ItemAssetView';

interface PlayerHeaderCardProps {
  player: PlayerHeadToHeadStats;
  isKing: boolean;
  categoryWins: number;
  side: 'left' | 'right';
}

const PlayerHeaderCard: React.FC<PlayerHeaderCardProps> = ({
  player,
  isKing,
  categoryWins,
  side,
}) => {
  return (
    <div
      className={`flex-1 min-w-0 rounded-[14px] p-3 border flex flex-col items-center text-center relative ${
        isKing
          ? 'bg-[#111827] border-[#FBBF24]'
          : 'bg-[#0F172A] border-[#1E293B]'
      }`}
    >
      {/* King Crown Indicator */}
      <div className="h-[18px] flex items-center justify-center mb-1">
        {isKing ? (
          <span className="text-[10px] font-bold text-[#FBBF24] flex items-center gap-1 whitespace-nowrap">
            <Crown size={12} fill="#FBBF24" />
            <span>LEADING</span>
          </span>
        ) : (
          <span className="text-[10px] text-[#64748B] font-medium">
            {side === 'left' ? 'Player 1' : 'Player 2'}
          </span>
        )}
      </div>

      {/* Avatar + Live Equipped Frame from Firestore */}
      {player.equippedFrame ? (
        <div className="relative w-[64px] h-[64px] flex items-center justify-center shrink-0 mb-2">
          <div className="w-[40px] h-[40px] rounded-full bg-[#1E293B] flex items-center justify-center text-[20px] leading-none">
            <span>👤</span>
          </div>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <ItemAssetView
              item={player.equippedFrame}
              size="headerFrame"
              isEquipped={false}
              enableFloat={false}
              enableShimmer={false}
            />
          </div>
        </div>
      ) : (
        <div className="w-[54px] h-[54px] my-[5px] rounded-full border-2 border-[#334155] bg-[#1E293B] flex items-center justify-center text-[22px] leading-none shrink-0 mb-2">
          <span>👤</span>
        </div>
      )}

      {/* Database Username */}
      <h2
        className="w-full text-[13px] font-bold text-[#F8FAFC] truncate leading-snug"
        title={player.username}
      >
        {player.username}
      </h2>

      {/* Live Summary Metadata */}
      <div className="mt-1 text-[10px] text-[#94A3B8] tabular-nums">
        Stage {player.current_level} · {categoryWins}/10 Won
      </div>
    </div>
  );
};

/**
 * GDD Section 7: Strict Firestore Data-Driven Head-to-Head Comparison Leaderboard
 * - Left: Tin Moe Hlaing (`users/user_tin_moe_hlaing`)
 * - Center: "VS" Badge
 * - Right: PHOE CHIT (`users/user_phoe_chit`)
 * - 10 Row-by-Row Live Comparative Metrics (Lifetime & Cumulative, No Deductions)
 * - Objective Winner Declaration Footer ("👑 CURRENT KING: [Name]")
 */
export const LeaderboardScreen: React.FC = () => {
  const {
    leftPlayer,
    rightPlayer,
    rows,
    leftCategoryWins,
    rightCategoryWins,
    overallWinner,
    kingName,
    isLoading,
  } = useHeadToHeadLeaderboard();

  return (
    <div className="w-full flex-1 flex flex-col bg-[#0B0F19] text-[#F8FAFC] select-none pb-6">
      {/* Top Section Title */}
      <div className="px-4 pt-3.5 pb-3 border-b border-[#1E293B] bg-[#0F172A] flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-bold text-[#F8FAFC] tracking-tight flex items-center gap-1.5">
            <Trophy size={15} className="text-[#FBBF24]" />
            <span>Head-to-Head Leaderboard</span>
          </h1>
          <p className="text-[11px] text-[#94A3B8] mt-0.5">
            Live Firestore 1v1 Lifetime Comparison
          </p>
        </div>

        <div className="text-[11px] font-semibold text-[#CBD5E1] tabular-nums">
          {isLoading ? 'Syncing...' : `${leftCategoryWins} – ${rightCategoryWins}`}
        </div>
      </div>

      {/* Side-by-Side Profile Headers: Tin Moe Hlaing (Left) VS PHOE CHIT (Right) */}
      <div className="px-3.5 pt-4 pb-3 flex items-center justify-between gap-2">
        <PlayerHeaderCard
          player={leftPlayer}
          isKing={overallWinner === 'left'}
          categoryWins={leftCategoryWins}
          side="left"
        />

        {/* Center VS Badge */}
        <div className="w-[36px] h-[36px] rounded-[10px] bg-[#1E293B] border border-[#475569] flex items-center justify-center shrink-0">
          <span className="text-[12px] font-black tracking-tight text-[#FBBF24]">
            VS
          </span>
        </div>

        <PlayerHeaderCard
          player={rightPlayer}
          isKing={overallWinner === 'right'}
          categoryWins={rightCategoryWins}
          side="right"
        />
      </div>

      {/* Centralized 10-Metric Side-by-Side Comparison List */}
      <div className="px-3.5 flex flex-col gap-2">
        {rows.map((row) => {
          const leftWins = row.winner === 'left';
          const rightWins = row.winner === 'right';

          return (
            <div
              key={row.id}
              className="w-full rounded-[12px] bg-[#0F172A] border border-[#1E293B] px-3 py-2.5"
            >
              {/* Centered Metric Category Header */}
              <div className="text-center pb-2 mb-2 border-b border-[#1E293B]/80">
                <div className="text-[11px] font-bold text-[#E2E8F0] leading-tight">
                  {row.titleEn}
                </div>
                <div className="text-[10px] text-[#94A3B8] leading-snug mt-0.5">
                  {row.titleMm}
                </div>
              </div>

              {/* Strictly Aligned Side-by-Side Values */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                {/* Left Side: Tin Moe Hlaing */}
                <div className="flex flex-col items-start text-left min-w-0">
                  <span
                    className={`text-[13px] font-bold tabular-nums leading-snug ${
                      leftWins ? 'text-[#FBBF24]' : 'text-[#CBD5E1]'
                    }`}
                  >
                    {row.leftDisplay}
                  </span>
                  {row.leftSubDisplay && (
                    <span className="text-[10px] text-[#94A3B8] tabular-nums mt-0.5">
                      {row.leftSubDisplay}
                    </span>
                  )}
                </div>

                {/* Center Divider */}
                <div className="h-5 w-[1px] bg-[#1E293B]" aria-hidden="true" />

                {/* Right Side: PHOE CHIT */}
                <div className="flex flex-col items-end text-right min-w-0">
                  <span
                    className={`text-[13px] font-bold tabular-nums leading-snug ${
                      rightWins ? 'text-[#FBBF24]' : 'text-[#CBD5E1]'
                    }`}
                  >
                    {row.rightDisplay}
                  </span>
                  {row.rightSubDisplay && (
                    <span className="text-[10px] text-[#94A3B8] tabular-nums mt-0.5">
                      {row.rightSubDisplay}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Winner Declaration Footer (King Badge) */}
      <div className="px-3.5 mt-4">
        <div className="w-full rounded-[14px] bg-[#111827] border-2 border-[#FBBF24] p-4 flex flex-col items-center text-center">
          <div className="text-[15px] font-extrabold text-[#FBBF24] tracking-tight leading-snug">
            {kingName
              ? `👑 CURRENT KING: ${kingName}`
              : `👑 TIED THRONE: ${leftPlayer.username} & ${rightPlayer.username}`}
          </div>

          <div className="mt-2 pt-2 border-t border-[#1E293B] w-full flex items-center justify-between text-[11px] text-[#CBD5E1] tabular-nums">
            <span>
              {leftPlayer.username}:{' '}
              <strong className="text-[#F8FAFC]">
                {leftPlayer.overallKingScore.toLocaleString('en-US')} pts
              </strong>
            </span>
            <span>
              {rightPlayer.username}:{' '}
              <strong className="text-[#F8FAFC]">
                {rightPlayer.overallKingScore.toLocaleString('en-US')} pts
              </strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeaderboardScreen;
