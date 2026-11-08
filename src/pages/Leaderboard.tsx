import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Star, Crown, Flame, Gamepad2, Loader2 } from 'lucide-react';
import { Page, LeaderboardEntry, User } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, limit, onSnapshot, where } from 'firebase/firestore';
import SafeImage from '../components/SafeImage';

interface LeaderboardProps {
  user?: User | null;
  onPageChange?: (page: Page) => void;
}

interface ExtendedLeaderboardEntry extends LeaderboardEntry {
  performancePoints: number;
}

export default function Leaderboard({ user }: LeaderboardProps) {
  const [period, setPeriod] = useState<'weekly' | 'monthly'>('weekly');
  const [usersData, setUsersData] = useState<any[]>([]);
  const [matchResultsData, setMatchResultsData] = useState<any[]>([]);
  const [matchesData, setMatchesData] = useState<any[]>([]);
  const [winTransactions, setWinTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);

    // 1. Listen to Users collection (User profiles & statistics)
    const usersQuery = query(collection(db, 'users'), limit(200));
    const unsubUsers = onSnapshot(
      usersQuery,
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setUsersData(list);
        setLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'users');
        setLoading(false);
      }
    );

    // 2. Listen to Match Results collection (for period-accurate kills, ranks, and winnings)
    const unsubMatchResults = onSnapshot(
      collection(db, 'matchResults'),
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setMatchResultsData(list);
      },
      () => {}
    );

    // 3. Listen to Matches collection (to count joined matches per player within period)
    const unsubMatches = onSnapshot(
      collection(db, 'matches'),
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setMatchesData(list);
      },
      () => {}
    );

    // 4. Listen to Win Transactions
    const txQuery = query(collection(db, 'transactions'), where('type', '==', 'win'));
    const unsubTx = onSnapshot(
      txQuery,
      (snapshot) => {
        const txs = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setWinTransactions(txs);
      },
      () => {}
    );

    return () => {
      unsubUsers();
      unsubMatchResults();
      unsubMatches();
      unsubTx();
    };
  }, []);

  // Calculate Weekly & Monthly Top 10 Players from Period Match Data + User Statistics
  const topTenPlayers: ExtendedLeaderboardEntry[] = React.useMemo(() => {
    const now = Date.now();
    // Weekly window = 7 days; Monthly window = 30 days
    const windowMs = period === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
    const cutoffTime = now - windowMs;

    const getTimestampMs = (ts: any): number => {
      if (!ts) return 0;
      if (typeof ts?.toMillis === 'function') return ts.toMillis();
      if (typeof ts?.seconds === 'number') return ts.seconds * 1000;
      const parsed = Date.parse(String(ts));
      return Number.isNaN(parsed) ? 0 : parsed;
    };

    // Aggregate period stats strictly from matchResults within Weekly (7d) or Monthly (30d) window
    const periodStatsByUser: Record<
      string,
      { winnings: number; kills: number; matches: number; wins: number; username?: string; ign?: string }
    > = {};

    const ensureUserBucket = (userId: string) => {
      if (!periodStatsByUser[userId]) {
        periodStatsByUser[userId] = { winnings: 0, kills: 0, matches: 0, wins: 0 };
      }
      return periodStatsByUser[userId];
    };

    let hasAnyPeriodMatchResult = false;

    matchResultsData.forEach((mr) => {
      const mrTime = getTimestampMs(mr.createdAt) || now;
      if (mrTime >= cutoffTime && Array.isArray(mr.results)) {
        hasAnyPeriodMatchResult = true;
        mr.results.forEach((r: any) => {
          if (!r?.userId) return;
          const bucket = ensureUserBucket(r.userId);
          bucket.matches += 1;
          bucket.winnings += Number(r.winningAmount || 0);
          if (mr.prizeType === 'perKill') {
            bucket.kills += Number(r.rankOrKills || 0);
            if (Number(r.positionRank) === 1) bucket.wins += 1;
          } else {
            if (Number(r.rankOrKills) === 1) bucket.wins += 1;
          }
          if (r.username) bucket.username = r.username;
          if (r.ign) bucket.ign = r.ign;
        });
      }
    });

    // Also count joined matches from matches collection within the period if not already in matchResults
    const completedMatchIds = new Set(matchResultsData.map((m) => m.id));
    matchesData.forEach((m) => {
      if (completedMatchIds.has(m.id)) return;
      const mTime = getTimestampMs(m.createdAt || m.time) || now;
      if (mTime >= cutoffTime && Array.isArray(m.players)) {
        m.players.forEach((p: any) => {
          if (!p?.userId) return;
          const bucket = ensureUserBucket(p.userId);
          bucket.matches += 1;
          if (p.username) bucket.username = p.username;
          if (p.ign) bucket.ign = p.ign;
        });
      }
    });

    // Aggregate win transactions within period
    const txWinByUser: Record<string, { winnings: number; winCount: number }> = {};
    winTransactions.forEach((tx) => {
      if (tx.status && tx.status !== 'completed') return;
      const txTime = getTimestampMs(tx.createdAt) || now;
      if (txTime >= cutoffTime && tx.userId) {
        if (!txWinByUser[tx.userId]) {
          txWinByUser[tx.userId] = { winnings: 0, winCount: 0 };
        }
        txWinByUser[tx.userId].winnings += Number(tx.amount || 0);
        txWinByUser[tx.userId].winCount += 1;
      }
    });

    // Build map of all known users
    const userMap: Record<string, any> = {};
    usersData.forEach((u) => {
      userMap[u.id] = u;
    });

    if (user?.id && !userMap[user.id]) {
      userMap[user.id] = user;
    }

    Object.entries(periodStatsByUser).forEach(([uid, pStat]) => {
      if (!userMap[uid]) {
        userMap[uid] = {
          id: uid,
          username: pStat.username || 'Arena Player',
          ign: pStat.ign || '',
        };
      }
    });

    const entries: ExtendedLeaderboardEntry[] = [];

    Object.values(userMap).forEach((u: any) => {
      // User's profile statistics (Note: never use u.wallet.winnings as a fallback because wallet balance is not match stats)
      const profileWinnings = Number(u.stats?.totalWinnings ?? u.totalWinnings ?? 0);
      const profileMatches = Number(u.stats?.matchesPlayed ?? u.totalMatches ?? 0);
      const profileKills = Number(u.stats?.totalKills ?? u.totalKills ?? 0);
      const profileWins = Number(u.stats?.totalWins ?? u.totalWins ?? 0);

      // Period-specific stats from user profile if present (e.g. weeklyStats / monthlyStats)
      const periodKey = period === 'weekly' ? 'weeklyStats' : 'monthlyStats';
      const userPeriodStats = u[periodKey] || u.stats?.[period] || null;

      const pBucket = periodStatsByUser[u.id];
      const txBucket = txWinByUser[u.id];

      let winnings = 0;
      let kills = 0;
      let matches = 0;
      let wins = 0;

      if (hasAnyPeriodMatchResult || pBucket || txBucket) {
        // Use period-specific match results & transactions so Weekly (7d) and Monthly (30d) update distinctly
        winnings = Math.max(pBucket?.winnings || 0, txBucket?.winnings || 0, Number(userPeriodStats?.winnings || 0));
        kills = Math.max(pBucket?.kills || 0, Number(userPeriodStats?.kills || 0));
        matches = Math.max(pBucket?.matches || 0, Number(userPeriodStats?.matchesPlayed || 0));
        wins = Math.max(pBucket?.wins || 0, txBucket?.winCount || 0, Number(userPeriodStats?.wins || 0));
      } else {
        // Fallback to user profile stats only if no timestamped matchResults exist yet and user profile updated within period
        const userUpdatedMs = getTimestampMs(u.updatedAt || u.createdAt);
        const withinPeriod = !userUpdatedMs || userUpdatedMs >= cutoffTime;
        if (withinPeriod) {
          winnings = profileWinnings;
          kills = profileKills;
          matches = profileMatches;
          wins = profileWins;
        }
      }

      // STRICT RULE: If a user has played 0 matches OR their winnings, kills, and wins are all 0,
      // do NOT include them in the leaderboard.
      if (matches <= 0 || (winnings <= 0 && kills <= 0 && wins <= 0)) {
        return;
      }

      // Calculate performance score from user's statistics:
      // Winnings (1 pt per ₹1) + Kills (15 pts per kill) + Wins (50 pts per win) + Matches Played (10 pts per match)
      const performancePoints = winnings + kills * 15 + wins * 50 + matches * 10;

      if (performancePoints <= 0) {
        return;
      }

      entries.push({
        id: u.id,
        rank: 0,
        name: u.username || u.name || 'Arena Player',
        ign: u.ign || '',
        avatar: u.avatar || u.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.id}`,
        winnings,
        kills,
        wins,
        matches,
        performancePoints,
      });
    });

    // Sort by performance score first, then winnings, then kills, then matches played
    entries.sort((a, b) => {
      if (b.performancePoints !== a.performancePoints) return b.performancePoints - a.performancePoints;
      if (b.winnings !== a.winnings) return b.winnings - a.winnings;
      if (b.kills !== a.kills) return b.kills - a.kills;
      if ((b.matches || 0) !== (a.matches || 0)) return (b.matches || 0) - (a.matches || 0);
      return a.name.localeCompare(b.name);
    });

    return entries.slice(0, 10).map((entry, idx) => ({
      ...entry,
      rank: idx + 1,
    }));
  }, [usersData, matchResultsData, matchesData, winTransactions, period, user]);

  const topThree = topTenPlayers.slice(0, 3);
  const restOfTopTen = topTenPlayers.slice(3, 10);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-[#f5f4f9] dark:bg-[#050505] text-slate-900 dark:text-white pb-28 transition-colors duration-300 select-none"
    >
      {/* Top Hero Section matching Reference Image */}
      <div className="px-5 pt-9 pb-6 text-center bg-gradient-to-b from-white/50 via-[#f5f4f9] to-[#f5f4f9] dark:from-[#0e0e14] dark:via-[#050505] dark:to-[#050505]">
        {/* ELITE RANKINGS Pill Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[rgba(243,122,32,0.15)] dark:bg-purple-500/15 border border-[#FFE0C2] dark:border-purple-500/30 mb-4 shadow-xs">
          <span className="w-2 h-2 rounded-full bg-[#FF9A4D]" />
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#FF9A4D]">
            ELITE RANKINGS
          </span>
        </div>

        {/* Main Display Title: THE ARENA KINGS */}
        <h1 className="text-3xl sm:text-[34px] font-black italic uppercase tracking-tight leading-none text-slate-900 dark:text-white flex items-center justify-center gap-2 flex-wrap">
          <span>THE</span>
          <span className="relative inline-block text-[#FF9A4D]">
            ARENA
            <span className="block h-[4px] w-full bg-[#FFE0C2] dark:bg-purple-500/40 rounded-full mt-0.5" />
          </span>
          <span>KINGS</span>
        </h1>

        {/* Subtitle: REAL-TIME GLOBAL STANDINGS */}
        <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-slate-400 dark:text-zinc-500 mt-3">
          REAL-TIME GLOBAL STANDINGS
        </p>

        {/* WEEKLY / MONTHLY Segmented Button Bar matching Reference Image */}
        <div className="mt-7 bg-white dark:bg-[#141414] p-2 rounded-[26px] shadow-[0_12px_35px_rgba(15,23,42,0.06)] dark:shadow-none border border-slate-100 dark:border-white/5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPeriod('weekly')}
            className={`flex-1 py-3.5 px-4 rounded-[20px] flex items-center justify-center gap-2.5 text-[11px] font-black uppercase tracking-[0.16em] transition-all cursor-pointer ${
              period === 'weekly'
                ? 'bg-gradient-to-r from-[#F37A1F] to-[#FF9A4D] text-white shadow-[0_8px_22px_rgba(243,122,32,0.38)]'
                : 'bg-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            <Star
              size={14}
              className={
                period === 'weekly'
                  ? 'fill-slate-950 text-slate-950 dark:fill-white dark:text-white'
                  : 'text-slate-400 dark:text-zinc-500'
              }
            />
            <span>WEEKLY</span>
          </button>

          <button
            type="button"
            onClick={() => setPeriod('monthly')}
            className={`flex-1 py-3.5 px-4 rounded-[20px] flex items-center justify-center gap-2.5 text-[11px] font-black uppercase tracking-[0.16em] transition-all cursor-pointer ${
              period === 'monthly'
                ? 'bg-gradient-to-r from-[#F37A1F] to-[#FF9A4D] text-white shadow-[0_8px_22px_rgba(243,122,32,0.38)]'
                : 'bg-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            <Star
              size={14}
              className={
                period === 'monthly'
                  ? 'fill-slate-950 text-slate-950 dark:fill-white dark:text-white'
                  : 'text-slate-400 dark:text-zinc-500'
              }
            />
            <span>MONTHLY</span>
          </button>
        </div>
      </div>

      {/* Main Rankings Content */}
      <div className="px-5 pt-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="w-8 h-8 text-[#FF9A4D] animate-spin" />
            <p className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-[0.2em]">
              CALCULATING ARENA STANDINGS...
            </p>
          </div>
        ) : topTenPlayers.length === 0 ? (
          /* Empty State matching Reference Image */
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="w-24 h-24 rounded-2xl overflow-hidden opacity-25 grayscale mb-6 shadow-xs bg-slate-200 dark:bg-zinc-800">
              <SafeImage
                src="https://i.ibb.co/n8jPYbMP/image.png"
                alt="Arena"
                className="w-full h-full object-cover"
              />
            </div>
            <h3 className="text-lg font-black italic uppercase tracking-tight text-slate-400 dark:text-zinc-500">
              NO RANKINGS YET
            </h3>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-300 dark:text-zinc-600 mt-1.5">
              BE THE FIRST TO DOMINATE THE ARENA
            </p>
          </motion.div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={period}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* Top 3 Podium Cards */}
              <div className="grid grid-cols-3 gap-3 items-end pt-3">
                {/* #2 Runner Up */}
                {topThree[1] ? (
                  <div className="bg-white dark:bg-[#141414] rounded-[26px] p-4 flex flex-col items-center text-center border border-slate-100 dark:border-white/5 shadow-[0_10px_28px_rgba(15,23,42,0.04)] relative">
                    <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 text-[10px] font-black italic flex items-center justify-center mb-2">
                      #2
                    </div>
                    <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-slate-200 dark:border-zinc-700 mb-2.5 bg-slate-50 dark:bg-zinc-900">
                      <SafeImage
                        src={topThree[1].avatar}
                        alt={topThree[1].name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <p className="text-[11px] font-black italic uppercase tracking-tight text-slate-900 dark:text-white truncate w-full">
                      {topThree[1].name}
                    </p>
                    <p className="text-xs font-black italic text-[#FF9A4D] mt-1">
                      ₹{topThree[1].winnings.toLocaleString()}
                    </p>
                    <p className="text-[8px] font-extrabold uppercase tracking-[0.14em] text-slate-400 dark:text-zinc-500 mt-0.5">
                      {topThree[1].kills} Kills • {topThree[1].matches || 0}M
                    </p>
                  </div>
                ) : (
                  <div />
                )}

                {/* #1 Arena King */}
                {topThree[0] ? (
                  <div className="bg-[#141414] rounded-[28px] p-4 sm:p-5 flex flex-col items-center text-center border-2 border-[#FF9A4D]/60 shadow-[0_14px_35px_rgba(255,154,77,0.16)] relative -translate-y-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-r from-[#F37A1F] to-[#FF9A4D] text-white text-[11px] font-black flex items-center justify-center mb-2 shadow-md">
                      <Crown className="w-4 h-4" />
                    </div>
                    <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-[#FF9A4D] mb-2.5 bg-purple-50 dark:bg-zinc-900">
                      <SafeImage
                        src={topThree[0].avatar}
                        alt={topThree[0].name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <p className="text-xs font-black italic uppercase tracking-tight text-slate-900 dark:text-white truncate w-full">
                      {topThree[0].name}
                    </p>
                    <p className="text-sm font-black italic text-[#F37A1F] dark:text-[#FF9A4D] mt-1">
                      ₹{topThree[0].winnings.toLocaleString()}
                    </p>
                    <p className="text-[8px] font-extrabold uppercase tracking-[0.14em] text-slate-400 dark:text-zinc-500 mt-0.5">
                      {topThree[0].kills} Kills • {topThree[0].matches || 0}M
                    </p>
                  </div>
                ) : (
                  <div />
                )}

                {/* #3 Third Place */}
                {topThree[2] ? (
                  <div className="bg-white dark:bg-[#141414] rounded-[26px] p-4 flex flex-col items-center text-center border border-slate-100 dark:border-white/5 shadow-[0_10px_28px_rgba(15,23,42,0.04)] relative">
                    <div className="w-6 h-6 rounded-full bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-black italic flex items-center justify-center mb-2">
                      #3
                    </div>
                    <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-amber-200 dark:border-amber-500/30 mb-2.5 bg-slate-50 dark:bg-zinc-900">
                      <SafeImage
                        src={topThree[2].avatar}
                        alt={topThree[2].name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <p className="text-[11px] font-black italic uppercase tracking-tight text-slate-900 dark:text-white truncate w-full">
                      {topThree[2].name}
                    </p>
                    <p className="text-xs font-black italic text-amber-500 mt-1">
                      ₹{topThree[2].winnings.toLocaleString()}
                    </p>
                    <p className="text-[8px] font-extrabold uppercase tracking-[0.14em] text-slate-400 dark:text-zinc-500 mt-0.5">
                      {topThree[2].kills} Kills • {topThree[2].matches || 0}M
                    </p>
                  </div>
                ) : (
                  <div />
                )}
              </div>

              {/* Ranks #4 - #10 List Cards */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-500">
                    TOP 10 {period === 'weekly' ? 'WEEKLY' : 'MONTHLY'} STANDINGS
                  </span>
                  <span className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#FF9A4D]">
                    {topTenPlayers.length} / 10 PLAYERS
                  </span>
                </div>

                {(restOfTopTen.length > 0 ? restOfTopTen : topTenPlayers).map((player) => {
                  const isCurrentUser = Boolean(user && player.id === user.id);
                  return (
                    <div
                      key={player.id}
                      className={`rounded-[24px] p-4 flex items-center justify-between border transition-all ${
                        isCurrentUser
                          ? 'bg-purple-50/80 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/30 shadow-sm'
                          : 'bg-white dark:bg-[#141414] border-slate-100 dark:border-white/5 shadow-[0_8px_25px_rgba(15,23,42,0.03)]'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-zinc-900 flex items-center justify-center shrink-0">
                          <span className="text-xs font-black italic text-slate-600 dark:text-zinc-400">
                            #{player.rank}
                          </span>
                        </div>
                        <div className="w-11 h-11 rounded-2xl overflow-hidden bg-slate-100 dark:bg-zinc-800 border border-slate-200/80 dark:border-white/10 shrink-0">
                          <SafeImage
                            src={player.avatar}
                            alt={player.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-black italic uppercase tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5 truncate">
                            <span className="truncate">{player.name}</span>
                            {isCurrentUser && (
                              <span className="px-2 py-0.5 rounded-full bg-[#FF9A4D] text-white text-[8px] font-black uppercase tracking-widest shrink-0">
                                YOU
                              </span>
                            )}
                          </h4>
                          <div className="flex items-center gap-2 text-[9px] font-extrabold text-slate-400 dark:text-zinc-500 uppercase tracking-[0.14em] mt-0.5">
                            <span className="flex items-center gap-1">
                              <Gamepad2 size={10} className="text-[#FF9A4D]" />
                              {player.matches || 0} Matches
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Flame size={10} className="text-orange-500" />
                              {player.kills} Kills
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0 pl-2">
                        <p className="text-sm font-black italic text-slate-900 dark:text-white tabular-nums">
                          ₹{player.winnings.toLocaleString()}
                        </p>
                        <p className="text-[8px] font-black uppercase tracking-[0.16em] text-[#FF9A4D] mt-0.5">
                          {player.performancePoints} PTS
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
}
