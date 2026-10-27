import { useState, useEffect, useMemo } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  DocumentData,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  ShopItem,
  DEFAULT_SHOP_CATALOG,
  normalizeHomeSlots,
  normalizeVaultSlots,
  enforceUniquePlacements,
  findEquippedFrameItem,
} from './shopCatalog';

export const LEFT_PLAYER_ID = 'user_tin_moe_hlaing';
export const RIGHT_PLAYER_ID = 'user_phoe_chit';

export interface LevelProgressEntry {
  levelNumber: number;
  status: string;
  score: number;
  time_seconds: number;
  moves_count: number;
  restarts_count: number;
  gold: number;
  gems: number;
  stars: number;
}

export interface PlayerHeadToHeadStats {
  userId: string;
  username: string;
  current_level: number;
  total_stars: number;
  lifetime_gold_earned: number;
  lifetime_gems_earned: number;
  total_score: number;
  forfeited_matches: number;
  total_matches_played: number;
  completed_matches_count: number;
  owned_items_count: number;
  owned_items_gold_value: number;
  owned_items_gems_value: number;
  owned_items_total_value_score: number; // Normalized Gold-equivalent valuation for objective comparison
  high_score: number;
  best_time_seconds: number | null;
  best_moves_count: number | null;
  best_time_or_moves_label: string;
  equippedFrame: ShopItem | null;
  homeSlots: (string | null)[];
  overallKingScore: number;
}

export type RowWinner = 'left' | 'right' | 'tie';

export interface ComparisonMetricRow {
  id: string;
  titleEn: string;
  titleMm: string;
  leftDisplay: string;
  leftSubDisplay?: string;
  rightDisplay: string;
  rightSubDisplay?: string;
  winner: RowWinner;
}

function formatMMSS(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Pure, 100% symmetric and unbiased calculation of a player's live stats
 * from their Firestore `users/{userId}` document, `level_progress` subcollection,
 * and `shop_items` catalog.
 */
function buildPlayerStats(
  userId: string,
  fallbackName: string,
  userData: DocumentData | null,
  progressEntries: LevelProgressEntry[],
  catalogMap: Record<string, ShopItem>
): PlayerHeadToHeadStats {
  const data = userData || {};
  const username =
    typeof data.username === 'string' && data.username.trim()
      ? data.username.trim()
      : fallbackName;

  // 1. Owned inventory & item valuation
  const rawInv = Array.isArray(data.vault_inventory)
    ? data.vault_inventory
    : Array.isArray(data.showcase_data?.vault_inventory)
    ? data.showcase_data.vault_inventory
    : [];
  const uniqueOwnedIds = Array.from(
    new Set<string>(
      (rawInv as unknown[]).filter(
        (x: unknown): x is string => typeof x === 'string' && x.length > 0
      )
    )
  );

  let ownedStarItemsCount = 0;
  let ownedGoldValue = 0;
  let ownedGemsValue = 0;

  for (const itemId of uniqueOwnedIds) {
    const item = catalogMap[itemId];
    if (item) {
      if (item.category === 'star') {
        ownedStarItemsCount++;
      }
      ownedGoldValue += Number(item.price_gold) || 0;
      ownedGemsValue += Number(item.price_gems) || 0;
    }
  }

  // Equipped Frame resolution
  const dedupedSlots = enforceUniquePlacements(
    normalizeHomeSlots(data.home_slots ?? data.showcase_data?.home_slots),
    normalizeVaultSlots(
      data.equipped_vault_slots ?? data.showcase_data?.equipped_vault_slots
    )
  );
  const equippedFrame = findEquippedFrameItem(
    dedupedSlots.homeSlots,
    dedupedSlots.vaultSlots,
    catalogMap
  );

  // 2. Aggregate metrics from `level_progress` subcollection
  let maxProgressStage = 1;
  let progressStarsSum = 0;
  let progressGoldSum = 0;
  let progressGemsSum = 0;
  let progressScoreSum = 0;
  let progressCompletedCount = 0;
  let progressForfeitedCount = 0;
  let progressHighScore = 0;
  let fastestTimeSec: number | null = null;
  let fewestMovesOnCompleted: number | null = null;

  for (const entry of progressEntries) {
    if (entry.status === 'completed') {
      progressCompletedCount++;
      maxProgressStage = Math.max(
        maxProgressStage,
        entry.levelNumber < 600 ? entry.levelNumber + 1 : 600
      );
      progressScoreSum += entry.score;
      progressGoldSum += entry.gold;
      progressGemsSum += entry.gems;
      progressStarsSum += entry.stars;
      if (entry.score > progressHighScore) {
        progressHighScore = entry.score;
      }
      if (entry.time_seconds > 0) {
        if (fastestTimeSec === null || entry.time_seconds < fastestTimeSec) {
          fastestTimeSec = entry.time_seconds;
        }
      }
      if (entry.moves_count > 0) {
        if (
          fewestMovesOnCompleted === null ||
          entry.moves_count < fewestMovesOnCompleted
        ) {
          fewestMovesOnCompleted = entry.moves_count;
        }
      }
    } else if (entry.status === 'given_up') {
      progressForfeitedCount++;
      maxProgressStage = Math.max(
        maxProgressStage,
        entry.levelNumber < 600 ? entry.levelNumber + 1 : 600
      );
    } else if (entry.status === 'unlocked') {
      maxProgressStage = Math.max(maxProgressStage, entry.levelNumber);
    }
  }

  // 3. Combine live `users/{userId}` cumulative fields with `level_progress` aggregates
  const docLevel =
    Number(
      data.current_level ?? data.unlocked_level ?? data.highest_level_unlocked ?? 1
    ) || 1;
  const current_level = Math.max(1, docLevel, maxProgressStage);

  const docStars = Number(data.total_stars ?? 0) || 0;
  const total_stars = Math.max(docStars, ownedStarItemsCount + progressStarsSum);

  const docLifetimeGold = Number(data.lifetime_gold_earned ?? 0) || 0;
  const lifetime_gold_earned = Math.max(docLifetimeGold, progressGoldSum);

  const docLifetimeGems = Number(data.lifetime_gems_earned ?? 0) || 0;
  const lifetime_gems_earned = Math.max(docLifetimeGems, progressGemsSum);

  const docTotalScore = Number(data.total_score ?? 0) || 0;
  const total_score = Math.max(docTotalScore, progressScoreSum);

  const docForfeits = Number(data.forfeited_matches ?? 0) || 0;
  const forfeited_matches = Math.max(docForfeits, progressForfeitedCount);

  const docMatchesPlayed = Number(data.total_matches_played ?? 0) || 0;
  const total_matches_played = Math.max(
    docMatchesPlayed,
    progressCompletedCount + progressForfeitedCount
  );

  const owned_items_count = Math.max(
    Number(data.owned_items_count ?? 0) || 0,
    uniqueOwnedIds.length
  );

  // Shop valuation ratio: 1 Gem = 250 Gold equivalent
  const owned_items_total_value_score = ownedGoldValue + ownedGemsValue * 250;

  const docHighScore = Number(data.high_score ?? 0) || 0;
  const high_score = Math.max(docHighScore, progressHighScore);

  const docBestTime =
    typeof data.best_time_seconds === 'number' && data.best_time_seconds > 0
      ? data.best_time_seconds
      : null;
  const docBestMoves =
    typeof data.best_moves_count === 'number' && data.best_moves_count > 0
      ? data.best_moves_count
      : null;

  const best_time_seconds =
    docBestTime !== null && fastestTimeSec !== null
      ? Math.min(docBestTime, fastestTimeSec)
      : docBestTime ?? fastestTimeSec;

  const best_moves_count =
    docBestMoves !== null && fewestMovesOnCompleted !== null
      ? Math.min(docBestMoves, fewestMovesOnCompleted)
      : docBestMoves ?? fewestMovesOnCompleted;

  const best_time_or_moves_label =
    best_time_seconds !== null && best_moves_count !== null
      ? `${formatMMSS(best_time_seconds)} / ${best_moves_count} Moves`
      : best_time_seconds !== null
      ? formatMMSS(best_time_seconds)
      : '—';

  // 4. Objective, Fair Weighted Overall Evaluation Score (identical formula for both players)
  const rawOverallScore =
    total_score * 1.0 +
    (current_level - 1) * 500 +
    high_score * 0.5 +
    total_stars * 300 +
    lifetime_gold_earned * 1.0 +
    lifetime_gems_earned * 100 +
    owned_items_count * 200 +
    Math.floor(owned_items_total_value_score * 0.05) +
    progressCompletedCount * 150 -
    forfeited_matches * 100;

  const overallKingScore = Math.max(0, Math.round(rawOverallScore));

  return {
    userId,
    username,
    current_level,
    total_stars,
    lifetime_gold_earned,
    lifetime_gems_earned,
    total_score,
    forfeited_matches,
    total_matches_played,
    completed_matches_count: progressCompletedCount,
    owned_items_count,
    owned_items_gold_value: ownedGoldValue,
    owned_items_gems_value: ownedGemsValue,
    owned_items_total_value_score,
    high_score,
    best_time_seconds,
    best_moves_count,
    best_time_or_moves_label,
    equippedFrame,
    homeSlots: dedupedSlots.homeSlots,
    overallKingScore,
  };
}

function compareHigherBetter(leftVal: number, rightVal: number): RowWinner {
  if (leftVal > rightVal) return 'left';
  if (rightVal > leftVal) return 'right';
  return 'tie';
}

function parseProgressDocs(docs: { id: string; data: () => DocumentData }[]): LevelProgressEntry[] {
  const entries: LevelProgressEntry[] = [];
  for (const d of docs) {
    if (!d.id.startsWith('level_')) continue;
    const lvlNum = parseInt(d.id.replace('level_', ''), 10);
    if (isNaN(lvlNum)) continue;
    const raw = d.data();
    entries.push({
      levelNumber: lvlNum,
      status: String(raw.status || 'locked'),
      score: Math.max(0, Number(raw.score) || 0),
      time_seconds: Math.max(0, Number(raw.time_seconds) || 0),
      moves_count: Math.max(0, Number(raw.moves_count) || 0),
      restarts_count: Math.max(0, Number(raw.restarts_count) || 0),
      gold: Math.max(0, Number(raw.gold) || 0),
      gems: Math.max(0, Number(raw.gems) || 0),
      stars: Math.max(0, Number(raw.stars) || 0),
    });
  }
  return entries;
}

export interface HeadToHeadLeaderboardState {
  leftPlayer: PlayerHeadToHeadStats;
  rightPlayer: PlayerHeadToHeadStats;
  rows: ComparisonMetricRow[];
  leftCategoryWins: number;
  rightCategoryWins: number;
  overallWinner: 'left' | 'right' | 'tie';
  kingName: string | null;
  isLoading: boolean;
}

/**
 * Real-time Firestore Head-to-Head Leaderboard subscription for:
 * Left: Tin Moe Hlaing (`user_tin_moe_hlaing`)
 * Right: PHOE CHIT (`user_phoe_chit`)
 */
export function useHeadToHeadLeaderboard(): HeadToHeadLeaderboardState {
  const [catalog, setCatalog] = useState<ShopItem[]>(DEFAULT_SHOP_CATALOG);
  const [leftUserDoc, setLeftUserDoc] = useState<DocumentData | null>(null);
  const [rightUserDoc, setRightUserDoc] = useState<DocumentData | null>(null);
  const [leftProgress, setLeftProgress] = useState<LevelProgressEntry[]>([]);
  const [rightProgress, setRightProgress] = useState<LevelProgressEntry[]>([]);
  const [loadedFlags, setLoadedFlags] = useState({
    leftUser: false,
    rightUser: false,
    leftProg: false,
    rightProg: false,
  });

  useEffect(() => {
    const unsubShop = onSnapshot(
      collection(db, 'shop_items'),
      (snap) => {
        if (snap.empty) return;
        const remoteMap = new Map<string, Partial<ShopItem>>();
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          const id = String(d.item_id || docSnap.id);
          remoteMap.set(id, {
            item_id: id,
            item_name: typeof d.item_name === 'string' ? d.item_name : undefined,
            category: d.category,
            tier: d.tier,
            price_gold: typeof d.price_gold === 'number' ? d.price_gold : undefined,
            price_gems: typeof d.price_gems === 'number' ? d.price_gems : undefined,
            image_url: typeof d.image_url === 'string' ? d.image_url : undefined,
          });
        });

        const merged = DEFAULT_SHOP_CATALOG.map((seed) => {
          const r = remoteMap.get(seed.item_id);
          if (!r) return seed;
          const rGold = r.price_gold ?? seed.price_gold;
          const rGems = r.price_gems ?? seed.price_gems;
          return {
            ...seed,
            item_name: r.item_name || seed.item_name,
            category: r.category || seed.category,
            tier: r.tier || seed.tier,
            price_gold: rGold > 0 || rGems > 0 ? rGold : seed.price_gold,
            price_gems: rGold > 0 || rGems > 0 ? rGems : seed.price_gems,
            image_url: r.image_url || seed.image_url,
          };
        });
        setCatalog(merged);
      },
      () => {}
    );

    const unsubLeftUser = onSnapshot(
      doc(db, 'users', LEFT_PLAYER_ID),
      (snap) => {
        setLeftUserDoc(snap.exists() ? snap.data() : null);
        setLoadedFlags((prev) => ({ ...prev, leftUser: true }));
      },
      () => {
        setLoadedFlags((prev) => ({ ...prev, leftUser: true }));
      }
    );

    const unsubRightUser = onSnapshot(
      doc(db, 'users', RIGHT_PLAYER_ID),
      (snap) => {
        setRightUserDoc(snap.exists() ? snap.data() : null);
        setLoadedFlags((prev) => ({ ...prev, rightUser: true }));
      },
      () => {
        setLoadedFlags((prev) => ({ ...prev, rightUser: true }));
      }
    );

    const leftProgQuery = query(
      collection(db, 'users', LEFT_PLAYER_ID, 'level_progress'),
      where('status', '!=', 'locked')
    );
    const unsubLeftProg = onSnapshot(
      leftProgQuery,
      (snap) => {
        setLeftProgress(parseProgressDocs(snap.docs));
        setLoadedFlags((prev) => ({ ...prev, leftProg: true }));
      },
      () => {
        setLoadedFlags((prev) => ({ ...prev, leftProg: true }));
      }
    );

    const rightProgQuery = query(
      collection(db, 'users', RIGHT_PLAYER_ID, 'level_progress'),
      where('status', '!=', 'locked')
    );
    const unsubRightProg = onSnapshot(
      rightProgQuery,
      (snap) => {
        setRightProgress(parseProgressDocs(snap.docs));
        setLoadedFlags((prev) => ({ ...prev, rightProg: true }));
      },
      () => {
        setLoadedFlags((prev) => ({ ...prev, rightProg: true }));
      }
    );

    return () => {
      unsubShop();
      unsubLeftUser();
      unsubRightUser();
      unsubLeftProg();
      unsubRightProg();
    };
  }, []);

  const catalogMap = useMemo(() => {
    const map: Record<string, ShopItem> = {};
    for (const item of catalog) {
      map[item.item_id] = item;
    }
    return map;
  }, [catalog]);

  const leftPlayer = useMemo(
    () =>
      buildPlayerStats(
        LEFT_PLAYER_ID,
        'Tin Moe Hlaing',
        leftUserDoc,
        leftProgress,
        catalogMap
      ),
    [leftUserDoc, leftProgress, catalogMap]
  );

  const rightPlayer = useMemo(
    () =>
      buildPlayerStats(
        RIGHT_PLAYER_ID,
        'PHOE CHIT',
        rightUserDoc,
        rightProgress,
        catalogMap
      ),
    [rightUserDoc, rightProgress, catalogMap]
  );

  const rows: ComparisonMetricRow[] = useMemo(() => {
    // Best Time / Moves comparison: having a completed record beats having none; faster time (then fewer moves) wins
    let bestRecordWinner: RowWinner = 'tie';
    if (leftPlayer.best_time_seconds !== null && rightPlayer.best_time_seconds === null) {
      bestRecordWinner = 'left';
    } else if (rightPlayer.best_time_seconds !== null && leftPlayer.best_time_seconds === null) {
      bestRecordWinner = 'right';
    } else if (
      leftPlayer.best_time_seconds !== null &&
      rightPlayer.best_time_seconds !== null
    ) {
      if (leftPlayer.best_time_seconds < rightPlayer.best_time_seconds) {
        bestRecordWinner = 'left';
      } else if (rightPlayer.best_time_seconds < leftPlayer.best_time_seconds) {
        bestRecordWinner = 'right';
      } else if (
        leftPlayer.best_moves_count !== null &&
        rightPlayer.best_moves_count !== null
      ) {
        if (leftPlayer.best_moves_count < rightPlayer.best_moves_count) {
          bestRecordWinner = 'left';
        } else if (rightPlayer.best_moves_count < leftPlayer.best_moves_count) {
          bestRecordWinner = 'right';
        }
      }
    }

    // Forfeited matches comparison: fewer forfeits wins ONLY when at least one match has been played
    let forfeitWinner: RowWinner = 'tie';
    if (leftPlayer.total_matches_played > 0 || rightPlayer.total_matches_played > 0) {
      if (leftPlayer.forfeited_matches < rightPlayer.forfeited_matches) {
        forfeitWinner = 'left';
      } else if (rightPlayer.forfeited_matches < leftPlayer.forfeited_matches) {
        forfeitWinner = 'right';
      }
    }

    // Owned Items Count & Value comparison
    let ownedWinner: RowWinner = compareHigherBetter(
      leftPlayer.owned_items_count,
      rightPlayer.owned_items_count
    );
    if (ownedWinner === 'tie') {
      ownedWinner = compareHigherBetter(
        leftPlayer.owned_items_total_value_score,
        rightPlayer.owned_items_total_value_score
      );
    }

    return [
      {
        id: 'current_level',
        titleEn: 'Current Level / Stage',
        titleMm: 'ရောက်ရှိနေသော အဆင့်',
        leftDisplay: `Level ${leftPlayer.current_level.toLocaleString('en-US')}`,
        rightDisplay: `Level ${rightPlayer.current_level.toLocaleString('en-US')}`,
        winner: compareHigherBetter(leftPlayer.current_level, rightPlayer.current_level),
      },
      {
        id: 'total_stars',
        titleEn: 'Total Stars Collected',
        titleMm: 'စုဆောင်းရရှိထားသော ကြယ်စုစုပေါင်း',
        leftDisplay: `⭐ ${leftPlayer.total_stars.toLocaleString('en-US')}`,
        rightDisplay: `⭐ ${rightPlayer.total_stars.toLocaleString('en-US')}`,
        winner: compareHigherBetter(leftPlayer.total_stars, rightPlayer.total_stars),
      },
      {
        id: 'lifetime_gold_earned',
        titleEn: 'Total Gold Earned (Lifetime)',
        titleMm: 'ဂိမ်းစဆော့ထဲက ရရှိခဲ့သမျှ ရွှေစုစုပေါင်း',
        leftDisplay: `🪙 ${leftPlayer.lifetime_gold_earned.toLocaleString('en-US')}`,
        rightDisplay: `🪙 ${rightPlayer.lifetime_gold_earned.toLocaleString('en-US')}`,
        winner: compareHigherBetter(
          leftPlayer.lifetime_gold_earned,
          rightPlayer.lifetime_gold_earned
        ),
      },
      {
        id: 'lifetime_gems_earned',
        titleEn: 'Total Gems Earned (Lifetime)',
        titleMm: 'ဂိမ်းစဆော့ထဲက ရရှိခဲ့သမျှ စိန်စုစုပေါင်း',
        leftDisplay: `💎 ${leftPlayer.lifetime_gems_earned.toLocaleString('en-US')}`,
        rightDisplay: `💎 ${rightPlayer.lifetime_gems_earned.toLocaleString('en-US')}`,
        winner: compareHigherBetter(
          leftPlayer.lifetime_gems_earned,
          rightPlayer.lifetime_gems_earned
        ),
      },
      {
        id: 'total_score',
        titleEn: 'Total Score',
        titleMm: 'ရမှတ်စုစုပေါင်း',
        leftDisplay: leftPlayer.total_score.toLocaleString('en-US'),
        rightDisplay: rightPlayer.total_score.toLocaleString('en-US'),
        winner: compareHigherBetter(leftPlayer.total_score, rightPlayer.total_score),
      },
      {
        id: 'forfeited_matches',
        titleEn: 'Forfeited Matches',
        titleMm: 'အရှုံးပေးခဲ့တဲ့ပွဲပေါင်း',
        leftDisplay: leftPlayer.forfeited_matches.toLocaleString('en-US'),
        rightDisplay: rightPlayer.forfeited_matches.toLocaleString('en-US'),
        winner: forfeitWinner,
      },
      {
        id: 'total_matches_played',
        titleEn: 'Total Matches Played',
        titleMm: 'ဆော့ကစားခဲ့သည့် ပွဲစုစုပေါင်း',
        leftDisplay: leftPlayer.total_matches_played.toLocaleString('en-US'),
        rightDisplay: rightPlayer.total_matches_played.toLocaleString('en-US'),
        winner: compareHigherBetter(
          leftPlayer.total_matches_played,
          rightPlayer.total_matches_played
        ),
      },
      {
        id: 'owned_items',
        titleEn: 'Owned Items & Total Value',
        titleMm: 'ပိုင်ဆိုင်ထားသည့် items အရေအတွက်နှင့် တန်ဖိုး',
        leftDisplay: `${leftPlayer.owned_items_count.toLocaleString('en-US')} Items`,
        leftSubDisplay: `🪙 ${leftPlayer.owned_items_gold_value.toLocaleString(
          'en-US'
        )} · 💎 ${leftPlayer.owned_items_gems_value.toLocaleString('en-US')}`,
        rightDisplay: `${rightPlayer.owned_items_count.toLocaleString('en-US')} Items`,
        rightSubDisplay: `🪙 ${rightPlayer.owned_items_gold_value.toLocaleString(
          'en-US'
        )} · 💎 ${rightPlayer.owned_items_gems_value.toLocaleString('en-US')}`,
        winner: ownedWinner,
      },
      {
        id: 'high_score',
        titleEn: 'Best Record / High Score',
        titleMm: 'စံချိန်တင်ရမှတ်',
        leftDisplay: leftPlayer.high_score.toLocaleString('en-US'),
        rightDisplay: rightPlayer.high_score.toLocaleString('en-US'),
        winner: compareHigherBetter(leftPlayer.high_score, rightPlayer.high_score),
      },
      {
        id: 'best_time_or_moves',
        titleEn: 'Best Time / Moves',
        titleMm: 'စံချိန်တင် အချိန် / Move',
        leftDisplay: leftPlayer.best_time_or_moves_label,
        rightDisplay: rightPlayer.best_time_or_moves_label,
        winner: bestRecordWinner,
      },
    ];
  }, [leftPlayer, rightPlayer]);

  let leftCategoryWins = 0;
  let rightCategoryWins = 0;
  for (const row of rows) {
    if (row.winner === 'left') leftCategoryWins++;
    else if (row.winner === 'right') rightCategoryWins++;
  }

  let overallWinner: RowWinner = 'tie';
  if (leftPlayer.overallKingScore > rightPlayer.overallKingScore) {
    overallWinner = 'left';
  } else if (rightPlayer.overallKingScore > leftPlayer.overallKingScore) {
    overallWinner = 'right';
  } else if (leftCategoryWins > rightCategoryWins) {
    overallWinner = 'left';
  } else if (rightCategoryWins > leftCategoryWins) {
    overallWinner = 'right';
  }

  const kingName =
    overallWinner === 'left'
      ? leftPlayer.username
      : overallWinner === 'right'
      ? rightPlayer.username
      : null;

  const isLoading =
    !loadedFlags.leftUser ||
    !loadedFlags.rightUser ||
    !loadedFlags.leftProg ||
    !loadedFlags.rightProg;

  return {
    leftPlayer,
    rightPlayer,
    rows,
    leftCategoryWins,
    rightCategoryWins,
    overallWinner,
    kingName,
    isLoading,
  };
}
